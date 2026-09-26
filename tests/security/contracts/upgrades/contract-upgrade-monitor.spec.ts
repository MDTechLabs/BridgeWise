import { ApprovedFingerprintStore } from '../../../../src/security/contracts/fingerprints/approved-fingerprint-store';
import {
  DeploymentObservation,
  FingerprintNetwork,
  VerificationStatus,
} from '../../../../src/security/contracts/fingerprints/types';
import { SorobanDeploymentVerifier } from '../../../../src/contracts/verification/soroban-deployment-verifier';
import { SorobanUpgradeDetector } from '../../../../src/security/contracts/upgrades/soroban/soroban-upgrade-detector';
import {
  ContractUpgradeMonitor,
  UpgradeNotification,
  describeUpgrade,
} from '../../../../src/contracts/monitoring/contract-upgrade-monitor';
import {
  UpgradeEvent,
  UpgradeSeverity,
} from '../../../../src/security/contracts/upgrades/soroban/types';

const ADDRESS = 'CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K';
const NETWORK = FingerprintNetwork.TESTNET;

function observation(
  overrides: Partial<DeploymentObservation> = {},
): DeploymentObservation {
  return {
    contractAddress: ADDRESS,
    network: NETWORK,
    wasmHash: 'a'.repeat(64),
    specVersion: '1.0.0',
    interface: {
      functions: ['transfer(amount:i128)'],
      events: ['transfer'],
      errors: [1],
    },
    txHash: 'tx-1',
    ...overrides,
  };
}

/** A probe that returns each queued observation in turn, repeating the last. */
function scriptedProbe(observations: DeploymentObservation[]) {
  let index = 0;

  return jest.fn(async () => {
    const next = observations[Math.min(index, observations.length - 1)];

    index += 1;

    return next;
  });
}

describe('ContractUpgradeMonitor', () => {
  let detector: SorobanUpgradeDetector;
  let monitor: ContractUpgradeMonitor;

  beforeEach(() => {
    detector = new SorobanUpgradeDetector();
    monitor = new ContractUpgradeMonitor(detector);
  });

  afterEach(() => {
    monitor.destroy();
  });

  it('registers a contract for monitoring', () => {
    monitor.registerContract({
      contractAddress: ADDRESS,
      network: NETWORK,
      probe: scriptedProbe([observation()]),
      integrations: ['bridge-a'],
    });

    expect(monitor.getMonitoredContracts()).toHaveLength(1);
  });

  it('reports no upgrade on the first check', async () => {
    monitor.registerContract({
      contractAddress: ADDRESS,
      network: NETWORK,
      probe: scriptedProbe([observation()]),
    });

    const [result] = await monitor.checkAll(10);

    expect(result.upgrade).toBeNull();
    expect(result.error).toBeUndefined();
  });

  it('emits an upgrade when the deployment changes', async () => {
    const upgrades: UpgradeEvent[] = [];

    monitor.on('upgrade', (event: UpgradeEvent) => upgrades.push(event));
    monitor.registerContract({
      contractAddress: ADDRESS,
      network: NETWORK,
      probe: scriptedProbe([
        observation(),
        observation({ wasmHash: 'b'.repeat(64) }),
      ]),
      integrations: ['bridge-a'],
    });

    await monitor.checkAll(10);
    await monitor.checkAll(20);

    expect(upgrades).toHaveLength(1);
    expect(upgrades[0].affectedIntegrations).toEqual(['bridge-a']);
  });

  it('judges the first check against a configured baseline', async () => {
    const upgrades: UpgradeEvent[] = [];

    monitor.on('upgrade', (event: UpgradeEvent) => upgrades.push(event));
    monitor.registerContract({
      contractAddress: ADDRESS,
      network: NETWORK,
      baseline: observation(),
      probe: scriptedProbe([observation({ wasmHash: 'b'.repeat(64) })]),
    });

    await monitor.checkAll(10);

    expect(upgrades).toHaveLength(1);
  });

  it('emits severe-upgrade only at or above the alert severity', async () => {
    const severe: UpgradeEvent[] = [];
    const strict = new ContractUpgradeMonitor(detector, undefined, {
      alertSeverity: UpgradeSeverity.CRITICAL,
    });

    strict.on('severe-upgrade', (event: UpgradeEvent) => severe.push(event));
    strict.registerContract({
      contractAddress: ADDRESS,
      network: NETWORK,
      probe: scriptedProbe([
        observation(),
        observation({ wasmHash: 'b'.repeat(64) }),
        observation({
          wasmHash: 'c'.repeat(64),
          interface: { functions: [], events: [], errors: [] },
        }),
      ]),
    });

    await strict.checkAll(10);
    await strict.checkAll(20);
    expect(severe).toHaveLength(0);

    await strict.checkAll(30);
    expect(severe).toHaveLength(1);

    strict.destroy();
  });

  describe('notifying monitoring services', () => {
    it('sends the upgrade to every notifier', async () => {
      const received: UpgradeNotification[] = [];

      monitor.addNotifier((notification) => {
        received.push(notification);
      });
      monitor.addNotifier(async (notification) => {
        received.push(notification);
      });
      monitor.registerContract({
        contractAddress: ADDRESS,
        network: NETWORK,
        probe: scriptedProbe([
          observation(),
          observation({ wasmHash: 'b'.repeat(64) }),
        ]),
        integrations: ['bridge-a'],
      });

      await monitor.checkAll(10);
      await monitor.checkAll(20);

      expect(received).toHaveLength(2);
      expect(received[0].message).toContain(ADDRESS);
      expect(received[0].affectedIntegrations).toEqual(['bridge-a']);
    });

    it('does not notify when nothing changed', async () => {
      const notifier = jest.fn();

      monitor.addNotifier(notifier);
      monitor.registerContract({
        contractAddress: ADDRESS,
        network: NETWORK,
        probe: scriptedProbe([observation()]),
      });

      await monitor.checkAll(10);
      await monitor.checkAll(20);

      expect(notifier).not.toHaveBeenCalled();
    });

    // A broken webhook is the worst possible reason to stop noticing contract
    // upgrades.
    it('keeps notifying after one sink throws', async () => {
      const errors: unknown[] = [];
      const second = jest.fn();

      monitor.on('notifier-error', (error) => errors.push(error));
      monitor.addNotifier(() => {
        throw new Error('pager down');
      });
      monitor.addNotifier(second);
      monitor.registerContract({
        contractAddress: ADDRESS,
        network: NETWORK,
        probe: scriptedProbe([
          observation(),
          observation({ wasmHash: 'b'.repeat(64) }),
        ]),
      });

      await monitor.checkAll(10);
      await expect(monitor.checkAll(20)).resolves.toHaveLength(1);

      expect(second).toHaveBeenCalledTimes(1);
      expect(errors).toHaveLength(1);
    });

    it('reports a rejected async notifier without failing the check', async () => {
      const errors: Array<{ error: string }> = [];

      monitor.on('notifier-error', (payload) => errors.push(payload));
      monitor.addNotifier(async () => {
        throw new Error('webhook 500');
      });
      monitor.registerContract({
        contractAddress: ADDRESS,
        network: NETWORK,
        probe: scriptedProbe([
          observation(),
          observation({ wasmHash: 'b'.repeat(64) }),
        ]),
      });

      await monitor.checkAll(10);
      await monitor.checkAll(20);

      expect(errors[0].error).toBe('webhook 500');
    });
  });

  describe('probe failures', () => {
    // An unreachable node must not look like a rollback.
    it('does not disturb tracked state when a probe fails', async () => {
      const failures: Array<{ error: string }> = [];
      const probe = jest
        .fn<Promise<DeploymentObservation>, []>()
        .mockResolvedValueOnce(observation())
        .mockRejectedValueOnce(new Error('horizon unreachable'))
        .mockResolvedValueOnce(observation());

      monitor.on('probe-error', (payload) => failures.push(payload));
      monitor.registerContract({
        contractAddress: ADDRESS,
        network: NETWORK,
        probe,
      });

      await monitor.checkAll(10);
      const [failed] = await monitor.checkAll(20);
      const [recovered] = await monitor.checkAll(30);

      expect(failed.error).toBe('horizon unreachable');
      expect(failures).toHaveLength(1);
      expect(recovered.upgrade).toBeNull();
      expect(monitor.getUpgradeHistory()).toHaveLength(0);
    });

    it('keeps checking the other contracts when one probe fails', async () => {
      const other = 'CDIFFERENTCONTRACTADDRESSFORTESTINGPURPOSESONLY1234567890';

      monitor.registerContract({
        contractAddress: ADDRESS,
        network: NETWORK,
        probe: jest.fn().mockRejectedValue(new Error('down')),
      });
      monitor.registerContract({
        contractAddress: other,
        network: NETWORK,
        probe: scriptedProbe([observation({ contractAddress: other })]),
      });

      const results = await monitor.checkAll(10);

      expect(results).toHaveLength(2);
      expect(results.filter((result) => result.error)).toHaveLength(1);
    });

    // A hung probe would otherwise stall every later check on the interval.
    it('times a hung probe out', async () => {
      const impatient = new ContractUpgradeMonitor(detector, undefined, {
        probeTimeoutMs: 20,
      });

      impatient.registerContract({
        contractAddress: ADDRESS,
        network: NETWORK,
        probe: () => new Promise(() => undefined),
      });

      const [result] = await impatient.checkAll(10);

      expect(result.error).toMatch(/timed out after 20ms/);

      impatient.destroy();
    });

    it('reports a non-Error rejection readably', async () => {
      monitor.registerContract({
        contractAddress: ADDRESS,
        network: NETWORK,
        probe: jest.fn().mockRejectedValue({ status: 503 }),
      });

      const [result] = await monitor.checkAll(10);

      expect(result.error).toBe('{"status":503}');
    });

    it('rejects a check for a contract that is not monitored', async () => {
      await expect(monitor.check(ADDRESS, NETWORK)).rejects.toThrow(
        /is not monitored/,
      );
    });
  });

  describe('fingerprint verification', () => {
    it('emits unapproved-deployment for a deployment that is not approved', async () => {
      const store = new ApprovedFingerprintStore();
      const verifier = new SorobanDeploymentVerifier(store);
      const verified = new ContractUpgradeMonitor(detector, verifier);
      const unapproved: Array<{ status: VerificationStatus }> = [];

      verified.on('unapproved-deployment', (result) => unapproved.push(result));
      verified.registerContract({
        contractAddress: ADDRESS,
        network: NETWORK,
        probe: scriptedProbe([observation()]),
      });

      const [result] = await verified.checkAll(10);

      expect(result.verification?.status).toBe(VerificationStatus.UNKNOWN);
      expect(unapproved).toHaveLength(1);

      verified.destroy();
    });

    it('stays quiet for an approved deployment', async () => {
      const store = new ApprovedFingerprintStore();
      const verifier = new SorobanDeploymentVerifier(store);

      verifier.approve(observation(), { now: 1 });

      const verified = new ContractUpgradeMonitor(detector, verifier);
      const unapproved: unknown[] = [];

      verified.on('unapproved-deployment', (result) => unapproved.push(result));
      verified.registerContract({
        contractAddress: ADDRESS,
        network: NETWORK,
        probe: scriptedProbe([observation()]),
      });

      const [result] = await verified.checkAll(10);

      expect(result.verification?.status).toBe(VerificationStatus.APPROVED);
      expect(unapproved).toHaveLength(0);

      verified.destroy();
    });

    it('carries the verification into the notification', async () => {
      const store = new ApprovedFingerprintStore();
      const verifier = new SorobanDeploymentVerifier(store);

      verifier.approve(observation(), { now: 1 });

      const verified = new ContractUpgradeMonitor(detector, verifier);
      const received: UpgradeNotification[] = [];

      verified.addNotifier((notification) => received.push(notification));
      verified.registerContract({
        contractAddress: ADDRESS,
        network: NETWORK,
        probe: scriptedProbe([
          observation(),
          observation({ wasmHash: 'b'.repeat(64) }),
        ]),
      });

      await verified.checkAll(10);
      await verified.checkAll(20);

      expect(received[0].verification?.status).toBe(
        VerificationStatus.MISMATCH,
      );

      verified.destroy();
    });
  });

  describe('scheduling', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('checks on an interval until stopped', async () => {
      const probe = scriptedProbe([observation()]);

      monitor.registerContract({
        contractAddress: ADDRESS,
        network: NETWORK,
        probe,
      });
      monitor.start(1_000);

      expect(monitor.isRunning()).toBe(true);

      await jest.advanceTimersByTimeAsync(3_000);
      expect(probe).toHaveBeenCalledTimes(3);

      monitor.stop();
      await jest.advanceTimersByTimeAsync(3_000);

      expect(probe).toHaveBeenCalledTimes(3);
      expect(monitor.isRunning()).toBe(false);
    });

    it('ignores a second start', async () => {
      const probe = scriptedProbe([observation()]);

      monitor.registerContract({
        contractAddress: ADDRESS,
        network: NETWORK,
        probe,
      });
      monitor.start(1_000);
      monitor.start(1_000);

      await jest.advanceTimersByTimeAsync(1_000);

      expect(probe).toHaveBeenCalledTimes(1);
    });

    it('stops cleanly when it was never started', () => {
      expect(() => monitor.stop()).not.toThrow();
    });
  });

  it('exposes review flags raised by the detector', async () => {
    monitor.registerContract({
      contractAddress: ADDRESS,
      network: NETWORK,
      probe: scriptedProbe([
        observation(),
        observation({ wasmHash: 'b'.repeat(64) }),
      ]),
      integrations: ['bridge-a'],
    });

    await monitor.checkAll(10);
    await monitor.checkAll(20);

    expect(monitor.getReviewFlags('bridge-a')).toHaveLength(1);
    expect(monitor.getUpgradeHistory(ADDRESS, NETWORK)).toHaveLength(1);
  });

  it('unregisters a contract', () => {
    monitor.registerContract({
      contractAddress: ADDRESS,
      network: NETWORK,
      probe: scriptedProbe([observation()]),
    });

    expect(monitor.unregisterContract(ADDRESS, NETWORK)).toBe(true);
    expect(monitor.getMonitoredContracts()).toHaveLength(0);
  });
});

describe('describeUpgrade', () => {
  it('names the severity, contract and affected integrations', () => {
    const event: UpgradeEvent = {
      id: 'upgrade-1',
      contractAddress: ADDRESS,
      network: NETWORK,
      previousFingerprint: {} as never,
      currentFingerprint: {} as never,
      indicators: [],
      severity: UpgradeSeverity.MAJOR,
      details: ['Wasm hash aaa → bbb'],
      addedFunctions: [],
      removedFunctions: [],
      affectedIntegrations: ['bridge-a'],
      detectedAt: 1,
    };

    const message = describeUpgrade(event);

    expect(message).toContain('[major]');
    expect(message).toContain(ADDRESS);
    expect(message).toContain('Wasm hash aaa → bbb');
    expect(message).toContain('bridge-a');
  });

  it('omits the integration clause when nothing is affected', () => {
    const message = describeUpgrade({
      id: 'upgrade-1',
      contractAddress: ADDRESS,
      network: NETWORK,
      previousFingerprint: {} as never,
      currentFingerprint: {} as never,
      indicators: [],
      severity: UpgradeSeverity.INFO,
      details: ['Redeployed'],
      addedFunctions: [],
      removedFunctions: [],
      affectedIntegrations: [],
      detectedAt: 1,
    });

    expect(message).not.toContain('Affected integrations');
  });
});
