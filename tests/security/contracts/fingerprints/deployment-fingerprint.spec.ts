import {
  EMPTY_INTERFACE_DIGEST,
  canonicalizeInterface,
  computeDeploymentFingerprint,
  computeInterfaceDigest,
  contractKey,
  fingerprintsMatch,
  normalizeContractAddress,
  normalizeWasmHash,
  shortFingerprint,
} from '../../../../src/security/contracts/fingerprints/deployment-fingerprint';
import {
  DeploymentObservation,
  FingerprintNetwork,
} from '../../../../src/security/contracts/fingerprints/types';

const ADDRESS = 'CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K';
const WASM_HASH = 'a'.repeat(64);

function observation(
  overrides: Partial<DeploymentObservation> = {},
): DeploymentObservation {
  return {
    contractAddress: ADDRESS,
    network: FingerprintNetwork.TESTNET,
    wasmHash: WASM_HASH,
    specVersion: '1.2.0',
    interface: {
      functions: [
        'transfer(from:address,to:address,amount:i128):bool',
        'balance(id:address):i128',
      ],
      events: ['transfer'],
      errors: [1, 2],
    },
    ...overrides,
  };
}

describe('normalizeContractAddress', () => {
  it('upper-cases and trims', () => {
    expect(normalizeContractAddress(`  ${ADDRESS.toLowerCase()} `)).toBe(
      ADDRESS,
    );
  });

  it('rejects an empty address', () => {
    expect(() => normalizeContractAddress('  ')).toThrow(
      /Contract address is required/,
    );
  });
});

describe('normalizeWasmHash', () => {
  it('lower-cases, trims and drops an 0x prefix', () => {
    expect(normalizeWasmHash(`0x${WASM_HASH.toUpperCase()}`)).toBe(WASM_HASH);
  });

  it('rejects an empty hash', () => {
    expect(() => normalizeWasmHash('')).toThrow(/Wasm hash is required/);
  });

  // A base64 hash would fingerprint cleanly and then never match anything —
  // a permanent silent mismatch is worse than a loud failure here.
  it('rejects a non-hex hash', () => {
    expect(() => normalizeWasmHash('bm90LWhleA==')).toThrow(
      /must be hex encoded/,
    );
  });
});

describe('canonicalizeInterface', () => {
  it('sorts and de-duplicates', () => {
    const canonical = canonicalizeInterface({
      functions: ['b()', 'a()', 'b()'],
      events: ['z', 'y'],
      errors: [5, 1, 5],
    });

    expect(canonical.functions).toEqual(['a()', 'b()']);
    expect(canonical.events).toEqual(['y', 'z']);
    expect(canonical.errors).toEqual([1, 5]);
  });

  it('tolerates a missing surface', () => {
    expect(canonicalizeInterface()).toEqual({
      functions: [],
      events: [],
      errors: [],
    });
  });

  it('drops blank entries', () => {
    expect(
      canonicalizeInterface({
        functions: ['  ', 'a()'],
        events: [],
        errors: [],
      }).functions,
    ).toEqual(['a()']);
  });
});

describe('computeInterfaceDigest', () => {
  // Two nodes can enumerate a spec in different orders; that is not a change.
  it('does not depend on ordering', () => {
    const first = computeInterfaceDigest({
      functions: ['a()', 'b()'],
      events: ['x'],
      errors: [1, 2],
    });
    const second = computeInterfaceDigest({
      functions: ['b()', 'a()'],
      events: ['x'],
      errors: [2, 1],
    });

    expect(first).toBe(second);
  });

  it('changes when a function is added', () => {
    const before = computeInterfaceDigest({
      functions: ['a()'],
      events: [],
      errors: [],
    });
    const after = computeInterfaceDigest({
      functions: ['a()', 'b()'],
      events: [],
      errors: [],
    });

    expect(after).not.toBe(before);
  });

  it('changes when a signature changes', () => {
    const before = computeInterfaceDigest({
      functions: ['transfer(amount:i128)'],
      events: [],
      errors: [],
    });
    const after = computeInterfaceDigest({
      functions: ['transfer(amount:u64)'],
      events: [],
      errors: [],
    });

    expect(after).not.toBe(before);
  });

  it('gives a missing surface the empty digest', () => {
    expect(computeInterfaceDigest(undefined)).toBe(EMPTY_INTERFACE_DIGEST);
  });
});

describe('computeDeploymentFingerprint', () => {
  it('is stable across repeated computation', () => {
    expect(computeDeploymentFingerprint(observation(), 1).fingerprint).toBe(
      computeDeploymentFingerprint(observation(), 2).fingerprint,
    );
  });

  // The fingerprint answers "is this the deployment we approved", so when and
  // how we observed it must not enter into it.
  it('ignores observation-time context', () => {
    const base = computeDeploymentFingerprint(observation());
    const later = computeDeploymentFingerprint(
      observation({
        observedAt: 999,
        deployedAt: 12345,
        txHash: 'different-tx',
        deployerAddress: 'GSOMEONEELSE',
      }),
    );

    expect(later.fingerprint).toBe(base.fingerprint);
  });

  it('normalizes address and hash before hashing', () => {
    const base = computeDeploymentFingerprint(observation());
    const messy = computeDeploymentFingerprint(
      observation({
        contractAddress: ADDRESS.toLowerCase(),
        wasmHash: `0x${WASM_HASH.toUpperCase()}`,
      }),
    );

    expect(messy.fingerprint).toBe(base.fingerprint);
  });

  it('changes when the wasm hash changes', () => {
    const base = computeDeploymentFingerprint(observation());
    const upgraded = computeDeploymentFingerprint(
      observation({ wasmHash: 'b'.repeat(64) }),
    );

    expect(upgraded.fingerprint).not.toBe(base.fingerprint);
  });

  it('changes when the interface changes', () => {
    const base = computeDeploymentFingerprint(observation());
    const changed = computeDeploymentFingerprint(
      observation({
        interface: { functions: ['burn(amount:i128)'], events: [], errors: [] },
      }),
    );

    expect(changed.fingerprint).not.toBe(base.fingerprint);
  });

  it('changes when the spec version changes', () => {
    const base = computeDeploymentFingerprint(observation());
    const bumped = computeDeploymentFingerprint(
      observation({ specVersion: '1.3.0' }),
    );

    expect(bumped.fingerprint).not.toBe(base.fingerprint);
  });

  // The same contract id can exist on testnet and public with different code;
  // colliding them would let a testnet deployment pass a mainnet check.
  it('separates networks', () => {
    const testnet = computeDeploymentFingerprint(observation());
    const publicNet = computeDeploymentFingerprint(
      observation({ network: FingerprintNetwork.PUBLIC }),
    );

    expect(publicNet.fingerprint).not.toBe(testnet.fingerprint);
  });

  it('carries the normalized fields through', () => {
    const result = computeDeploymentFingerprint(observation(), 42);

    expect(result.contractAddress).toBe(ADDRESS);
    expect(result.wasmHash).toBe(WASM_HASH);
    expect(result.specVersion).toBe('1.2.0');
    expect(result.computedAt).toBe(42);
    expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('treats a missing spec version as absent rather than empty', () => {
    expect(
      computeDeploymentFingerprint(observation({ specVersion: '  ' }))
        .specVersion,
    ).toBeUndefined();
  });

  it('rejects an observation without a network', () => {
    expect(() =>
      computeDeploymentFingerprint(
        observation({ network: undefined as never }),
      ),
    ).toThrow(/Network is required/);
  });

  it('fingerprints a deployment with no known interface', () => {
    const result = computeDeploymentFingerprint(
      observation({ interface: undefined }),
    );

    expect(result.interfaceDigest).toBe(EMPTY_INTERFACE_DIGEST);
  });
});

describe('fingerprintsMatch', () => {
  it('compares by fingerprint alone', () => {
    const left = computeDeploymentFingerprint(observation(), 1);
    const right = computeDeploymentFingerprint(observation(), 2);

    expect(fingerprintsMatch(left, right)).toBe(true);
    expect(
      fingerprintsMatch(
        left,
        computeDeploymentFingerprint(observation({ wasmHash: 'c'.repeat(64) })),
      ),
    ).toBe(false);
  });
});

describe('contractKey', () => {
  it('scopes the key by network', () => {
    expect(contractKey(ADDRESS, FingerprintNetwork.TESTNET)).not.toBe(
      contractKey(ADDRESS, FingerprintNetwork.PUBLIC),
    );
  });

  it('normalizes the address', () => {
    expect(contractKey(ADDRESS.toLowerCase(), FingerprintNetwork.TESTNET)).toBe(
      contractKey(ADDRESS, FingerprintNetwork.TESTNET),
    );
  });
});

describe('shortFingerprint', () => {
  it('truncates for log lines', () => {
    expect(shortFingerprint('abcdef1234567890', 6)).toBe('abcdef');
  });
});
