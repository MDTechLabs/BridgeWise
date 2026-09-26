import { CertificationRegistry } from './certification-registry';
import { ProviderCertificationInput } from './types';

describe('CertificationRegistry', () => {
  const now = () => 1_700_000_000_000;

  const baseInput: ProviderCertificationInput = {
    providerId: 'allbridge',
    usesHttps: true,
    hasValidMetadata: true,
    uptime: 99.9,
    successRate: 0.99,
    avgLatencyMs: 100,
    versionIsSemver: true,
    networkIsSupported: true,
    supportedAssetCount: 20,
    registeredAt: now() - 90 * 24 * 60 * 60 * 1000,
    historicalOperationCount: 10_000,
  };

  describe('constructor validation', () => {
    it('throws when maxEntries < 1', () => {
      expect(() => new CertificationRegistry({ maxEntries: 0 })).toThrow(
        RangeError,
      );
    });
  });

  describe('certify', () => {
    let registry: CertificationRegistry;

    beforeEach(() => {
      registry = new CertificationRegistry({
        now,
        engineConfig: { now },
      });
    });

    it('returns a certification result with provider id', () => {
      const result = registry.certify(baseInput);
      expect(result.providerId).toBe('allbridge');
      expect(result.level).toBeTruthy();
      expect(result.score).toBeGreaterThan(0);
    });

    it('stores the certification in the registry', () => {
      registry.certify(baseInput);
      expect(registry.size).toBe(1);
      expect(registry.get('allbridge')).toBeTruthy();
    });

    it('re-certifying the same provider updates the record', () => {
      registry.certify(baseInput);
      registry.certify({ ...baseInput, uptime: 50 });
      const updated = registry.get('allbridge');
      expect(updated!.level).not.toBe('platinum');
    });

    it('throws when registry is at capacity', () => {
      registry = new CertificationRegistry({ maxEntries: 1, now });
      registry.certify(baseInput);
      expect(() =>
        registry.certify({
          ...baseInput,
          providerId: 'another-provider',
        }),
      ).toThrow('at capacity');
    });

    it('allows re-certifying even when at capacity', () => {
      registry = new CertificationRegistry({ maxEntries: 1, now });
      registry.certify(baseInput);
      // Re-certify same provider — should not throw
      expect(() =>
        registry.certify({ ...baseInput, uptime: 95 }),
      ).not.toThrow();
    });
  });

  describe('revoke', () => {
    let registry: CertificationRegistry;

    beforeEach(() => {
      registry = new CertificationRegistry({
        now,
        engineConfig: { now },
      });
      registry.certify(baseInput);
    });

    it('revokes a certification', () => {
      expect(registry.revoke('allbridge')).toBe(true);
      const record = registry.get('allbridge')!;
      expect(record.status).toBe('revoked');
      expect(record.statusReason).toContain('revoked');
    });

    it('sets a custom revoke reason', () => {
      registry.revoke('allbridge', 'Security incident');
      expect(registry.get('allbridge')!.statusReason).toBe('Security incident');
    });

    it('returns false for unknown provider', () => {
      expect(registry.revoke('unknown-id')).toBe(false);
    });

    it('sets updatedAt on revoke', () => {
      registry.revoke('allbridge');
      expect(registry.get('allbridge')!.updatedAt).toBe(now());
    });
  });

  describe('reevaluate', () => {
    let registry: CertificationRegistry;

    beforeEach(() => {
      registry = new CertificationRegistry({
        now,
        engineConfig: { now },
      });
      registry.certify(baseInput);
    });

    it('re-evaluates with partial updates', () => {
      const result = registry.reevaluate('allbridge', {
        uptime: 50,
        successRate: 0.5,
        avgLatencyMs: 1500,
        usesHttps: false,
        hasValidMetadata: false,
        versionIsSemver: false,
        networkIsSupported: false,
        supportedAssetCount: 0,
        historicalOperationCount: 0,
      });
      expect(result).toBeTruthy();
      expect(result!.level).toBe('uncertified');
    });

    it('returns null for unknown provider', () => {
      expect(registry.reevaluate('unknown', { uptime: 50 })).toBeNull();
    });
  });

  describe('query', () => {
    let registry: CertificationRegistry;

    beforeEach(() => {
      registry = new CertificationRegistry({
        now,
        engineConfig: { now },
      });
      registry.certify({ ...baseInput, providerId: 'gold-a' });
      registry.certify({
        ...baseInput,
        providerId: 'uncertified-b',
        usesHttps: false,
        hasValidMetadata: false,
        uptime: 30,
        successRate: 0.2,
        avgLatencyMs: 3000,
        versionIsSemver: false,
        networkIsSupported: false,
        supportedAssetCount: 0,
        historicalOperationCount: 0,
      });
    });

    it('returns all certifications ordered by issuedAt', () => {
      const all = registry.getAll();
      expect(all).toHaveLength(2);
      expect(all[0].issuedAt).toBeLessThanOrEqual(all[1].issuedAt);
    });

    it('filters by level', () => {
      const results = registry.query({ level: 'uncertified' });
      expect(results).toHaveLength(1);
      expect(results[0].providerId).toBe('uncertified-b');
    });

    it('filters by status', () => {
      registry.revoke('gold-a');
      const results = registry.query({ status: 'revoked' });
      expect(results).toHaveLength(1);
      expect(results[0].providerId).toBe('gold-a');
    });

    it('filters by validOnly', () => {
      registry.revoke('gold-a');
      const results = registry.query({ validOnly: true });
      expect(results).toHaveLength(1);
      expect(results[0].providerId).toBe('uncertified-b');
    });

    it('combines multiple filters', () => {
      const results = registry.query({
        status: 'active',
        validOnly: true,
      });
      expect(results.every((r) => r.status === 'active')).toBe(true);
    });
  });

  describe('certifiedAtOrAbove', () => {
    let registry: CertificationRegistry;

    beforeEach(() => {
      registry = new CertificationRegistry({
        now,
        engineConfig: { now },
      });
      // Gold provider
      registry.certify(baseInput);
      // Uncertified provider
      registry.certify({
        ...baseInput,
        providerId: 'uncertified',
        usesHttps: false,
        hasValidMetadata: false,
        uptime: 20,
        successRate: 0.1,
        avgLatencyMs: 4000,
        versionIsSemver: false,
        networkIsSupported: false,
        supportedAssetCount: 0,
        historicalOperationCount: 0,
      });
    });

    it('returns only providers at or above the given level', () => {
      const results = registry.certifiedAtOrAbove('gold');
      expect(results).toHaveLength(1);
      expect(results[0].providerId).toBe('allbridge');
    });

    it('returns both when minimum is uncertified', () => {
      const results = registry.certifiedAtOrAbove('uncertified');
      expect(results).toHaveLength(2);
    });
  });

  describe('isCertified', () => {
    let registry: CertificationRegistry;

    beforeEach(() => {
      registry = new CertificationRegistry({
        now,
        engineConfig: { now },
      });
      registry.certify(baseInput);
    });

    it('returns true for an active certification', () => {
      expect(registry.isCertified('allbridge')).toBe(true);
    });

    it('returns false for a revoked certification', () => {
      registry.revoke('allbridge');
      expect(registry.isCertified('allbridge')).toBe(false);
    });

    it('returns false for unknown provider', () => {
      expect(registry.isCertified('unknown')).toBe(false);
    });
  });

  describe('expiry', () => {
    it('refreshExpiry marks expired certifications', () => {
      const validity = 1000;
      let clock = now();
      const registry = new CertificationRegistry({
        now: () => clock,
        engineConfig: { now: () => clock, validityDurationMs: validity },
      });
      registry.certify(baseInput);

      // Initially not expired
      expect(registry.get('allbridge')!.status).toBe('active');

      // Advance clock past expiry
      clock = now() + validity + 1;
      const expiredCount = registry.refreshExpiry();
      expect(expiredCount).toBe(1);
      expect(registry.get('allbridge')!.status).toBe('expired');
      expect(registry.get('allbridge')!.statusReason).toBe(
        'Automatically expired',
      );
    });

    it('expired certifications are excluded by validOnly', () => {
      const validity = 1000;
      let clock = now();
      const registry = new CertificationRegistry({
        now: () => clock,
        engineConfig: { now: () => clock, validityDurationMs: validity },
      });
      registry.certify(baseInput);

      // Before expiry: valid
      expect(registry.query({ validOnly: true })).toHaveLength(1);

      // Advance clock past expiry
      clock = now() + validity + 1;
      registry.refreshExpiry();
      expect(registry.query({ validOnly: true })).toHaveLength(0);
    });
  });

  describe('summary', () => {
    it('returns counts per certification level', () => {
      const registry = new CertificationRegistry({
        now,
        engineConfig: { now },
      });
      registry.certify(baseInput);
      registry.certify({
        ...baseInput,
        providerId: 'uncertified',
        usesHttps: false,
        hasValidMetadata: false,
        uptime: 10,
        successRate: 0.1,
        avgLatencyMs: 5000,
        versionIsSemver: false,
        networkIsSupported: false,
        supportedAssetCount: 0,
        historicalOperationCount: 0,
      });

      const summary = registry.summary();
      expect(Object.keys(summary)).toHaveLength(5);
      expect(summary.gold).toBeGreaterThanOrEqual(0);
      expect(summary.uncertified).toBe(1);
    });
  });

  describe('remove', () => {
    let registry: CertificationRegistry;

    beforeEach(() => {
      registry = new CertificationRegistry({
        now,
        engineConfig: { now },
      });
      registry.certify(baseInput);
    });

    it('removes a certification', () => {
      expect(registry.remove('allbridge')).toBe(true);
      expect(registry.size).toBe(0);
      expect(registry.get('allbridge')).toBeUndefined();
    });

    it('returns false for unknown provider', () => {
      expect(registry.remove('unknown')).toBe(false);
    });
  });

  describe('event hooks', () => {
    it('calls onCertify from engine config', () => {
      const onCertify = jest.fn();
      const registry = new CertificationRegistry({
        now,
        engineConfig: { now, onCertify },
      });
      registry.certify(baseInput);
      expect(onCertify).toHaveBeenCalledTimes(1);
    });

    it('calls onStatusChange when certification is revoked', () => {
      const onStatusChange = jest.fn();
      const registry = new CertificationRegistry({
        now,
        engineConfig: { now },
        onStatusChange,
      });
      registry.certify(baseInput);
      registry.revoke('allbridge');
      expect(onStatusChange).toHaveBeenCalledWith(
        'allbridge',
        'active',
        'revoked',
      );
    });
  });
});
