import { ApprovedFingerprintStore } from '../../../../src/security/contracts/fingerprints/approved-fingerprint-store';
import { computeDeploymentFingerprint } from '../../../../src/security/contracts/fingerprints/deployment-fingerprint';
import {
  DeploymentObservation,
  FingerprintNetwork,
} from '../../../../src/security/contracts/fingerprints/types';

const ADDRESS = 'CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K';

function fingerprintFor(overrides: Partial<DeploymentObservation> = {}) {
  const observation: DeploymentObservation = {
    contractAddress: ADDRESS,
    network: FingerprintNetwork.TESTNET,
    wasmHash: 'a'.repeat(64),
    specVersion: '1.0.0',
    ...overrides,
  };

  return computeDeploymentFingerprint(observation, 1_000);
}

describe('ApprovedFingerprintStore', () => {
  let store: ApprovedFingerprintStore;

  beforeEach(() => {
    store = new ApprovedFingerprintStore();
  });

  it('approves and finds a deployment', () => {
    const details = fingerprintFor();

    store.approve({
      details,
      label: 'bridge v1',
      approvedBy: 'ops',
      approvedAt: 5,
    });

    expect(
      store.isApproved(
        ADDRESS,
        FingerprintNetwork.TESTNET,
        details.fingerprint,
      ),
    ).toBe(true);
    expect(
      store.find(ADDRESS, FingerprintNetwork.TESTNET, details.fingerprint)
        ?.label,
    ).toBe('bridge v1');
    expect(store.size()).toBe(1);
  });

  it('does not approve a deployment it has never seen', () => {
    expect(
      store.isApproved(ADDRESS, FingerprintNetwork.TESTNET, 'unknown'),
    ).toBe(false);
  });

  it('normalizes the address on lookup', () => {
    const details = fingerprintFor();

    store.approve({ details });

    expect(
      store.isApproved(
        ADDRESS.toLowerCase(),
        FingerprintNetwork.TESTNET,
        details.fingerprint,
      ),
    ).toBe(true);
  });

  // An approval on testnet says nothing about the same id on mainnet.
  it('keeps networks separate', () => {
    const details = fingerprintFor();

    store.approve({ details });

    expect(
      store.isApproved(ADDRESS, FingerprintNetwork.PUBLIC, details.fingerprint),
    ).toBe(false);
  });

  it('updates rather than duplicating a re-approval', () => {
    const details = fingerprintFor();

    store.approve({ details, label: 'first', approvedAt: 1 });
    store.approve({ details, label: 'second', approvedAt: 2 });

    expect(store.size()).toBe(1);
    expect(
      store.find(ADDRESS, FingerprintNetwork.TESTNET, details.fingerprint)
        ?.label,
    ).toBe('second');
  });

  it('holds several approved deployments for one contract', () => {
    store.approve({ details: fingerprintFor() });
    store.approve({ details: fingerprintFor({ wasmHash: 'b'.repeat(64) }) });

    expect(
      store.listActiveForContract(ADDRESS, FingerprintNetwork.TESTNET),
    ).toHaveLength(2);
  });

  describe('revocation', () => {
    it('stops treating a revoked deployment as approved', () => {
      const details = fingerprintFor();

      store.approve({ details });
      store.revoke(
        ADDRESS,
        FingerprintNetwork.TESTNET,
        details.fingerprint,
        'key leak',
        77,
      );

      expect(
        store.isApproved(
          ADDRESS,
          FingerprintNetwork.TESTNET,
          details.fingerprint,
        ),
      ).toBe(false);
    });

    // "Approved and then revoked" is a more useful answer than "never seen".
    it('keeps the revoked record for audit', () => {
      const details = fingerprintFor();

      store.approve({ details });
      store.revoke(
        ADDRESS,
        FingerprintNetwork.TESTNET,
        details.fingerprint,
        'key leak',
        77,
      );

      const record = store.find(
        ADDRESS,
        FingerprintNetwork.TESTNET,
        details.fingerprint,
      );

      expect(record?.revokedAt).toBe(77);
      expect(record?.revokedReason).toBe('key leak');
      expect(
        store.listForContract(ADDRESS, FingerprintNetwork.TESTNET),
      ).toHaveLength(1);
      expect(
        store.listActiveForContract(ADDRESS, FingerprintNetwork.TESTNET),
      ).toHaveLength(0);
    });

    it('returns undefined revoking something unknown', () => {
      expect(
        store.revoke(ADDRESS, FingerprintNetwork.TESTNET, 'nope'),
      ).toBeUndefined();
    });

    // Re-approving is an explicit decision to trust the deployment again.
    it('clears the revocation on re-approval', () => {
      const details = fingerprintFor();

      store.approve({ details });
      store.revoke(
        ADDRESS,
        FingerprintNetwork.TESTNET,
        details.fingerprint,
        'precaution',
      );
      store.approve({ details, approvedBy: 'ops' });

      expect(
        store.isApproved(
          ADDRESS,
          FingerprintNetwork.TESTNET,
          details.fingerprint,
        ),
      ).toBe(true);
      expect(
        store.find(ADDRESS, FingerprintNetwork.TESTNET, details.fingerprint)
          ?.revokedAt,
      ).toBeUndefined();
    });
  });

  describe('latestActive', () => {
    it('returns the most recently approved active deployment', () => {
      store.approve({ details: fingerprintFor(), label: 'old', approvedAt: 1 });
      store.approve({
        details: fingerprintFor({ wasmHash: 'b'.repeat(64) }),
        label: 'new',
        approvedAt: 9,
      });

      expect(
        store.latestActive(ADDRESS, FingerprintNetwork.TESTNET)?.label,
      ).toBe('new');
    });

    it('skips revoked approvals', () => {
      const revoked = fingerprintFor({ wasmHash: 'b'.repeat(64) });

      store.approve({ details: fingerprintFor(), label: 'old', approvedAt: 1 });
      store.approve({ details: revoked, label: 'new', approvedAt: 9 });
      store.revoke(ADDRESS, FingerprintNetwork.TESTNET, revoked.fingerprint);

      expect(
        store.latestActive(ADDRESS, FingerprintNetwork.TESTNET)?.label,
      ).toBe('old');
    });

    it('returns undefined for an unknown contract', () => {
      expect(
        store.latestActive(ADDRESS, FingerprintNetwork.TESTNET),
      ).toBeUndefined();
    });
  });

  describe('removal', () => {
    it('removes an approval', () => {
      const details = fingerprintFor();

      store.approve({ details });

      expect(
        store.remove(ADDRESS, FingerprintNetwork.TESTNET, details.fingerprint),
      ).toBe(true);
      expect(store.size()).toBe(0);
    });

    it('reports nothing removed for an unknown fingerprint', () => {
      expect(store.remove(ADDRESS, FingerprintNetwork.TESTNET, 'nope')).toBe(
        false,
      );
    });

    it('clears everything', () => {
      store.approve({ details: fingerprintFor() });
      store.clear();

      expect(store.size()).toBe(0);
    });
  });

  describe('persistence', () => {
    it('round-trips through a snapshot', () => {
      const details = fingerprintFor();

      store.approve({ details, label: 'bridge v1', approvedAt: 3 });

      const restored = new ApprovedFingerprintStore();

      restored.restore(store.snapshot());

      expect(
        restored.isApproved(
          ADDRESS,
          FingerprintNetwork.TESTNET,
          details.fingerprint,
        ),
      ).toBe(true);
      expect(
        restored.find(ADDRESS, FingerprintNetwork.TESTNET, details.fingerprint)
          ?.label,
      ).toBe('bridge v1');
    });

    it('replaces existing contents on restore', () => {
      store.approve({ details: fingerprintFor() });
      store.restore([]);

      expect(store.size()).toBe(0);
    });
  });
});
