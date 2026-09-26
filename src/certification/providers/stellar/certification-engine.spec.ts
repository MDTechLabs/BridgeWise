import { CertificationEngine } from './certification-engine';
import { ProviderCertificationInput } from './types';

describe('CertificationEngine', () => {
  const now = () => 1_700_000_000_000; // Fixed clock

  const platinumInput: ProviderCertificationInput = {
    providerId: 'platinum-provider',
    usesHttps: true,
    hasValidMetadata: true,
    uptime: 99.99,
    successRate: 0.999,
    avgLatencyMs: 50,
    versionIsSemver: true,
    networkIsSupported: true,
    supportedAssetCount: 30,
    registeredAt: now() - 120 * 24 * 60 * 60 * 1000, // 120 days ago
    historicalOperationCount: 50_000,
  };

  const goldInput: ProviderCertificationInput = {
    providerId: 'gold-provider',
    usesHttps: true,
    hasValidMetadata: true,
    uptime: 99.5,
    successRate: 0.98,
    avgLatencyMs: 200,
    versionIsSemver: true,
    networkIsSupported: true,
    supportedAssetCount: 15,
    registeredAt: now() - 60 * 24 * 60 * 60 * 1000, // 60 days ago
    historicalOperationCount: 5_000,
  };

  const bronzeInput: ProviderCertificationInput = {
    providerId: 'bronze-provider',
    usesHttps: true,
    hasValidMetadata: false,
    uptime: 85,
    successRate: 0.75,
    avgLatencyMs: 800,
    versionIsSemver: false,
    networkIsSupported: true,
    supportedAssetCount: 3,
    registeredAt: now() - 5 * 24 * 60 * 60 * 1000, // 5 days ago
    historicalOperationCount: 100,
  };

  const failingInput: ProviderCertificationInput = {
    providerId: 'failing-provider',
    usesHttps: false,
    hasValidMetadata: false,
    uptime: 30,
    successRate: 0.2,
    avgLatencyMs: 3000,
    versionIsSemver: false,
    networkIsSupported: false,
    supportedAssetCount: 0,
    registeredAt: now(), // just now
    historicalOperationCount: 0,
  };

  describe('constructor validation', () => {
    it("throws when weights don't sum to 1", () => {
      expect(
        () =>
          new CertificationEngine({
            weights: { security: 0.5 },
          }),
      ).toThrow(RangeError);
    });

    it('throws when thresholds are not strictly decreasing', () => {
      expect(
        () =>
          new CertificationEngine({
            thresholds: { platinum: 80, gold: 90 },
          }),
      ).toThrow(RangeError);
    });

    it('throws when thresholds are out of range', () => {
      expect(
        () =>
          new CertificationEngine({
            thresholds: { platinum: 110 },
          }),
      ).toThrow(RangeError);
    });
  });

  describe('evaluate — levels', () => {
    let engine: CertificationEngine;

    beforeEach(() => {
      engine = new CertificationEngine({ now });
    });

    it('awards platinum for an exceptional provider', () => {
      const result = engine.evaluate(platinumInput);
      expect(result.level).toBe('platinum');
      expect(result.score).toBeGreaterThanOrEqual(95);
      expect(result.status).toBe('active');
    });

    it('awards gold for a strong provider', () => {
      const result = engine.evaluate(goldInput);
      expect(result.level).toBe('gold');
      expect(result.score).toBeGreaterThanOrEqual(85);
      expect(result.score).toBeLessThan(95);
    });

    it('awards at least bronze for a moderate provider', () => {
      const result = engine.evaluate(bronzeInput);
      expect(result.level).toBe('bronze');
      expect(result.score).toBeGreaterThanOrEqual(50);
    });

    it('marks a failing provider as uncertified', () => {
      const result = engine.evaluate(failingInput);
      expect(result.level).toBe('uncertified');
      expect(result.score).toBeLessThan(50);
    });

    it('produces 5 criteria scores in each result', () => {
      const result = engine.evaluate(goldInput);
      expect(result.criteria).toHaveLength(5);
      const criterionNames = result.criteria.map((c) => c.criterion);
      expect(criterionNames).toEqual([
        'security',
        'reliability',
        'performance',
        'compliance',
        'trust',
      ]);
    });

    it('each criterion has a score between 0 and its weight * 100', () => {
      const result = engine.evaluate(goldInput);
      for (const c of result.criteria) {
        expect(c.score).toBeGreaterThanOrEqual(0);
        expect(c.score).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('evaluate — details', () => {
    let engine: CertificationEngine;

    beforeEach(() => {
      engine = new CertificationEngine({ now });
    });

    it('sets issuedAt from the clock', () => {
      const result = engine.evaluate(goldInput);
      expect(result.issuedAt).toBe(now());
    });

    it('sets expiresAt when validityDurationMs > 0', () => {
      engine = new CertificationEngine({
        now,
        validityDurationMs: 30 * 24 * 60 * 60 * 1000, // 30 days
      });
      const result = engine.evaluate(goldInput);
      expect(result.expiresAt).toBe(now() + 30 * 24 * 60 * 60 * 1000);
    });

    it('sets expiresAt to 0 when validityDurationMs is 0', () => {
      const result = engine.evaluate(goldInput);
      expect(result.expiresAt).toBe(0);
    });

    it('security criterion reaches 100% for HTTPS + valid metadata', () => {
      const result = engine.evaluate(platinumInput);
      const security = result.criteria.find((c) => c.criterion === 'security')!;
      expect(security.score).toBe(100 * 0.3);
    });

    it('security criterion is zero for no HTTPS and invalid metadata', () => {
      const result = engine.evaluate(failingInput);
      const security = result.criteria.find((c) => c.criterion === 'security')!;
      expect(security.score).toBe(0);
    });

    it('reliability uses uptime and success rate', () => {
      // 85% uptime, 75% success → avg 80 → weighted 80 * 0.25 = 20
      const result = engine.evaluate(bronzeInput);
      const reliability = result.criteria.find(
        (c) => c.criterion === 'reliability',
      )!;
      const expectedRaw = Math.min(100, 85) * 0.5 + Math.min(100, 75) * 0.5;
      expect(reliability.score).toBeCloseTo(expectedRaw * 0.25, 5);
    });

    it('performance is zero when no latency data', () => {
      const noLatency = { ...goldInput, avgLatencyMs: 0 };
      const result = engine.evaluate(noLatency);
      const perf = result.criteria.find((c) => c.criterion === 'performance')!;
      expect(perf.score).toBe(0);
    });

    it('performance scales with latency', () => {
      const lowLatency = engine.evaluate({
        ...goldInput,
        avgLatencyMs: 50,
      });
      const highLatency = engine.evaluate({
        ...goldInput,
        avgLatencyMs: 1500,
      });

      const lowPerf = lowLatency.criteria.find(
        (c) => c.criterion === 'performance',
      )!;
      const highPerf = highLatency.criteria.find(
        (c) => c.criterion === 'performance',
      )!;
      expect(lowPerf.score).toBeGreaterThan(highPerf.score);
    });

    it('trust increases with registration age', () => {
      const newProvider = engine.evaluate({
        ...goldInput,
        registeredAt: now(),
        historicalOperationCount: 0,
      });
      const oldProvider = engine.evaluate({
        ...goldInput,
        registeredAt: now() - 180 * 24 * 60 * 60 * 1000,
      });

      const newTrust = newProvider.criteria.find(
        (c) => c.criterion === 'trust',
      )!;
      const oldTrust = oldProvider.criteria.find(
        (c) => c.criterion === 'trust',
      )!;
      expect(oldTrust.score).toBeGreaterThan(newTrust.score);
    });

    it('compliance penalizes missing semver and unsupported network', () => {
      const result = engine.evaluate(failingInput);
      const compliance = result.criteria.find(
        (c) => c.criterion === 'compliance',
      )!;
      expect(compliance.score).toBe(0);
    });

    it('each criterion includes a rationale string', () => {
      const result = engine.evaluate(goldInput);
      for (const c of result.criteria) {
        expect(c.rationale).toBeTruthy();
        expect(typeof c.rationale).toBe('string');
        expect(c.rationale.length).toBeGreaterThan(0);
      }
    });
  });

  describe('isExpired', () => {
    it('returns false when expiresAt is 0', () => {
      const engine = new CertificationEngine({ now });
      const result = engine.evaluate(goldInput);
      expect(engine.isExpired(result)).toBe(false);
    });

    it('returns false before expiry', () => {
      const engine = new CertificationEngine({
        now,
        validityDurationMs: 1000,
      });
      const result = engine.evaluate(goldInput);
      expect(engine.isExpired(result)).toBe(false);
    });

    it('returns true after expiry', () => {
      const validity = 1000;
      const engine = new CertificationEngine({
        now,
        validityDurationMs: validity,
      });
      const result = engine.evaluate(goldInput);

      // Use a new engine with a clock that has advanced past expiry
      const laterEngine = new CertificationEngine({
        now: () => now() + validity + 1,
        validityDurationMs: validity,
      });
      expect(laterEngine.isExpired(result)).toBe(true);
    });
  });

  describe('effectiveStatus', () => {
    it('returns active for a valid certification', () => {
      const engine = new CertificationEngine({ now });
      const result = engine.evaluate(goldInput);
      expect(engine.effectiveStatus(result)).toBe('active');
    });

    it('returns expired when past expiresAt', () => {
      const validity = 1000;
      const engine = new CertificationEngine({
        now,
        validityDurationMs: validity,
      });
      const result = engine.evaluate(goldInput);

      const laterEngine = new CertificationEngine({
        now: () => now() + validity + 1,
        validityDurationMs: validity,
      });
      expect(laterEngine.effectiveStatus(result)).toBe('expired');
    });

    it('returns revoked when status is revoked', () => {
      const engine = new CertificationEngine({ now });
      const result = {
        ...engine.evaluate(goldInput),
        status: 'revoked' as const,
      };
      expect(engine.effectiveStatus(result)).toBe('revoked');
    });

    it('returns pending when status is pending', () => {
      const engine = new CertificationEngine({ now });
      const result = {
        ...engine.evaluate(goldInput),
        status: 'pending' as const,
      };
      expect(engine.effectiveStatus(result)).toBe('pending');
    });
  });

  describe('event hooks', () => {
    it('calls onCertify when a result is produced', () => {
      const onCertify = jest.fn();
      const engine = new CertificationEngine({ now, onCertify });
      engine.evaluate(goldInput);
      expect(onCertify).toHaveBeenCalledTimes(1);
      expect(onCertify.mock.calls[0][0].providerId).toBe('gold-provider');
    });
  });
});
