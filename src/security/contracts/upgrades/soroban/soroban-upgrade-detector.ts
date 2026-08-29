import {
  canonicalizeInterface,
  computeDeploymentFingerprint,
  contractKey,
  normalizeContractAddress,
  shortFingerprint,
} from '../../fingerprints/deployment-fingerprint';
import {
  ContractInterfaceSurface,
  DeploymentFingerprint,
  DeploymentObservation,
  FingerprintNetwork,
} from '../../fingerprints/types';
import {
  IntegrationReviewFlag,
  RegisterContractInput,
  TrackedContractState,
  UpgradeDetectorConfig,
  UpgradeEvent,
  UpgradeIndicator,
  UpgradeSeverity,
} from './types';

const DEFAULT_MAX_HISTORY = 500;

/**
 * Tracks configured Soroban contracts and detects upgrades behind their
 * addresses.
 *
 * State is compared by deployment fingerprint rather than by any single
 * field, so an upgrade that keeps the interface identical — the case most
 * likely to go unnoticed — is still caught.
 */
export class SorobanUpgradeDetector {
  private readonly states = new Map<string, TrackedContractState>();
  private readonly history: UpgradeEvent[] = [];
  private readonly flags: IntegrationReviewFlag[] = [];
  /** Integrations and labels configured before the first observation arrived. */
  private readonly pending = new Map<
    string,
    { integrations: string[]; label?: string }
  >();
  private readonly config: Required<UpgradeDetectorConfig>;
  private eventCounter = 0;

  constructor(config: UpgradeDetectorConfig = {}) {
    this.config = {
      maxHistory: config.maxHistory ?? DEFAULT_MAX_HISTORY,
      treatRedeployAsUpgrade: config.treatRedeployAsUpgrade ?? true,
    };
  }

  /**
   * Configure a contract to track.
   *
   * Registering again keeps the tracked state and merges the integration list,
   * so re-reading config at startup cannot erase what is already known.
   */
  register(
    input: RegisterContractInput,
    now: number = Date.now(),
  ): TrackedContractState | null {
    const key = contractKey(input.contractAddress, input.network);
    const existing = this.states.get(key);

    if (existing) {
      const merged = [
        ...new Set([...existing.integrations, ...(input.integrations ?? [])]),
      ];

      this.states.set(key, {
        ...existing,
        integrations: merged,
        label: input.label ?? existing.label,
      });

      return this.states.get(key) ?? null;
    }

    if (!input.baseline) {
      // Nothing to compare yet; the first observation becomes the baseline.
      this.pending.set(key, {
        integrations: [...new Set(input.integrations ?? [])],
        label: input.label,
      });

      return null;
    }

    const fingerprint = computeDeploymentFingerprint(input.baseline, now);
    const state: TrackedContractState = {
      contractAddress: fingerprint.contractAddress,
      network: fingerprint.network,
      fingerprint,
      interfaceSurface: canonicalizeInterface(input.baseline.interface),
      integrations: [...new Set(input.integrations ?? [])],
      label: input.label,
      firstSeenAt: now,
      lastSeenAt: now,
      lastTxHash: input.baseline.txHash,
      upgradeCount: 0,
    };

    this.states.set(key, state);

    return state;
  }

  /**
   * Record an observation.
   *
   * Returns the upgrade event when the deployment changed, and `null` when it
   * is unchanged or is the first thing seen for this contract.
   */
  observe(
    observation: DeploymentObservation,
    now: number = Date.now(),
  ): UpgradeEvent | null {
    const fingerprint = computeDeploymentFingerprint(observation, now);
    const key = contractKey(fingerprint.contractAddress, fingerprint.network);
    const previous = this.states.get(key);
    const surface = canonicalizeInterface(observation.interface);

    if (!previous) {
      const configured = this.pending.get(key);

      this.pending.delete(key);
      this.states.set(key, {
        contractAddress: fingerprint.contractAddress,
        network: fingerprint.network,
        fingerprint,
        interfaceSurface: surface,
        integrations: configured?.integrations ?? [],
        label: configured?.label,
        firstSeenAt: now,
        lastSeenAt: now,
        lastTxHash: observation.txHash,
        upgradeCount: 0,
      });

      return null;
    }

    const redeployed =
      Boolean(observation.txHash) &&
      Boolean(previous.lastTxHash) &&
      observation.txHash !== previous.lastTxHash;

    const changed =
      previous.fingerprint.fingerprint !== fingerprint.fingerprint;

    if (!changed && !(redeployed && this.config.treatRedeployAsUpgrade)) {
      this.states.set(key, {
        ...previous,
        lastSeenAt: now,
        lastTxHash: observation.txHash ?? previous.lastTxHash,
      });

      return null;
    }

    const event = this.buildEvent(
      previous,
      fingerprint,
      surface,
      observation,
      redeployed,
      now,
    );

    this.states.set(key, {
      ...previous,
      fingerprint,
      interfaceSurface: surface,
      lastSeenAt: now,
      lastTxHash: observation.txHash ?? previous.lastTxHash,
      upgradeCount: previous.upgradeCount + 1,
    });

    this.recordEvent(event);
    this.flagIntegrations(event, now);

    return event;
  }

  private buildEvent(
    previous: TrackedContractState,
    current: DeploymentFingerprint,
    surface: ContractInterfaceSurface,
    observation: DeploymentObservation,
    redeployed: boolean,
    now: number,
  ): UpgradeEvent {
    const indicators: UpgradeIndicator[] = [];
    const details: string[] = [];
    const before = previous.interfaceSurface ?? canonicalizeInterface();

    if (previous.fingerprint.wasmHash !== current.wasmHash) {
      indicators.push(UpgradeIndicator.WASM_HASH_CHANGED);
      details.push(
        `Wasm hash ${shortFingerprint(previous.fingerprint.wasmHash)} → ${shortFingerprint(current.wasmHash)}`,
      );
    }

    if (
      (previous.fingerprint.specVersion ?? '') !== (current.specVersion ?? '')
    ) {
      indicators.push(UpgradeIndicator.SPEC_VERSION_CHANGED);
      details.push(
        `Spec version ${previous.fingerprint.specVersion ?? 'none'} → ${current.specVersion ?? 'none'}`,
      );
    }

    const addedFunctions = surface.functions.filter(
      (fn) => !before.functions.includes(fn),
    );
    const removedFunctions = before.functions.filter(
      (fn) => !surface.functions.includes(fn),
    );

    if (addedFunctions.length > 0) {
      indicators.push(UpgradeIndicator.INTERFACE_FUNCTIONS_ADDED);
      details.push(`Functions added: ${addedFunctions.join(', ')}`);
    }

    if (removedFunctions.length > 0) {
      indicators.push(UpgradeIndicator.INTERFACE_FUNCTIONS_REMOVED);
      details.push(`Functions removed: ${removedFunctions.join(', ')}`);
    }

    if (!sameStrings(before.events, surface.events)) {
      indicators.push(UpgradeIndicator.INTERFACE_EVENTS_CHANGED);
      details.push('Contract events changed');
    }

    if (!sameNumbers(before.errors, surface.errors)) {
      indicators.push(UpgradeIndicator.INTERFACE_ERRORS_CHANGED);
      details.push('Contract error codes changed');
    }

    if (redeployed) {
      indicators.push(UpgradeIndicator.REDEPLOYED);
      details.push(`Redeployed in transaction ${observation.txHash}`);
    }

    this.eventCounter += 1;

    return {
      id: `upgrade-${current.network}-${current.contractAddress}-${this.eventCounter}`,
      contractAddress: current.contractAddress,
      network: current.network,
      previousFingerprint: previous.fingerprint,
      currentFingerprint: current,
      indicators,
      severity: classifySeverity(indicators, removedFunctions),
      details,
      addedFunctions,
      removedFunctions,
      affectedIntegrations: [...previous.integrations],
      detectedAt: now,
      txHash: observation.txHash,
    };
  }

  private recordEvent(event: UpgradeEvent): void {
    this.history.push(event);

    if (this.history.length > this.config.maxHistory) {
      this.history.splice(0, this.history.length - this.config.maxHistory);
    }
  }

  /**
   * Mark every integration that depended on the old deployment for review.
   *
   * An integration already flagged for an earlier upgrade is not flagged
   * twice; the open flag is what matters, not how many upgrades produced it.
   */
  private flagIntegrations(event: UpgradeEvent, now: number): void {
    for (const integrationId of event.affectedIntegrations) {
      const open = this.flags.find(
        (flag) =>
          flag.integrationId === integrationId &&
          flag.contractAddress === event.contractAddress &&
          flag.network === event.network &&
          !flag.clearedAt,
      );

      if (open) {
        // Keep the worst severity seen while the flag is open.
        if (severityRank(event.severity) > severityRank(open.severity)) {
          open.severity = event.severity;
          open.reason = summarize(event);
          open.upgradeEventId = event.id;
        }

        continue;
      }

      this.flags.push({
        integrationId,
        contractAddress: event.contractAddress,
        network: event.network,
        upgradeEventId: event.id,
        severity: event.severity,
        reason: summarize(event),
        flaggedAt: now,
      });
    }
  }

  addIntegration(
    contractAddress: string,
    network: FingerprintNetwork,
    integrationId: string,
  ): void {
    const key = contractKey(contractAddress, network);
    const state = this.states.get(key);

    if (state) {
      state.integrations = [...new Set([...state.integrations, integrationId])];

      return;
    }

    const configured = this.pending.get(key) ?? {
      integrations: [] as string[],
    };

    this.pending.set(key, {
      ...configured,
      integrations: [...new Set([...configured.integrations, integrationId])],
    });
  }

  getState(
    contractAddress: string,
    network: FingerprintNetwork,
  ): TrackedContractState | undefined {
    return this.states.get(contractKey(contractAddress, network));
  }

  getTrackedContracts(): TrackedContractState[] {
    return [...this.states.values()];
  }

  isTracked(contractAddress: string, network: FingerprintNetwork): boolean {
    return this.states.has(contractKey(contractAddress, network));
  }

  getHistory(
    contractAddress?: string,
    network?: FingerprintNetwork,
  ): UpgradeEvent[] {
    if (!contractAddress) return [...this.history];

    const address = normalizeContractAddress(contractAddress);

    return this.history.filter(
      (event) =>
        event.contractAddress === address &&
        (!network || event.network === network),
    );
  }

  /** Open review flags, optionally for one integration. */
  getReviewFlags(integrationId?: string): IntegrationReviewFlag[] {
    return this.flags.filter(
      (flag) =>
        !flag.clearedAt &&
        (!integrationId || flag.integrationId === integrationId),
    );
  }

  getAllReviewFlags(): IntegrationReviewFlag[] {
    return [...this.flags];
  }

  needsReview(integrationId: string): boolean {
    return this.getReviewFlags(integrationId).length > 0;
  }

  /** Close a review flag once an operator has re-approved the integration. */
  clearReviewFlag(
    integrationId: string,
    contractAddress: string,
    network: FingerprintNetwork,
    clearedBy?: string,
    clearedAt: number = Date.now(),
  ): boolean {
    const address = normalizeContractAddress(contractAddress);
    const flag = this.flags.find(
      (candidate) =>
        candidate.integrationId === integrationId &&
        candidate.contractAddress === address &&
        candidate.network === network &&
        !candidate.clearedAt,
    );

    if (!flag) return false;

    flag.clearedAt = clearedAt;
    flag.clearedBy = clearedBy;

    return true;
  }

  reset(): void {
    this.states.clear();
    this.pending.clear();
    this.history.length = 0;
    this.flags.length = 0;
    this.eventCounter = 0;
  }
}

function sameStrings(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sameNumbers(left: number[], right: number[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function severityRank(severity: UpgradeSeverity): number {
  return [
    UpgradeSeverity.INFO,
    UpgradeSeverity.MINOR,
    UpgradeSeverity.MAJOR,
    UpgradeSeverity.CRITICAL,
  ].indexOf(severity);
}

/**
 * How badly an upgrade undermines what BridgeWise assumed.
 *
 * A removed function breaks calls outright, so it is critical. New code with
 * an unchanged interface is only one step below: nothing visible changed,
 * which is precisely why it would otherwise keep being trusted.
 */
export function classifySeverity(
  indicators: UpgradeIndicator[],
  removedFunctions: string[],
): UpgradeSeverity {
  if (removedFunctions.length > 0) return UpgradeSeverity.CRITICAL;

  if (indicators.includes(UpgradeIndicator.WASM_HASH_CHANGED))
    return UpgradeSeverity.MAJOR;

  if (
    indicators.includes(UpgradeIndicator.SPEC_VERSION_CHANGED) ||
    indicators.includes(UpgradeIndicator.INTERFACE_FUNCTIONS_ADDED) ||
    indicators.includes(UpgradeIndicator.INTERFACE_EVENTS_CHANGED) ||
    indicators.includes(UpgradeIndicator.INTERFACE_ERRORS_CHANGED)
  ) {
    return UpgradeSeverity.MINOR;
  }

  return UpgradeSeverity.INFO;
}

function summarize(event: UpgradeEvent): string {
  return `Contract ${event.contractAddress} upgraded (${event.indicators.join(', ')})`;
}
