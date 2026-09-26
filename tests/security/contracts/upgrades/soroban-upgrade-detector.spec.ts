import {
  DeploymentObservation,
  FingerprintNetwork,
} from '../../../../src/security/contracts/fingerprints/types';
import {
  SorobanUpgradeDetector,
  classifySeverity,
  severityRank,
} from '../../../../src/security/contracts/upgrades/soroban/soroban-upgrade-detector';
import {
  UpgradeIndicator,
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
      functions: ['transfer(amount:i128)', 'balance(id:address):i128'],
      events: ['transfer'],
      errors: [1],
    },
    txHash: 'tx-1',
    ...overrides,
  };
}

describe('SorobanUpgradeDetector', () => {
  let detector: SorobanUpgradeDetector;

  beforeEach(() => {
    detector = new SorobanUpgradeDetector();
  });

  describe('tracking state', () => {
    it('takes the first observation as the baseline without reporting an upgrade', () => {
      expect(detector.observe(observation(), 10)).toBeNull();
      expect(detector.isTracked(ADDRESS, NETWORK)).toBe(true);
      expect(detector.getState(ADDRESS, NETWORK)?.upgradeCount).toBe(0);
    });

    it('registers a contract with a known-good baseline', () => {
      const state = detector.register(
        {
          contractAddress: ADDRESS,
          network: NETWORK,
          baseline: observation(),
          integrations: ['bridge-a'],
        },
        5,
      );

      expect(state?.integrations).toEqual(['bridge-a']);
      expect(detector.isTracked(ADDRESS, NETWORK)).toBe(true);
    });

    it('applies integrations configured before the first observation', () => {
      detector.register({
        contractAddress: ADDRESS,
        network: NETWORK,
        integrations: ['bridge-a'],
      });
      detector.observe(observation(), 10);

      expect(detector.getState(ADDRESS, NETWORK)?.integrations).toEqual([
        'bridge-a',
      ]);
    });

    // Re-reading config at startup must not erase what is already tracked.
    it('merges integrations when a tracked contract is registered again', () => {
      detector.register({
        contractAddress: ADDRESS,
        network: NETWORK,
        baseline: observation(),
        integrations: ['a'],
      });
      detector.register({
        contractAddress: ADDRESS,
        network: NETWORK,
        integrations: ['b', 'a'],
      });

      expect(detector.getState(ADDRESS, NETWORK)?.integrations).toEqual([
        'a',
        'b',
      ]);
    });

    it('reports no upgrade when nothing changed', () => {
      detector.observe(observation(), 10);

      expect(detector.observe(observation(), 20)).toBeNull();
      expect(detector.getState(ADDRESS, NETWORK)?.lastSeenAt).toBe(20);
    });

    it('tracks the same address on two networks separately', () => {
      detector.observe(observation(), 10);
      detector.observe(observation({ network: FingerprintNetwork.PUBLIC }), 11);

      expect(detector.getTrackedContracts()).toHaveLength(2);
    });
  });

  describe('detecting upgrades', () => {
    beforeEach(() => {
      detector.register({
        contractAddress: ADDRESS,
        network: NETWORK,
        integrations: ['bridge-a', 'bridge-b'],
      });
      detector.observe(observation(), 10);
    });

    it('detects new code behind the same address', () => {
      const event = detector.observe(
        observation({ wasmHash: 'b'.repeat(64) }),
        20,
      );

      expect(event?.indicators).toContain(UpgradeIndicator.WASM_HASH_CHANGED);
      expect(event?.previousFingerprint.wasmHash).toBe('a'.repeat(64));
      expect(event?.currentFingerprint.wasmHash).toBe('b'.repeat(64));
      expect(event?.detectedAt).toBe(20);
    });

    it('names the functions that were added and removed', () => {
      const event = detector.observe(
        observation({
          wasmHash: 'b'.repeat(64),
          interface: {
            functions: ['transfer(amount:i128)', 'burn(amount:i128)'],
            events: ['transfer'],
            errors: [1],
          },
        }),
        20,
      );

      expect(event?.addedFunctions).toEqual(['burn(amount:i128)']);
      expect(event?.removedFunctions).toEqual(['balance(id:address):i128']);
    });

    it('detects a changed spec version', () => {
      const event = detector.observe(observation({ specVersion: '2.0.0' }), 20);

      expect(event?.indicators).toContain(
        UpgradeIndicator.SPEC_VERSION_CHANGED,
      );
    });

    it('detects changed events and error codes', () => {
      const event = detector.observe(
        observation({
          wasmHash: 'b'.repeat(64),
          interface: {
            functions: ['transfer(amount:i128)', 'balance(id:address):i128'],
            events: ['transfer', 'burn'],
            errors: [1, 2],
          },
        }),
        20,
      );

      expect(event?.indicators).toContain(
        UpgradeIndicator.INTERFACE_EVENTS_CHANGED,
      );
      expect(event?.indicators).toContain(
        UpgradeIndicator.INTERFACE_ERRORS_CHANGED,
      );
    });

    // Same code, new deployment: the wasm is unchanged but storage and admin
    // need not be.
    it('treats a redeploy of identical code as an upgrade', () => {
      const event = detector.observe(observation({ txHash: 'tx-2' }), 20);

      expect(event?.indicators).toEqual([UpgradeIndicator.REDEPLOYED]);
      expect(event?.severity).toBe(UpgradeSeverity.INFO);
    });

    it('can be configured to ignore redeploys of identical code', () => {
      const lenient = new SorobanUpgradeDetector({
        treatRedeployAsUpgrade: false,
      });

      lenient.observe(observation(), 10);

      expect(lenient.observe(observation({ txHash: 'tx-2' }), 20)).toBeNull();
    });

    it('does not report an upgrade twice for the same deployment', () => {
      detector.observe(
        observation({ wasmHash: 'b'.repeat(64), txHash: 'tx-2' }),
        20,
      );

      expect(
        detector.observe(
          observation({ wasmHash: 'b'.repeat(64), txHash: 'tx-2' }),
          30,
        ),
      ).toBeNull();
      expect(detector.getHistory()).toHaveLength(1);
    });

    it('counts successive upgrades', () => {
      detector.observe(
        observation({ wasmHash: 'b'.repeat(64), txHash: 'tx-2' }),
        20,
      );
      detector.observe(
        observation({ wasmHash: 'c'.repeat(64), txHash: 'tx-3' }),
        30,
      );

      expect(detector.getState(ADDRESS, NETWORK)?.upgradeCount).toBe(2);
      expect(detector.getHistory()).toHaveLength(2);
    });
  });

  describe('severity', () => {
    beforeEach(() => {
      detector.observe(observation(), 10);
    });

    it('calls a removed function critical', () => {
      const event = detector.observe(
        observation({
          wasmHash: 'b'.repeat(64),
          interface: {
            functions: ['transfer(amount:i128)'],
            events: ['transfer'],
            errors: [1],
          },
        }),
        20,
      );

      expect(event?.severity).toBe(UpgradeSeverity.CRITICAL);
    });

    // A changed signature reads as one function removed and another added,
    // which is right: existing callers break.
    it('calls a changed signature critical', () => {
      const event = detector.observe(
        observation({
          wasmHash: 'b'.repeat(64),
          interface: {
            functions: ['transfer(amount:u64)', 'balance(id:address):i128'],
            events: ['transfer'],
            errors: [1],
          },
        }),
        20,
      );

      expect(event?.severity).toBe(UpgradeSeverity.CRITICAL);
      expect(event?.removedFunctions).toEqual(['transfer(amount:i128)']);
    });

    // Nothing visible changed — which is exactly why this deployment would
    // otherwise keep being trusted.
    it('calls new code behind an unchanged interface major', () => {
      const event = detector.observe(
        observation({ wasmHash: 'b'.repeat(64) }),
        20,
      );

      expect(event?.severity).toBe(UpgradeSeverity.MAJOR);
    });

    it('calls a spec-version-only change minor', () => {
      const event = detector.observe(observation({ specVersion: '1.1.0' }), 20);

      expect(event?.severity).toBe(UpgradeSeverity.MINOR);
    });

    it('ranks severities in order', () => {
      expect(severityRank(UpgradeSeverity.CRITICAL)).toBeGreaterThan(
        severityRank(UpgradeSeverity.MAJOR),
      );
      expect(severityRank(UpgradeSeverity.MAJOR)).toBeGreaterThan(
        severityRank(UpgradeSeverity.MINOR),
      );
      expect(severityRank(UpgradeSeverity.MINOR)).toBeGreaterThan(
        severityRank(UpgradeSeverity.INFO),
      );
    });

    it('classifies an empty change set as informational', () => {
      expect(classifySeverity([], [])).toBe(UpgradeSeverity.INFO);
    });
  });

  describe('integration review flags', () => {
    beforeEach(() => {
      detector.register({
        contractAddress: ADDRESS,
        network: NETWORK,
        integrations: ['bridge-a', 'bridge-b'],
      });
      detector.observe(observation(), 10);
    });

    it('flags every integration that depended on the old deployment', () => {
      const event = detector.observe(
        observation({ wasmHash: 'b'.repeat(64) }),
        20,
      );

      expect(event?.affectedIntegrations).toEqual(['bridge-a', 'bridge-b']);
      expect(
        detector.getReviewFlags().map((flag) => flag.integrationId),
      ).toEqual(['bridge-a', 'bridge-b']);
      expect(detector.needsReview('bridge-a')).toBe(true);
    });

    it('flags nothing when no integration is registered', () => {
      const bare = new SorobanUpgradeDetector();

      bare.observe(observation(), 10);
      bare.observe(observation({ wasmHash: 'b'.repeat(64) }), 20);

      expect(bare.getReviewFlags()).toHaveLength(0);
    });

    // The open flag is what matters, not how many upgrades produced it.
    it('does not raise a second flag while one is open', () => {
      detector.observe(
        observation({ wasmHash: 'b'.repeat(64), txHash: 'tx-2' }),
        20,
      );
      detector.observe(
        observation({ wasmHash: 'c'.repeat(64), txHash: 'tx-3' }),
        30,
      );

      expect(detector.getReviewFlags('bridge-a')).toHaveLength(1);
    });

    it('raises the open flag to the worst severity seen', () => {
      detector.observe(observation({ specVersion: '1.1.0' }), 20);
      expect(detector.getReviewFlags('bridge-a')[0].severity).toBe(
        UpgradeSeverity.MINOR,
      );

      detector.observe(
        observation({
          specVersion: '1.1.0',
          wasmHash: 'c'.repeat(64),
          interface: {
            functions: ['transfer(amount:i128)'],
            events: ['transfer'],
            errors: [1],
          },
        }),
        30,
      );

      expect(detector.getReviewFlags('bridge-a')[0].severity).toBe(
        UpgradeSeverity.CRITICAL,
      );
    });

    it('does not lower an open flag when a later upgrade is milder', () => {
      detector.observe(
        observation({
          wasmHash: 'b'.repeat(64),
          interface: {
            functions: ['transfer(amount:i128)'],
            events: ['transfer'],
            errors: [1],
          },
        }),
        20,
      );
      detector.observe(
        observation({
          wasmHash: 'b'.repeat(64),
          specVersion: '1.1.0',
          interface: {
            functions: ['transfer(amount:i128)'],
            events: ['transfer'],
            errors: [1],
          },
        }),
        30,
      );

      expect(detector.getReviewFlags('bridge-a')[0].severity).toBe(
        UpgradeSeverity.CRITICAL,
      );
    });

    it('clears a flag once an operator re-approves', () => {
      detector.observe(observation({ wasmHash: 'b'.repeat(64) }), 20);

      expect(
        detector.clearReviewFlag('bridge-a', ADDRESS, NETWORK, 'ops', 40),
      ).toBe(true);
      expect(detector.needsReview('bridge-a')).toBe(false);
      expect(detector.needsReview('bridge-b')).toBe(true);
    });

    it('keeps a cleared flag in the audit list', () => {
      detector.observe(observation({ wasmHash: 'b'.repeat(64) }), 20);
      detector.clearReviewFlag('bridge-a', ADDRESS, NETWORK, 'ops', 40);

      const cleared = detector
        .getAllReviewFlags()
        .find((flag) => flag.integrationId === 'bridge-a');

      expect(cleared?.clearedAt).toBe(40);
      expect(cleared?.clearedBy).toBe('ops');
    });

    it('reports nothing cleared for an unknown flag', () => {
      expect(detector.clearReviewFlag('nobody', ADDRESS, NETWORK)).toBe(false);
    });

    it('flags an integration added after the contract was tracked', () => {
      detector.addIntegration(ADDRESS, NETWORK, 'bridge-c');
      detector.observe(observation({ wasmHash: 'b'.repeat(64) }), 20);

      expect(detector.needsReview('bridge-c')).toBe(true);
    });
  });

  describe('history', () => {
    it('filters history by contract', () => {
      detector.observe(observation(), 10);
      detector.observe(observation({ wasmHash: 'b'.repeat(64) }), 20);

      expect(detector.getHistory(ADDRESS, NETWORK)).toHaveLength(1);
      expect(detector.getHistory('CSOMETHINGELSE')).toHaveLength(0);
    });

    it('accepts an un-normalized address', () => {
      detector.observe(observation(), 10);
      detector.observe(observation({ wasmHash: 'b'.repeat(64) }), 20);

      expect(detector.getHistory(ADDRESS.toLowerCase())).toHaveLength(1);
    });

    // Unbounded history in a long-running monitor is a slow memory leak.
    it('caps retained history', () => {
      const capped = new SorobanUpgradeDetector({ maxHistory: 2 });

      capped.observe(observation(), 1);
      capped.observe(observation({ wasmHash: 'b'.repeat(64) }), 2);
      capped.observe(observation({ wasmHash: 'c'.repeat(64) }), 3);
      capped.observe(observation({ wasmHash: 'd'.repeat(64) }), 4);

      const history = capped.getHistory();

      expect(history).toHaveLength(2);
      expect(history[1].currentFingerprint.wasmHash).toBe('d'.repeat(64));
    });

    it('gives each event a distinct id', () => {
      detector.observe(observation(), 10);
      detector.observe(observation({ wasmHash: 'b'.repeat(64) }), 20);
      detector.observe(observation({ wasmHash: 'c'.repeat(64) }), 30);

      const [first, second] = detector.getHistory();

      expect(first.id).not.toBe(second.id);
    });

    it('resets everything', () => {
      detector.observe(observation(), 10);
      detector.observe(observation({ wasmHash: 'b'.repeat(64) }), 20);
      detector.reset();

      expect(detector.getHistory()).toHaveLength(0);
      expect(detector.getTrackedContracts()).toHaveLength(0);
    });
  });
});
