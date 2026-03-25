import { Test, TestingModule } from '@nestjs/testing';
import { ReliabilityCalculatorService, RawCounts } from './reliability-calculator.service';
import { ReliabilityTier, WindowMode } from './reliability.enum';
import { RELIABILITY_CONSTANTS } from './reliability.constants';

describe('ReliabilityCalculatorService', () => {
  let service: ReliabilityCalculatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReliabilityCalculatorService],
    }).compile();

    service = module.get(ReliabilityCalculatorService);
  });

  // ─── computeReliabilityPercent ─────────────────────────────────────────────

  describe('computeReliabilityPercent', () => {
    it('returns 0 when attempts are below minimum threshold', () => {
      const counts: RawCounts = {
        totalAttempts: 3,
        successfulTransfers: 3,
        failedTransfers: 0,
        timeoutCount: 0,
      };
      expect(service.computeReliabilityPercent(counts)).toBe(0);
    });

    it('returns 100 when all transfers succeed', () => {
      const counts: RawCounts = {
        totalAttempts: 100,
        successfulTransfers: 100,
        failedTransfers: 0,
        timeoutCount: 0,
      };
      expect(service.computeReliabilityPercent(counts)).toBe(100);
    });

    it('returns 0 when all transfers fail', () => {
      const counts: RawCounts = {
        totalAttempts: 100,
        successfulTransfers: 0,
        failedTransfers: 100,
        timeoutCount: 0,
      };
      expect(service.computeReliabilityPercent(counts)).toBe(0);
    });

    it('computes correct percentage with mixed outcomes', () => {
      const counts: RawCounts = {
        totalAttempts: 200,
        successfulTransfers: 190,
        failedTransfers: 7,
        timeoutCount: 3,
      };
      expect(service.computeReliabilityPercent(counts)).toBe(95);
    });

    it('rounds to 2 decimal places', () => {
      const counts: RawCounts = {
        totalAttempts: 300,
        successfulTransfers: 289,
        failedTransfers: 11,
        timeoutCount: 0,
      };
      const result = service.computeReliabilityPercent(counts);
      expect(result).toBe(96.33);
    });
  });

  // ─── computeReliabilityScore ───────────────────────────────────────────────

  describe('computeReliabilityScore', () => {
    it('returns 0 for insufficient data', () => {
      const counts: RawCounts = {
        totalAttempts: 2,
        successfulTransfers: 2,
        failedTransfers: 0,
        timeoutCount: 0,
      };
      expect(service.computeReliabilityScore(counts)).toBe(0);
    });

    it('returns 100 for perfect success with no timeouts', () => {
      const counts: RawCounts = {
        totalAttempts: 100,
        successfulTransfers: 100,
        failedTransfers: 0,
        timeoutCount: 0,
      };
      expect(service.computeReliabilityScore(counts)).toBe(100);
    });

    it('applies timeout penalty to score', () => {
      const noTimeout: RawCounts = {
        totalAttempts: 100,
        successfulTransfers: 95,
        failedTransfers: 5,
        timeoutCount: 0,
      };
      const withTimeout: RawCounts = {
        totalAttempts: 100,
        successfulTransfers: 95,
        failedTransfers: 0,
        timeoutCount: 5,
      };

      const scoreWithout = service.computeReliabilityScore(noTimeout);
      const scoreWith = service.computeReliabilityScore(withTimeout);

      expect(scoreWith).toBeLessThan(scoreWithout);
    });

    it('never returns score below 0', () => {
      const counts: RawCounts = {
        totalAttempts: 100,
        successfulTransfers: 0,
        failedTransfers: 50,
        timeoutCount: 50,
      };
      expect(service.computeReliabilityScore(counts)).toBeGreaterThanOrEqual(0);
    });

    it('never returns score above 100', () => {
      const counts: RawCounts = {
        totalAttempts: 1000,
        successfulTransfers: 1000,
        failedTransfers: 0,
        timeoutCount: 0,
      };
      expect(service.computeReliabilityScore(counts)).toBeLessThanOrEqual(100);
    });
  });

  // ─── computeTier ──────────────────────────────────────────────────────────

  describe('computeTier', () => {
    it('returns HIGH for >= 95%', () => {
      expect(service.computeTier(95)).toBe(ReliabilityTier.HIGH);
      expect(service.computeTier(99.5)).toBe(ReliabilityTier.HIGH);
      expect(service.computeTier(100)).toBe(ReliabilityTier.HIGH);
    });

    it('returns MEDIUM for 85-94%', () => {
      expect(service.computeTier(85)).toBe(ReliabilityTier.MEDIUM);
      expect(service.computeTier(90)).toBe(ReliabilityTier.MEDIUM);
      expect(service.computeTier(94.99)).toBe(ReliabilityTier.MEDIUM);
    });

    it('returns LOW for < 85%', () => {
      expect(service.computeTier(84.99)).toBe(ReliabilityTier.LOW);
      expect(service.computeTier(50)).toBe(ReliabilityTier.LOW);
      expect(service.computeTier(0)).toBe(ReliabilityTier.LOW);
    });
  });

  // ─── buildBadge ───────────────────────────────────────────────────────────

  describe('buildBadge', () => {
    it('builds HIGH badge correctly', () => {
      const badge = service.buildBadge(97, 100, WindowMode.TRANSACTION_COUNT);
      expect(badge.tier).toBe(ReliabilityTier.HIGH);
      expect(badge.label).toBe('High Reliability');
      expect(badge.color).toBe('#22c55e');
      expect(badge.tooltip).toContain('last 100 transactions');
    });

    it('builds MEDIUM badge with correct color', () => {
      const badge = service.buildBadge(90, 7, WindowMode.TIME_BASED);
      expect(badge.tier).toBe(ReliabilityTier.MEDIUM);
      expect(badge.color).toBe('#f59e0b');
      expect(badge.tooltip).toContain('last 7 days');
    });

    it('builds LOW badge with correct color', () => {
      const badge = service.buildBadge(70, 100, WindowMode.TRANSACTION_COUNT);
      expect(badge.tier).toBe(ReliabilityTier.LOW);
      expect(badge.color).toBe('#ef4444');
    });

    it('includes minimum attempts in tooltip', () => {
      const badge = service.buildBadge(95, 100, WindowMode.TRANSACTION_COUNT);
      expect(badge.tooltip).toContain(
        String(RELIABILITY_CONSTANTS.MIN_ATTEMPTS_FOR_SCORE),
      );
    });
  });

  // ─── computeRankingPenalty ────────────────────────────────────────────────

  describe('computeRankingPenalty', () => {
    it('returns 0 penalty for reliable bridges', () => {
      expect(service.computeRankingPenalty(90)).toBe(0);
      expect(service.computeRankingPenalty(100)).toBe(0);
      expect(service.computeRankingPenalty(85)).toBe(0);
    });

    it('returns penalty for unreliable bridges', () => {
      expect(service.computeRankingPenalty(80)).toBe(
        RELIABILITY_CONSTANTS.PENALTY_BELOW_THRESHOLD,
      );
      expect(service.computeRankingPenalty(0)).toBe(
        RELIABILITY_CONSTANTS.PENALTY_BELOW_THRESHOLD,
      );
    });

    it('respects custom threshold', () => {
      expect(service.computeRankingPenalty(90, 95)).toBe(
        RELIABILITY_CONSTANTS.PENALTY_BELOW_THRESHOLD,
      );
      expect(service.computeRankingPenalty(90, 80)).toBe(0);
    });
  });

  // ─── applyReliabilityToRankingScore ───────────────────────────────────────

  describe('applyReliabilityToRankingScore', () => {
    it('does not modify score when ignoreReliability is true', () => {
      const base = 75;
      const result = service.applyReliabilityToRankingScore(base, 60, {
        ignoreReliability: true,
      });
      expect(result).toBe(base);
    });

    it('integrates reliability into ranking score with default weight', () => {
      const base = 80;
      const reliability = 95;
      const result = service.applyReliabilityToRankingScore(base, reliability);
      // base * 0.8 + reliability * 0.2 = 64 + 19 = 83
      expect(result).toBe(83);
    });

    it('applies penalty for unreliable bridges', () => {
      const base = 80;
      const highReliability = 90; // above threshold
      const lowReliability = 70;  // below threshold

      const highResult = service.applyReliabilityToRankingScore(base, highReliability);
      const lowResult = service.applyReliabilityToRankingScore(base, lowReliability);

      expect(lowResult).toBeLessThan(highResult);
    });

    it('never returns negative ranking score', () => {
      const result = service.applyReliabilityToRankingScore(5, 0);
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('respects custom reliability weight', () => {
      const base = 80;
      const reliability = 100;
      // weight 0.5: base * 0.5 + reliability * 0.5 = 40 + 50 = 90
      const result = service.applyReliabilityToRankingScore(base, reliability, {
        weight: 0.5,
      });
      expect(result).toBe(90);
    });
  });
});
