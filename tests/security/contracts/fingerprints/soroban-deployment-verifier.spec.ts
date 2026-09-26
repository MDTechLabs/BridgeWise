import { ApprovedFingerprintStore } from '../../../../src/security/contracts/fingerprints/approved-fingerprint-store';
import { computeDeploymentFingerprint } from '../../../../src/security/contracts/fingerprints/deployment-fingerprint';
import {
  DeploymentObservation,
  FingerprintNetwork,
  MismatchReason,
  VerificationStatus,
} from '../../../../src/security/contracts/fingerprints/types';
import {
  SorobanDeploymentVerifier,
  diffFingerprints,
} from '../../../../src/contracts/verification/soroban-deployment-verifier';

const ADDRESS = 'CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K';

function observation(
  overrides: Partial<DeploymentObservation> = {},
): DeploymentObservation {
  return {
    contractAddress: ADDRESS,
    network: FingerprintNetwork.TESTNET,
    wasmHash: 'a'.repeat(64),
    specVersion: '1.0.0',
    interface: {
      functions: ['transfer(amount:i128)'],
      events: ['transfer'],
      errors: [1],
    },
    ...overrides,
  };
}

describe('SorobanDeploymentVerifier', () => {
  let store: ApprovedFingerprintStore;
  let verifier: SorobanDeploymentVerifier;

  beforeEach(() => {
    store = new ApprovedFingerprintStore();
    verifier = new SorobanDeploymentVerifier(store);
  });

  it('reports an approved deployment', () => {
    verifier.approve(observation(), { label: 'bridge v1', now: 1 });

    const result = verifier.verify(observation(), 2);

    expect(result.status).toBe(VerificationStatus.APPROVED);
    expect(result.matched?.label).toBe('bridge v1');
    expect(result.reasons).toEqual([]);
    expect(result.differences).toEqual([]);
  });

  it('approves regardless of when or how the deployment was observed', () => {
    verifier.approve(observation({ txHash: 'tx-1', observedAt: 1 }), {
      now: 1,
    });

    expect(
      verifier.isVerified(observation({ txHash: 'tx-2', observedAt: 500 })),
    ).toBe(true);
  });

  // Nothing approved is a different problem from something that changed: one
  // needs an approval decision, the other needs investigation.
  it('reports an unknown contract distinctly from a mismatch', () => {
    const result = verifier.verify(observation(), 7);

    expect(result.status).toBe(VerificationStatus.UNKNOWN);
    expect(result.reasons).toEqual([MismatchReason.NO_APPROVED_FINGERPRINT]);
    expect(result.comparedAgainst).toBeUndefined();
  });

  describe('mismatches', () => {
    beforeEach(() => {
      verifier.approve(observation(), { label: 'bridge v1', now: 1 });
    });

    it('detects a changed wasm hash', () => {
      const result = verifier.verify(
        observation({ wasmHash: 'b'.repeat(64) }),
        3,
      );

      expect(result.status).toBe(VerificationStatus.MISMATCH);
      expect(result.reasons).toContain(MismatchReason.WASM_HASH_CHANGED);
      expect(result.comparedAgainst?.label).toBe('bridge v1');
      expect(result.differences[0]).toMatch(/Wasm hash/);
    });

    it('detects a changed interface', () => {
      const result = verifier.verify(
        observation({
          interface: {
            functions: ['burn(amount:i128)'],
            events: [],
            errors: [],
          },
        }),
      );

      expect(result.reasons).toContain(MismatchReason.INTERFACE_CHANGED);
    });

    it('detects a changed spec version', () => {
      const result = verifier.verify(observation({ specVersion: '2.0.0' }));

      expect(result.reasons).toContain(MismatchReason.SPEC_VERSION_CHANGED);
    });

    it('lists every reason at once', () => {
      const result = verifier.verify(
        observation({
          wasmHash: 'c'.repeat(64),
          specVersion: '2.0.0',
          interface: { functions: ['burn()'], events: [], errors: [] },
        }),
      );

      expect(result.reasons).toEqual(
        expect.arrayContaining([
          MismatchReason.WASM_HASH_CHANGED,
          MismatchReason.INTERFACE_CHANGED,
          MismatchReason.SPEC_VERSION_CHANGED,
        ]),
      );
      expect(result.differences).toHaveLength(3);
    });

    // A deployment on the wrong network has no approvals of its own; treating
    // it as merely "unknown" is the honest answer, not "approved".
    it('does not approve a deployment seen on another network', () => {
      const result = verifier.verify(
        observation({ network: FingerprintNetwork.PUBLIC }),
      );

      expect(result.status).toBe(VerificationStatus.UNKNOWN);
    });

    it('compares against the most recent approval when several exist', () => {
      verifier.approve(observation({ wasmHash: 'd'.repeat(64) }), {
        label: 'bridge v2',
        now: 9,
      });

      const result = verifier.verify(observation({ wasmHash: 'e'.repeat(64) }));

      expect(result.comparedAgainst?.label).toBe('bridge v2');
    });
  });

  describe('revocation', () => {
    it('reports a revoked deployment as revoked, not merely mismatched', () => {
      const approved = verifier.approve(observation(), { now: 1 });

      store.revoke(
        ADDRESS,
        FingerprintNetwork.TESTNET,
        approved.fingerprint,
        'compromised key',
      );

      const result = verifier.verify(observation(), 5);

      expect(result.status).toBe(VerificationStatus.REVOKED);
      expect(result.reasons).toEqual([MismatchReason.FINGERPRINT_REVOKED]);
      expect(result.differences[0]).toContain('compromised key');
      expect(verifier.isVerified(observation())).toBe(false);
    });
  });

  it('verifies a batch', () => {
    verifier.approve(observation(), { now: 1 });

    const results = verifier.verifyMany([
      observation(),
      observation({ wasmHash: 'f'.repeat(64) }),
    ]);

    expect(results.map((result) => result.status)).toEqual([
      VerificationStatus.APPROVED,
      VerificationStatus.MISMATCH,
    ]);
  });
});

describe('diffFingerprints', () => {
  it('finds nothing between identical fingerprints', () => {
    const details = computeDeploymentFingerprint(observation(), 1);

    expect(diffFingerprints(details, details)).toEqual({
      reasons: [],
      differences: [],
    });
  });

  it('names a spec version that was added', () => {
    const before = computeDeploymentFingerprint(
      observation({ specVersion: undefined }),
      1,
    );
    const after = computeDeploymentFingerprint(
      observation({ specVersion: '2.0.0' }),
      1,
    );

    expect(diffFingerprints(before, after).differences[0]).toBe(
      'Spec version none → 2.0.0',
    );
  });
});
