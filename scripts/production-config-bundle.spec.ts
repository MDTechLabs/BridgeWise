import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONFIG_CHAIN_PROFILES,
  CONFIG_INVARIANTS,
  CONFIG_PARAMETER_SET,
  ConfigBundleError,
  ConfigBundleOptions,
  ConfigSigningIdentity,
  MAX_CONFIG_CHAINS,
  MAX_CONFIG_LIFETIME_MS,
  ProductionConfigBundle,
  ProductionConfigRegistry,
  canonicalJson,
  createTestSigningIdentity,
  productionConfigDigest,
  publicReviewerKey,
  seededRandom,
  signConfigDigest,
  testBundle,
} from './production-config-bundle';

const SPEC_DOC = join(__dirname, '..', 'docs', 'PRODUCTION_CONFIGURATION_BUNDLE.md');
const OPERATOR = 'operator';
const START = 1_700_000_000_000;

function identities(count = 3): ConfigSigningIdentity[] {
  return Array.from({ length: count }, (_, index) => createTestSigningIdentity(`reviewer-${index}`));
}

function options(keys: ConfigSigningIdentity[], overrides: Partial<ConfigBundleOptions> = {}): ConfigBundleOptions {
  return {
    reviewers: keys.map(publicReviewerKey),
    operators: [OPERATOR],
    now: START,
    ...overrides,
  };
}

function approveAll(
  registry: ProductionConfigRegistry,
  keys: ConfigSigningIdentity[],
  bundle: ProductionConfigBundle,
  count = keys.length,
): string {
  let digest = '';
  for (const key of keys.slice(0, count)) {
    digest = registry.approve(key.reviewerId, bundle, signConfigDigest(key, productionConfigDigest(bundle)));
  }
  return digest;
}

function expectError(fn: () => unknown, code?: string): ConfigBundleError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigBundleError);
    if (code) expect((error as ConfigBundleError).code).toBe(code);
    return error as ConfigBundleError;
  }
  throw new Error(`expected ConfigBundleError ${code ?? ''}`);
}

function expectAtomic(registry: ProductionConfigRegistry, fn: () => unknown, code: string): void {
  const before = JSON.stringify(registry.snapshot());
  expectError(fn, code);
  expect(JSON.stringify(registry.snapshot())).toBe(before);
  expect(registry.invariantViolations()).toEqual([]);
}

describe('production configuration bundle specification', () => {
  it('documents every invariant, chain and error code in the normative spec', () => {
    const doc = readFileSync(SPEC_DOC, 'utf8');
    for (const id of CONFIG_INVARIANTS) expect(doc).toContain(`\`${id}\``);
    for (const chain of CONFIG_CHAIN_PROFILES) {
      expect(doc).toContain(`\`${chain.chainId}\``);
      expect(doc).toContain(`\`${chain.parameterSource}\``);
    }
    expect(doc).toContain(CONFIG_PARAMETER_SET);
    const registry = new ProductionConfigRegistry(options(identities()));
    const bundle = testBundle();
    const invalidInputs: Array<[unknown, string]> = [
      [null, 'invalid-bundle'],
      [{ ...bundle, extra: 1 }, 'untrusted-field'],
      [{ ...bundle, schemaVersion: 2 }, 'unsupported-schema'],
      [{ ...bundle, parameterSetVersion: 'production-config/0.0.1' }, 'unsupported-parameter-set'],
      [{ ...bundle, releaseId: 'bad' }, 'invalid-release'],
      [{ ...bundle, sourceCommit: 'short' }, 'invalid-commit'],
      [{ ...bundle, effectiveFrom: START + MAX_CONFIG_LIFETIME_MS }, 'invalid-validity-window'],
      [{ ...bundle, expiresAt: START + MAX_CONFIG_LIFETIME_MS + 1 }, 'invalid-validity-window'],
      [{ ...bundle, chains: [] }, 'invalid-chains'],
      [{ ...bundle, chains: [...bundle.chains].reverse() }, 'invalid-chains'],
      [{ ...bundle, chains: bundle.chains.slice(1) }, 'incomplete-chain-coverage'],
      [{ ...bundle, chains: [{ ...bundle.chains[0], chainId: 'evm:9999' }, ...bundle.chains.slice(1)] }, 'unsupported-chain'],
      [{ ...bundle, chains: [{ ...bundle.chains[0], finalityDepth: 0 }, ...bundle.chains.slice(1)] }, 'invalid-profile-bounds'],
    ];
    for (const [input, code] of invalidInputs) {
      expectError(() => registry.validate(input), code);
    }
  });

  it('uses explicit, unique, bounded and versioned chain parameters', () => {
    expect(CONFIG_CHAIN_PROFILES.length).toBe(7);
    expect(new Set(CONFIG_CHAIN_PROFILES.map((c) => c.chainId)).size).toBe(7);
    expect(CONFIG_CHAIN_PROFILES.map((c) => c.chainId)).toEqual(
      [...CONFIG_CHAIN_PROFILES.map((c) => c.chainId)].sort(),
    );
    expect(CONFIG_CHAIN_PROFILES.length).toBeLessThanOrEqual(MAX_CONFIG_CHAINS);
    for (const chain of CONFIG_CHAIN_PROFILES) {
      expect(chain.parameterSetVersion).toBe(CONFIG_PARAMETER_SET);
      expect(chain.reorgWindow).toBeGreaterThanOrEqual(chain.finalityDepth);
      expect(BigInt(chain.maxAmountMinorUnits)).toBeGreaterThan(0n);
      expect(chain.minValidatorQuorum).toBeGreaterThanOrEqual(2);
      expect(chain.maxMessageBytes).toBeLessThanOrEqual(65536);
    }
  });

  it('rejects malformed reviewer, operator and profile configuration', () => {
    expectError(() => new ProductionConfigRegistry(options([])), 'invalid-reviewers');
    expectError(
      () => new ProductionConfigRegistry(options(identities(2), { operators: [] })),
      'invalid-operators',
    );
    expectError(
      () => new ProductionConfigRegistry(options(identities(2), { minApprovals: 3 })),
      'invalid-quorum',
    );
    expectError(
      () => new ProductionConfigRegistry(options(identities(2), { chainProfiles: [] })),
      'invalid-profiles',
    );
  });
});

describe('bundle digest and validation', () => {
  it('produces a reproducible digest independent of object key order', () => {
    const bundle = testBundle();
    expect(productionConfigDigest(bundle)).toBe(productionConfigDigest(testBundle()));
    expect(productionConfigDigest(bundle)).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ amount: 10n })).toBe('{"amount":"10"}');
    expectError(() => canonicalJson({ value: 1.5 }), 'invalid-input');
    expectError(() => canonicalJson({ value: Number.MAX_SAFE_INTEGER + 1 }), 'invalid-input');
  });

  it('changes the digest for any reviewed field change', () => {
    const bundle = testBundle();
    const digest = productionConfigDigest(bundle);
    expect(productionConfigDigest(testBundle({ releaseSequence: 2 }))).not.toBe(digest);
    expect(productionConfigDigest(testBundle({ sourceCommit: 'b'.repeat(40) }))).not.toBe(digest);
    expect(productionConfigDigest(testBundle({
      chains: bundle.chains.map((chain, index) => index === 0
        ? { ...chain, finalityDepth: chain.finalityDepth + 1 }
        : chain),
    }))).not.toBe(digest);
  });

  it.each<[string, Partial<ProductionConfigBundle>, string]>([
    ['non-integer sequence', { releaseSequence: 1.5 }, 'invalid-release'],
    ['zero sequence', { releaseSequence: 0 }, 'invalid-release'],
    ['uppercase commit', { sourceCommit: 'A'.repeat(40) }, 'invalid-commit'],
    ['64-char commit is not the reviewed format', { sourceCommit: 'a'.repeat(64) }, 'invalid-commit'],
    ['fractional time', { effectiveFrom: 1.5 }, 'invalid-time'],
    ['negative time', { effectiveFrom: -1 }, 'invalid-time'],
    ['expiry equals start', { expiresAt: START }, 'invalid-validity-window'],
    ['expiry after maximum lifetime', { expiresAt: START + MAX_CONFIG_LIFETIME_MS + 1 }, 'invalid-validity-window'],
    ['too many chains', { chains: [...CONFIG_CHAIN_PROFILES, CONFIG_CHAIN_PROFILES[0]] }, 'invalid-chains'],
  ])('rejects %s', (_name, overrides, code) => {
    expectError(() => new ProductionConfigRegistry(options(identities())).validate(testBundle(overrides)), code);
  });

  it('rejects chain entries with untrusted, malformed or oversized values', () => {
    const registry = new ProductionConfigRegistry(options(identities()));
    const bundle = testBundle();
    const withChain = (index: number, patch: Record<string, unknown>) => testBundle({
      chains: bundle.chains.map((chain, i) => i === index ? { ...chain, ...patch } : chain),
    });
    expectError(() => registry.validate(withChain(0, { rpcUrl: 'https://untrusted' })), 'untrusted-field');
    expectError(() => registry.validate(withChain(0, { bridgeAddress: '0x1234' })), 'invalid-address');
    expectError(() => registry.validate(withChain(0, { maxAmountMinorUnits: '-1' })), 'invalid-amount');
    expectError(() => registry.validate(withChain(0, { tokenDecimals: 255 })), 'invalid-decimals');
    expectError(() => registry.validate(withChain(0, { maxMessageBytes: 10 })), 'invalid-profile-bounds');
    expectError(() => registry.validate(withChain(0, { minValidatorQuorum: 1 })), 'invalid-quorum');
  });
});

describe('reviewer approval and activation', () => {
  it('activates a fully approved bundle and verifies the immutable active snapshot', () => {
    const keys = identities();
    const registry = new ProductionConfigRegistry(options(keys));
    const bundle = testBundle();
    const digest = approveAll(registry, keys, bundle);
    expect(digest).toBe(productionConfigDigest(bundle));
    expect(registry.activate(OPERATOR, bundle).approvals).toHaveLength(3);

    const twoOfThree = new ProductionConfigRegistry(options(keys, { minApprovals: 2 }));
    const digest2 = approveAll(twoOfThree, keys, bundle, 2);
    const receipt = twoOfThree.activate(OPERATOR, bundle);
    expect(receipt.digest).toBe(digest2);
    expect(receipt.approvals).toEqual([keys[0].reviewerId, keys[1].reviewerId].sort());
    expect(twoOfThree.active?.releaseId).toBe(bundle.releaseId);
    expect(twoOfThree.digest).toBe(digest2);
    expect(() => twoOfThree.verifyActive()).not.toThrow();
    expect(twoOfThree.invariantViolations()).toEqual([]);
  });

  it('enforces the configured quorum with distinct reviewers', () => {
    const keys = identities(3);
    const registry = new ProductionConfigRegistry(options(keys, { minApprovals: 2 }));
    const bundle = testBundle();
    approveAll(registry, keys, bundle, 1);
    expectAtomic(registry, () => registry.activate(OPERATOR, bundle), 'quorum-not-met');
    expect(registry.invariantViolations()).toEqual([]);
  });

  it('rejects unauthorized, invalid, duplicated and rebound approvals atomically', () => {
    const keys = identities(3);
    const outsider = createTestSigningIdentity('outsider');
    const registry = new ProductionConfigRegistry(options(keys, { minApprovals: 2 }));
    const bundle = testBundle();
    const digest = productionConfigDigest(bundle);
    expectAtomic(registry, () => registry.approve(outsider.reviewerId, bundle, signConfigDigest(outsider, digest)), 'unauthorized-reviewer');
    expectAtomic(registry, () => registry.approve(keys[0].reviewerId, bundle, '0'.repeat(128)), 'invalid-signature');
    expectAtomic(registry, () => registry.approve(keys[0].reviewerId, bundle, signConfigDigest(outsider, digest)), 'invalid-signature');
    expectAtomic(
      registry,
      () => registry.approve(keys[0].reviewerId, testBundle({ releaseSequence: 2 }), signConfigDigest(keys[0], digest)),
      'invalid-signature',
    );
    registry.approve(keys[0].reviewerId, bundle, signConfigDigest(keys[0], digest));
    const before = JSON.stringify(registry.snapshot());
    expectError(() => registry.approve(keys[0].reviewerId, bundle, signConfigDigest(keys[0], digest)), 'duplicate-approval');
    expect(JSON.stringify(registry.snapshot())).toBe(before);
    expect(registry.invariantViolations()).toEqual([]);
  });

  it('binds an approval to a different bundle only when its signature matches that digest', () => {
    const keys = identities(3);
    const registry = new ProductionConfigRegistry(options(keys, { minApprovals: 2 }));
    const first = testBundle();
    const second = testBundle({ releaseSequence: 2, releaseId: 'rel-baseline-2' });
    registry.approve(keys[0].reviewerId, first, signConfigDigest(keys[0], productionConfigDigest(first)));
    expectAtomic(
      registry,
      () => registry.activate(OPERATOR, second),
      'quorum-not-met',
    );
    approveAll(registry, keys, second, 2);
    expect(() => registry.activate(OPERATOR, second)).not.toThrow();
  });

  it('enforces the operator boundary, validity window and monotonic releases', () => {
    const keys = identities();
    const registry = new ProductionConfigRegistry(options(keys, { minApprovals: 2, now: START - 1 }));
    const bundle = testBundle();
    approveAll(registry, keys, bundle);
    expectAtomic(registry, () => registry.activate('attacker', bundle), 'unauthorized-operator');
    expectAtomic(registry, () => registry.activate(OPERATOR, bundle), 'not-effective');
    registry.setNow(START);
    expect(() => registry.activate(OPERATOR, bundle)).not.toThrow();
    expectAtomic(registry, () => registry.activate(OPERATOR, bundle), 'replay');
    expectAtomic(
      registry,
      () => registry.approve(keys[0].reviewerId, bundle, signConfigDigest(keys[0], productionConfigDigest(bundle))),
      'replay',
    );

    const next = testBundle({ releaseId: 'rel-baseline-2', releaseSequence: 2 });
    approveAll(registry, keys, next);
    expect(() => registry.activate(OPERATOR, next)).not.toThrow();

    const stale = testBundle({ releaseId: 'rel-stale-1', releaseSequence: 1 });
    approveAll(registry, keys, stale);
    expectAtomic(registry, () => registry.activate(OPERATOR, stale), 'stale-release');

    const expiring = testBundle({ releaseId: 'rel-expiring-3', releaseSequence: 3 });
    approveAll(registry, keys, expiring);
    registry.setNow(bundle.expiresAt);
    expectError(() => registry.verifyActive(), 'expired');
    expect(registry.invariantViolations()).toContain('B-8');
    const beforeExpiry = JSON.stringify(registry.snapshot());
    expectError(() => registry.activate(OPERATOR, expiring), 'expired');
    expect(JSON.stringify(registry.snapshot())).toBe(beforeExpiry);
  });

  it('rejects a clock that moves backwards', () => {
    const registry = new ProductionConfigRegistry(options(identities()));
    expectError(() => registry.setNow(START - 1), 'clock-must-not-go-backwards');
    expect(registry.snapshot().now).toBe(START);
  });
});

describe('stateful fuzz and resource bounds', () => {
  it('keeps invariants and atomicity across randomized multi-step sequences', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const random = seededRandom(seed);
      const keys = identities();
      const registry = new ProductionConfigRegistry(options(keys, { minApprovals: 2 }));
      const outsider = createTestSigningIdentity('fuzz-outsider');
      let activated: ProductionConfigBundle | null = null;
      for (let step = 0; step < 60; step++) {
        const sequence = activated ? activated.releaseSequence + 1 : 1;
        const bundle = testBundle({
          releaseId: `rel-fuzz-${sequence}`,
          releaseSequence: sequence,
          sourceCommit: Math.floor(random() * 16).toString(16).repeat(40).slice(0, 40),
        });
        const digest = productionConfigDigest(bundle);
        const signer = random() < 0.15 ? outsider : keys[Math.floor(random() * keys.length)];
        const signature = signConfigDigest(signer, random() < 0.1 ? '0'.repeat(64) : digest);
        const action = Math.floor(random() * 4);
        const before = JSON.stringify(registry.snapshot());
        try {
          if (action === 0) registry.approve(signer.reviewerId, bundle, signature);
          else if (action === 1) {
            const receipt = registry.activate(random() < 0.1 ? 'attacker' : OPERATOR, bundle);
            activated = bundle;
            expect(receipt.digest).toBe(digest);
          } else if (action === 2) {
            registry.validate(bundle);
          } else registry.invariantViolations();
        } catch (error) {
          expect(error).toBeInstanceOf(ConfigBundleError);
          expect(JSON.stringify(registry.snapshot())).toBe(before);
        }
        expect(registry.invariantViolations()).toEqual([]);
        if (registry.active) {
          expect(() => registry.verifyActive()).not.toThrow();
          expect(registry.active.releaseSequence).toBeGreaterThan(0);
        }
      }
    }
  });

  it('bounds validation work to the reviewed chain and signature sets', () => {
    const keys = identities();
    const registry = new ProductionConfigRegistry(options(keys));
    const oversized = testBundle({
      chains: Array.from({ length: 64 }, () => ({ ...CONFIG_CHAIN_PROFILES[0] })),
    });
    expectError(() => registry.validate(oversized), 'invalid-chains');
    const valid = testBundle();
    expect(productionConfigDigest(valid)).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(valid).length).toBe(8);
    expect(valid.chains.length).toBeLessThanOrEqual(MAX_CONFIG_CHAINS);
  });
});
