import { EventEmitter } from 'events';
import { SorobanDeploymentVerifier } from '../verification/soroban-deployment-verifier';
import { contractKey } from '../../security/contracts/fingerprints/deployment-fingerprint';
import {
  DeploymentObservation,
  FingerprintNetwork,
  VerificationResult,
  VerificationStatus,
} from '../../security/contracts/fingerprints/types';
import { SorobanUpgradeDetector } from '../../security/contracts/upgrades/soroban/soroban-upgrade-detector';
import { severityRank } from '../../security/contracts/upgrades/soroban/soroban-upgrade-detector';
import {
  IntegrationReviewFlag,
  UpgradeEvent,
  UpgradeSeverity,
} from '../../security/contracts/upgrades/soroban/types';

/** Reads the current on-chain state of one contract. */
export type DeploymentProbe = () => Promise<DeploymentObservation>;

export interface MonitoredContractInput {
  contractAddress: string;
  network: FingerprintNetwork;
  probe: DeploymentProbe;
  integrations?: string[];
  label?: string;
  baseline?: DeploymentObservation;
}

/** A monitoring sink — PagerDuty, a webhook, an internal alert bus. */
export type UpgradeNotifier = (
  notification: UpgradeNotification,
) => void | Promise<void>;

export interface UpgradeNotification {
  event: UpgradeEvent;
  verification?: VerificationResult;
  affectedIntegrations: string[];
  message: string;
}

export interface ContractUpgradeMonitorConfig {
  checkIntervalMs?: number;
  /** Probes slower than this are treated as failures. Default 10s. */
  probeTimeoutMs?: number;
  /** Severity at or above which `severe-upgrade` fires. Default MAJOR. */
  alertSeverity?: UpgradeSeverity;
}

export interface CheckResult {
  contractAddress: string;
  network: FingerprintNetwork;
  observed?: DeploymentObservation;
  upgrade: UpgradeEvent | null;
  verification?: VerificationResult;
  error?: string;
}

/**
 * Watches configured Soroban contracts for upgrades and tells the monitoring
 * services about them.
 *
 * The monitor owns scheduling and fan-out only; what counts as an upgrade
 * lives in `SorobanUpgradeDetector`, and what counts as approved lives in the
 * fingerprint store.
 */
export class ContractUpgradeMonitor extends EventEmitter {
  private readonly probes = new Map<string, MonitoredContractInput>();
  private readonly notifiers: UpgradeNotifier[] = [];
  private readonly config: Required<ContractUpgradeMonitorConfig>;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly detector: SorobanUpgradeDetector = new SorobanUpgradeDetector(),
    private readonly verifier?: SorobanDeploymentVerifier,
    config: ContractUpgradeMonitorConfig = {},
  ) {
    super();
    this.config = {
      checkIntervalMs: config.checkIntervalMs ?? 60_000,
      probeTimeoutMs: config.probeTimeoutMs ?? 10_000,
      alertSeverity: config.alertSeverity ?? UpgradeSeverity.MAJOR,
    };
  }

  registerContract(input: MonitoredContractInput): void {
    this.probes.set(contractKey(input.contractAddress, input.network), input);
    this.detector.register({
      contractAddress: input.contractAddress,
      network: input.network,
      integrations: input.integrations,
      label: input.label,
      baseline: input.baseline,
    });
  }

  unregisterContract(
    contractAddress: string,
    network: FingerprintNetwork,
  ): boolean {
    return this.probes.delete(contractKey(contractAddress, network));
  }

  addNotifier(notifier: UpgradeNotifier): void {
    this.notifiers.push(notifier);
  }

  getMonitoredContracts(): MonitoredContractInput[] {
    return [...this.probes.values()];
  }

  async check(
    contractAddress: string,
    network: FingerprintNetwork,
    now: number = Date.now(),
  ): Promise<CheckResult> {
    const monitored = this.probes.get(contractKey(contractAddress, network));

    if (!monitored) {
      throw new Error(
        `Contract ${contractAddress} on ${network} is not monitored`,
      );
    }

    return this.runProbe(monitored, now);
  }

  async checkAll(now: number = Date.now()): Promise<CheckResult[]> {
    const results = await Promise.all(
      [...this.probes.values()].map((monitored) =>
        this.runProbe(monitored, now),
      ),
    );

    this.emit('check-complete', results);

    return results;
  }

  private async runProbe(
    monitored: MonitoredContractInput,
    now: number,
  ): Promise<CheckResult> {
    let observation: DeploymentObservation;

    try {
      observation = await this.withTimeout(monitored.probe(), monitored);
    } catch (error) {
      const message = messageOf(error);

      // A probe failure is not an upgrade: leaving the tracked state alone
      // means an unreachable node cannot look like a rollback.
      this.emit('probe-error', {
        contractAddress: monitored.contractAddress,
        network: monitored.network,
        error: message,
      });

      return {
        contractAddress: monitored.contractAddress,
        network: monitored.network,
        upgrade: null,
        error: message,
      };
    }

    const verification = this.verifier?.verify(observation, now);

    if (verification && verification.status !== VerificationStatus.APPROVED) {
      this.emit('unapproved-deployment', verification);
    }

    const upgrade = this.detector.observe(observation, now);

    if (upgrade) {
      this.emit('upgrade', upgrade);

      if (
        severityRank(upgrade.severity) >=
        severityRank(this.config.alertSeverity)
      ) {
        this.emit('severe-upgrade', upgrade);
      }

      await this.notify(upgrade, verification);
    }

    return {
      contractAddress: monitored.contractAddress,
      network: monitored.network,
      observed: observation,
      upgrade,
      verification,
    };
  }

  /**
   * A hung probe would otherwise stall every later check on the interval, so
   * the wait is bounded and a timeout is reported as a probe failure.
   */
  private withTimeout(
    promise: Promise<DeploymentObservation>,
    monitored: MonitoredContractInput,
  ): Promise<DeploymentObservation> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Probe for ${monitored.contractAddress} timed out after ${this.config.probeTimeoutMs}ms`,
          ),
        );
      }, this.config.probeTimeoutMs);

      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Fan the upgrade out to the monitoring sinks.
   *
   * One sink throwing must not stop the others, and must not stop the check
   * loop — a broken webhook is the worst possible reason to stop noticing
   * contract upgrades.
   */
  private async notify(
    event: UpgradeEvent,
    verification?: VerificationResult,
  ): Promise<void> {
    const notification: UpgradeNotification = {
      event,
      verification,
      affectedIntegrations: event.affectedIntegrations,
      message: describeUpgrade(event),
    };

    for (const notifier of this.notifiers) {
      try {
        await notifier(notification);
      } catch (error) {
        this.emit('notifier-error', { error: messageOf(error), event });
      }
    }
  }

  start(intervalMs: number = this.config.checkIntervalMs): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      void this.checkAll().catch((error) => {
        this.emit('probe-error', { error: messageOf(error) });
      });
    }, intervalMs);

    // Never hold the process open for a monitoring interval.
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;

    clearInterval(this.timer);
    this.timer = null;
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  getReviewFlags(integrationId?: string): IntegrationReviewFlag[] {
    return this.detector.getReviewFlags(integrationId);
  }

  getUpgradeHistory(
    contractAddress?: string,
    network?: FingerprintNetwork,
  ): UpgradeEvent[] {
    return this.detector.getHistory(contractAddress, network);
  }

  destroy(): void {
    this.stop();
    this.probes.clear();
    this.notifiers.length = 0;
    this.removeAllListeners();
  }
}

export function describeUpgrade(event: UpgradeEvent): string {
  const affected =
    event.affectedIntegrations.length > 0
      ? ` Affected integrations: ${event.affectedIntegrations.join(', ')}.`
      : '';

  return `[${event.severity}] Contract ${event.contractAddress} on ${event.network} changed: ${event.details.join('; ')}.${affected}`;
}

/**
 * `String(error)` on a plain object yields "[object Object]", which is worse
 * than useless in an alert.
 */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  try {
    return JSON.stringify(error) ?? 'Unknown error';
  } catch {
    return 'Unknown error';
  }
}
