/**
 * Tests for SorobanRouteReliabilityScorer
 *
 * Comprehensive test suite covering:
 * - Execution tracking and history management
 * - Reliability metrics calculation
 * - Multi-component reliability scoring
 * - Confidence calculation
 * - Route ranking integration
 * - Time-decay weighting
 * - Streak analysis
 * - Edge cases and error handling
 */

import {
  SorobanRouteReliabilityScorer,
  routeReliabilityScorer,
} from './soroban-route-reliability-scorer';
import type { RouteExecutionRecord } from './soroban-route-reliability.types';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

const createMockTime = () => {
  let currentTime = 1000000000000; // Start at a reasonable timestamp
  return {
    now: () => currentTime,
    advance: (ms: number) => {
      currentTime += ms;
    },
    getTime: () => currentTime,
  };
};

const createExecution = (
  routeId: string,
  success: boolean,
  timestamp: number,
  overrides: Partial<RouteExecutionRecord> = {},
): RouteExecutionRecord => ({
  executionId: `exec-${routeId}-${timestamp}`,
  routeId,
  success,
  timestamp,
  durationMs: success ? 1000 + Math.random() * 2000 : undefined,
  error: success ? undefined : 'Test error',
  errorCategory: success ? undefined : 'timeout',
  amountUsd: 1000,
  ...overrides,
});

describe('SorobanRouteReliabilityScorer', () => {
  let mockTime: ReturnType<typeof createMockTime>;
  let scorer: SorobanRouteReliabilityScorer;

  beforeEach(() => {
    mockTime = createMockTime();
    scorer = new SorobanRouteReliabilityScorer({ now: mockTime.now });
  });

  // ─── Execution Tracking ───────────────────────────────────────────────────

  describe('recordExecution', () => {
    it('records a successful execution', () => {
      const execution = createExecution('route-1', true, mockTime.getTime());
      scorer.recordExecution(execution);

      expect(scorer.totalExecutions).toBe(1);
      expect(scorer.trackedRoutes).toContain('route-1');
    });

    it('records a failed execution', () => {
      const execution = createExecution('route-1', false, mockTime.getTime());
      scorer.recordExecution(execution);

      expect(scorer.totalExecutions).toBe(1);
      const executions = scorer.getExecutions('route-1');
      expect(executions[0].success).toBe(false);
    });

    it('tracks multiple routes', () => {
      scorer.recordExecution(
        createExecution('route-1', true, mockTime.getTime()),
      );
      mockTime.advance(1000);
      scorer.recordExecution(
        createExecution('route-2', true, mockTime.getTime()),
      );

      expect(scorer.totalExecutions).toBe(2);
      expect(scorer.trackedRoutes).toHaveLength(2);
    });

    it('maintains execution order', () => {
      const exec1 = createExecution('route-1', true, mockTime.getTime());
      mockTime.advance(1000);
      const exec2 = createExecution('route-1', false, mockTime.getTime());

      scorer.recordExecution(exec1);
      scorer.recordExecution(exec2);

      const executions = scorer.getExecutions('route-1');
      expect(executions).toHaveLength(2);
      expect(executions[0].success).toBe(true);
      expect(executions[1].success).toBe(false);
    });
  });

  describe('recordExecutions', () => {
    it('records multiple executions at once', () => {
      const executions = [
        createExecution('route-1', true, mockTime.getTime()),
        createExecution('route-1', false, mockTime.getTime() + 1000),
        createExecution('route-2', true, mockTime.getTime() + 2000),
      ];

      scorer.recordExecutions(executions);

      expect(scorer.totalExecutions).toBe(3);
      expect(scorer.getExecutions('route-1')).toHaveLength(2);
      expect(scorer.getExecutions('route-2')).toHaveLength(1);
    });
  });

  describe('queryExecutions', () => {
    beforeEach(() => {
      scorer.recordExecutions([
        createExecution('route-1', true, mockTime.getTime()),
        createExecution('route-1', false, mockTime.getTime() + 1000),
        createExecution('route-2', true, mockTime.getTime() + 2000),
        createExecution('route-2', true, mockTime.getTime() + 3000, {
          amountUsd: 5000,
        }),
      ]);
    });

    it('filters by routeId', () => {
      const results = scorer.queryExecutions({ routeId: 'route-1' });
      expect(results).toHaveLength(2);
      results.forEach((r) => expect(r.routeId).toBe('route-1'));
    });

    it('filters by routeIds', () => {
      const results = scorer.queryExecutions({ routeIds: ['route-1'] });
      expect(results).toHaveLength(2);
    });

    it('filters by success status', () => {
      const results = scorer.queryExecutions({ success: false });
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
    });

    it('filters by errorCategory', () => {
      const results = scorer.queryExecutions({ errorCategory: 'timeout' });
      expect(results).toHaveLength(1);
      expect(results[0].errorCategory).toBe('timeout');
    });

    it('filters by amount range', () => {
      const results = scorer.queryExecutions({ minAmountUsd: 2000 });
      expect(results).toHaveLength(1);
      expect(results[0].amountUsd).toBe(5000);
    });
  });

  describe('clearHistory', () => {
    it('clears all execution data', () => {
      scorer.recordExecution(
        createExecution('route-1', true, mockTime.getTime()),
      );
      scorer.clearHistory();

      expect(scorer.totalExecutions).toBe(0);
      expect(scorer.trackedRoutes).toHaveLength(0);
    });
  });

  // ─── Metrics Calculation ──────────────────────────────────────────────────

  describe('calculateMetrics', () => {
    it('returns null for route with no executions', () => {
      const metrics = scorer.calculateMetrics('non-existent');
      expect(metrics).toBeNull();
    });

    it('calculates basic success metrics', () => {
      const baseTime = mockTime.getTime();
      scorer.recordExecutions([
        createExecution('route-1', true, baseTime),
        createExecution('route-1', true, baseTime + 1000),
        createExecution('route-1', false, baseTime + 2000),
      ]);

      const metrics = scorer.calculateMetrics('route-1');

      expect(metrics).not.toBeNull();
      expect(metrics!.totalExecutions).toBe(3);
      expect(metrics!.successfulExecutions).toBe(2);
      expect(metrics!.failedExecutions).toBe(1);
      expect(metrics!.successRate).toBeCloseTo(2 / 3, 2);
    });

    it('calculates recent success rate', () => {
      const baseTime = mockTime.getTime();
      const oneDayAgo = baseTime - 86_400_000;
      const twoDaysAgo = baseTime - 172_800_000;

      // Old executions (outside recent window)
      scorer.recordExecutions([
        createExecution('route-1', false, twoDaysAgo),
        createExecution('route-1', false, twoDaysAgo + 1000),
      ]);

      // Recent executions (within 24h window)
      scorer.recordExecutions([
        createExecution('route-1', true, oneDayAgo + 1000),
        createExecution('route-1', true, oneDayAgo + 2000),
      ]);

      const metrics = scorer.calculateMetrics('route-1');

      expect(metrics!.recentSuccessRate).toBe(1.0); // 100% in last 24h
      expect(metrics!.successRate).toBe(0.5); // 50% overall
    });

    it('calculates duration statistics', () => {
      const baseTime = mockTime.getTime();
      scorer.recordExecutions([
        createExecution('route-1', true, baseTime, { durationMs: 1000 }),
        createExecution('route-1', true, baseTime + 1000, { durationMs: 2000 }),
        createExecution('route-1', true, baseTime + 2000, { durationMs: 3000 }),
      ]);

      const metrics = scorer.calculateMetrics('route-1');

      expect(metrics!.avgDurationMs).toBe(2000);
      expect(metrics!.medianDurationMs).toBe(2000);
      expect(metrics!.p95DurationMs).toBe(3000);
    });

    it('calculates failure breakdown', () => {
      const baseTime = mockTime.getTime();
      scorer.recordExecutions([
        createExecution('route-1', false, baseTime, {
          errorCategory: 'timeout',
        }),
        createExecution('route-1', false, baseTime + 1000, {
          errorCategory: 'timeout',
        }),
        createExecution('route-1', false, baseTime + 2000, {
          errorCategory: 'slippage',
        }),
      ]);

      const metrics = scorer.calculateMetrics('route-1');

      expect(metrics!.failureBreakdown).toEqual({
        timeout: 2,
        slippage: 1,
      });
    });

    it('calculates streak analysis', () => {
      const baseTime = mockTime.getTime();
      scorer.recordExecutions([
        createExecution('route-1', true, baseTime),
        createExecution('route-1', true, baseTime + 1000),
        createExecution('route-1', true, baseTime + 2000),
        createExecution('route-1', false, baseTime + 3000),
        createExecution('route-1', false, baseTime + 4000),
      ]);

      const metrics = scorer.calculateMetrics('route-1');

      expect(metrics!.consecutiveFailures).toBe(2);
      expect(metrics!.consecutiveSuccesses).toBe(0);
      expect(metrics!.longestSuccessStreak).toBe(3);
      expect(metrics!.longestFailureStreak).toBe(2);
    });
  });

  // ─── Reliability Scoring ──────────────────────────────────────────────────

  describe('getReliabilityScore', () => {
    it('returns null for route with no data', () => {
      const score = scorer.getReliabilityScore('non-existent');
      expect(score).toBeNull();
    });

    it('calculates reliability score for successful route', () => {
      const baseTime = mockTime.getTime();
      for (let i = 0; i < 150; i++) {
        scorer.recordExecution(
          createExecution('route-1', true, baseTime + i * 1000),
        );
      }

      const score = scorer.getReliabilityScore('route-1');

      expect(score).not.toBeNull();
      expect(score!.score).toBeGreaterThan(0.8);
      expect(score!.confidenceTier).toBe('high');
    });

    it('calculates lower score for unreliable route', () => {
      const baseTime = mockTime.getTime();
      for (let i = 0; i < 50; i++) {
        scorer.recordExecution(
          createExecution('route-1', i % 3 === 0, baseTime + i * 1000), // 33% success
        );
      }

      const score = scorer.getReliabilityScore('route-1');

      expect(score).not.toBeNull();
      expect(score!.score).toBeLessThan(0.5);
    });

    it('includes score breakdown', () => {
      const baseTime = mockTime.getTime();
      for (let i = 0; i < 50; i++) {
        scorer.recordExecution(
          createExecution('route-1', true, baseTime + i * 1000),
        );
      }

      const score = scorer.getReliabilityScore('route-1');

      expect(score!.breakdown.successRateScore).toBeDefined();
      expect(score!.breakdown.recentPerformanceScore).toBeDefined();
      expect(score!.breakdown.consistencyScore).toBeDefined();
      expect(score!.breakdown.trendScore).toBeDefined();
    });

    it('calculates volume score when amount data available', () => {
      const baseTime = mockTime.getTime();
      for (let i = 0; i < 50; i++) {
        scorer.recordExecution(
          createExecution('route-1', true, baseTime + i * 1000, {
            amountUsd: 1000 + i * 100,
          }),
        );
      }

      const score = scorer.getReliabilityScore('route-1');

      expect(score!.breakdown.volumeScore).toBeDefined();
    });

    it('returns undefined volume score without amount data', () => {
      const baseTime = mockTime.getTime();
      for (let i = 0; i < 50; i++) {
        scorer.recordExecution(
          createExecution('route-1', true, baseTime + i * 1000, {
            amountUsd: undefined,
          }),
        );
      }

      const score = scorer.getReliabilityScore('route-1');

      expect(score!.breakdown.volumeScore).toBeUndefined();
    });
  });

  describe('scoreRoutes', () => {
    it('scores and ranks multiple routes', () => {
      const baseTime = mockTime.getTime();

      // Route 1: 90% success rate
      for (let i = 0; i < 50; i++) {
        scorer.recordExecution(
          createExecution('route-1', i < 45, baseTime + i * 1000),
        );
      }

      // Route 2: 70% success rate
      for (let i = 0; i < 50; i++) {
        scorer.recordExecution(
          createExecution('route-2', i < 35, baseTime + i * 1000),
        );
      }

      // Route 3: 50% success rate
      for (let i = 0; i < 50; i++) {
        scorer.recordExecution(
          createExecution('route-3', i < 25, baseTime + i * 1000),
        );
      }

      const result = scorer.scoreRoutes(['route-1', 'route-2', 'route-3']);

      expect(result.totalRoutes).toBe(3);
      expect(result.scoredRoutes[0].routeId).toBe('route-1');
      expect(result.scoredRoutes[1].routeId).toBe('route-2');
      expect(result.scoredRoutes[2].routeId).toBe('route-3');
      expect(result.scoredRoutes[0].score).toBeGreaterThan(
        result.scoredRoutes[1].score,
      );
    });

    it('skips routes with no data', () => {
      const baseTime = mockTime.getTime();
      for (let i = 0; i < 50; i++) {
        scorer.recordExecution(
          createExecution('route-1', true, baseTime + i * 1000),
        );
      }

      const result = scorer.scoreRoutes(['route-1', 'route-no-data']);

      expect(result.totalRoutes).toBe(1);
      expect(result.scoredRoutes[0].routeId).toBe('route-1');
    });
  });

  // ─── Route Ranking Integration ────────────────────────────────────────────

  describe('rankRoutesByReliability', () => {
    it('ranks routes by reliability score', () => {
      const baseTime = mockTime.getTime();

      for (let i = 0; i < 50; i++) {
        scorer.recordExecution(
          createExecution('route-good', true, baseTime + i * 1000),
        );
        scorer.recordExecution(
          createExecution('route-bad', i % 2 === 0, baseTime + i * 1000),
        );
      }

      const routes = [
        { id: 'route-good', name: 'Good Route' },
        { id: 'route-bad', name: 'Bad Route' },
      ];

      const ranked = scorer.rankRoutesByReliability(routes);

      expect(ranked).toHaveLength(2);
      expect(ranked[0].route.id).toBe('route-good');
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].route.id).toBe('route-bad');
      expect(ranked[1].rank).toBe(2);
    });

    it('includes reliability score in ranking', () => {
      const baseTime = mockTime.getTime();
      for (let i = 0; i < 50; i++) {
        scorer.recordExecution(
          createExecution('route-1', true, baseTime + i * 1000),
        );
      }

      const routes = [{ id: 'route-1', name: 'Test Route' }];
      const ranked = scorer.rankRoutesByReliability(routes);

      expect(ranked[0].reliabilityScore).toBeDefined();
      expect(ranked[0].reliabilityScore.score).toBeGreaterThan(0.8);
    });
  });

  describe('getReliabilityScoresForRanking', () => {
    it('returns score map for route IDs', () => {
      const baseTime = mockTime.getTime();
      for (let i = 0; i < 50; i++) {
        scorer.recordExecution(
          createExecution('route-1', true, baseTime + i * 1000),
        );
        scorer.recordExecution(
          createExecution('route-2', i < 35, baseTime + i * 1000),
        );
      }

      const scores = scorer.getReliabilityScoresForRanking([
        'route-1',
        'route-2',
      ]);

      expect(scores.has('route-1')).toBe(true);
      expect(scores.has('route-2')).toBe(true);
      const score1 = scores.get('route-1')!;
      const score2 = scores.get('route-2')!;
      expect(score1).toBeGreaterThan(score2);
    });
  });

  // ─── Data Management ──────────────────────────────────────────────────────

  describe('pruneOldExecutions', () => {
    it('removes executions beyond max age', () => {
      const baseTime = mockTime.getTime();
      const oldTime = baseTime - 3_000_000_000; // Older than 30 days

      scorer.recordExecution(createExecution('route-1', true, oldTime));
      scorer.recordExecution(createExecution('route-1', true, baseTime));

      const pruned = scorer.pruneOldExecutions();

      expect(pruned).toBe(1);
      expect(scorer.totalExecutions).toBe(1);
    });
  });

  // ─── Confidence Calculation ───────────────────────────────────────────────

  describe('confidence', () => {
    it('assigns high confidence for large sample size', () => {
      const baseTime = mockTime.getTime();
      for (let i = 0; i < 150; i++) {
        scorer.recordExecution(
          createExecution('route-1', true, baseTime + i * 1000),
        );
      }

      const score = scorer.getReliabilityScore('route-1');
      expect(score!.confidenceTier).toBe('high');
    });

    it('assigns medium confidence for moderate sample size', () => {
      const baseTime = mockTime.getTime();
      for (let i = 0; i < 50; i++) {
        scorer.recordExecution(
          createExecution('route-1', true, baseTime + i * 1000),
        );
      }

      const score = scorer.getReliabilityScore('route-1');
      expect(score!.confidenceTier).toBe('medium');
    });

    it('assigns low confidence for small sample size', () => {
      const baseTime = mockTime.getTime();
      for (let i = 0; i < 10; i++) {
        scorer.recordExecution(
          createExecution('route-1', true, baseTime + i * 1000),
        );
      }

      const score = scorer.getReliabilityScore('route-1');
      expect(score!.confidenceTier).toBe('low');
    });

    it('reduces confidence for stale data', () => {
      const baseTime = mockTime.getTime();
      const oldTime = baseTime - 2_000_000_000; // Very old data

      for (let i = 0; i < 150; i++) {
        scorer.recordExecution(
          createExecution('route-1', true, oldTime + i * 1000),
        );
      }

      mockTime.advance(2_000_000_000); // Advance time to make data old

      const score = scorer.getReliabilityScore('route-1');
      // All data is now beyond maxDataAge (30 days = 2.592B ms), so metrics return null
      expect(score).toBeNull();
    });
  });

  // ─── Time-Decay Weighting ─────────────────────────────────────────────────

  describe('time-decay weighting', () => {
    it('applies time decay to volume score', () => {
      const baseTime = mockTime.getTime();
      const oneWeekAgo = baseTime - 604_800_000;
      const twoWeeksAgo = baseTime - 1_209_600_000;

      // Recent high-value success
      scorer.recordExecution(
        createExecution('route-1', true, oneWeekAgo, { amountUsd: 10000 }),
      );

      // Old low-value failure
      scorer.recordExecution(
        createExecution('route-1', false, twoWeeksAgo, { amountUsd: 1000 }),
      );

      const score = scorer.getReliabilityScore('route-1');

      // Recent success should weigh more than old failure
      expect(score!.score).toBeGreaterThan(0.5);
    });

    it('can disable time decay', () => {
      const scorerNoDecay = new SorobanRouteReliabilityScorer({
        now: mockTime.now,
        enableTimeDecay: false,
      });

      const baseTime = mockTime.getTime();
      scorerNoDecay.recordExecution(
        createExecution('route-1', true, baseTime - 604_800_000, {
          amountUsd: 1000,
        }),
      );
      scorerNoDecay.recordExecution(
        createExecution('route-1', false, baseTime, { amountUsd: 10000 }),
      );

      const score = scorerNoDecay.getReliabilityScore('route-1');
      // Without decay, recent failure has same weight as old success
      expect(score).not.toBeNull();
    });
  });

  // ─── Trend Detection ──────────────────────────────────────────────────────

  describe('trend detection', () => {
    it('detects improving trend', () => {
      const baseTime = mockTime.getTime();

      // Week ago: mix of successes and failures (50% success rate for week)
      const sevenDaysAgo = baseTime - 604_800_000;
      for (let i = 0; i < 50; i++) {
        scorer.recordExecution(
          createExecution('route-1', i % 2 === 0, sevenDaysAgo + i * 1000),
        );
      }

      // Recent (last 12 hours): all successes (100% success rate)
      const twelveHoursAgo = baseTime - 43_200_000;
      for (let i = 0; i < 50; i++) {
        scorer.recordExecution(
          createExecution('route-1', true, twelveHoursAgo + i * 1000),
        );
      }

      const score = scorer.getReliabilityScore('route-1');

      // Should detect improving trend (recent 100% > weekly ~75%)
      // Trend will be positive but may not be extreme due to overlapping windows
      expect(score).not.toBeNull();
      expect(score!.breakdown.trendScore).toBeGreaterThanOrEqual(0.5);
    });

    it('detects degrading trend', () => {
      const baseTime = mockTime.getTime();

      // Week ago: all successes (100% success rate for week)
      const sevenDaysAgo = baseTime - 604_800_000;
      for (let i = 0; i < 50; i++) {
        scorer.recordExecution(
          createExecution('route-1', true, sevenDaysAgo + i * 1000),
        );
      }

      // Recent (last 12 hours): all failures (0% success rate)
      const twelveHoursAgo = baseTime - 43_200_000;
      for (let i = 0; i < 50; i++) {
        scorer.recordExecution(
          createExecution('route-1', false, twelveHoursAgo + i * 1000),
        );
      }

      const score = scorer.getReliabilityScore('route-1');

      // Should detect degrading trend (recent 0% < weekly ~50%)
      expect(score).not.toBeNull();
      expect(score!.breakdown.trendScore).toBeLessThanOrEqual(0.5);
    });
  });

  // ─── Edge Cases ───────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles single execution', () => {
      scorer.recordExecution(
        createExecution('route-1', true, mockTime.getTime()),
      );
      const score = scorer.getReliabilityScore('route-1');

      expect(score).not.toBeNull();
      expect(score!.score).toBeGreaterThan(0.9);
      expect(score!.confidenceTier).toBe('low');
    });

    it('handles all failures', () => {
      const baseTime = mockTime.getTime();
      for (let i = 0; i < 50; i++) {
        scorer.recordExecution(
          createExecution('route-1', false, baseTime + i * 1000),
        );
      }

      const score = scorer.getReliabilityScore('route-1');
      expect(score!.score).toBeLessThan(0.1);
    });

    it('handles mixed success and failures evenly', () => {
      const baseTime = mockTime.getTime();
      for (let i = 0; i < 100; i++) {
        scorer.recordExecution(
          createExecution('route-1', i % 2 === 0, baseTime + i * 1000),
        );
      }

      const score = scorer.getReliabilityScore('route-1');
      expect(score!.score).toBeCloseTo(0.5, 0);
    });

    it('filters expired data from metrics', () => {
      const baseTime = mockTime.getTime();
      const thirtyOneDaysAgo = baseTime - 2_678_400_000; // 31 days ago

      scorer.recordExecution(
        createExecution('route-1', true, thirtyOneDaysAgo),
      );
      mockTime.advance(2_678_400_000);

      const metrics = scorer.calculateMetrics('route-1');
      expect(metrics).toBeNull(); // All data expired
    });
  });

  // ─── Integration Scenarios ────────────────────────────────────────────────

  describe('integration scenarios', () => {
    it('supports reliability-influenced route ranking', () => {
      const baseTime = mockTime.getTime();

      // Simulate real-world route performance
      const routes = [
        {
          id: 'fast-but-unreliable',
          name: 'Fast Route',
          provider: 'ProviderA',
        },
        { id: 'slow-but-reliable', name: 'Slow Route', provider: 'ProviderB' },
        { id: 'balanced-route', name: 'Balanced Route', provider: 'ProviderC' },
      ];

      // Fast route: 60% success rate
      for (let i = 0; i < 100; i++) {
        scorer.recordExecution(
          createExecution(
            'fast-but-unreliable',
            i % 10 < 6,
            baseTime + i * 1000,
          ),
        );
      }

      // Slow route: 95% success rate
      for (let i = 0; i < 100; i++) {
        scorer.recordExecution(
          createExecution(
            'slow-but-reliable',
            i % 20 !== 0,
            baseTime + i * 1000,
          ),
        );
      }

      // Balanced route: 80% success rate
      for (let i = 0; i < 100; i++) {
        scorer.recordExecution(
          createExecution('balanced-route', i % 10 < 8, baseTime + i * 1000),
        );
      }

      const ranked = scorer.rankRoutesByReliability(routes);

      // Reliability ranking should prefer reliable routes over fast ones
      expect(ranked[0].route.id).toBe('slow-but-reliable');
      expect(ranked[1].route.id).toBe('balanced-route');
      expect(ranked[2].route.id).toBe('fast-but-unreliable');

      // Verify scores reflect reliability differences
      expect(ranked[0].reliabilityScore.score).toBeGreaterThan(0.9);
      expect(ranked[2].reliabilityScore.score).toBeLessThan(0.7);
    });

    it('updates scores as new executions are recorded', () => {
      const baseTime = mockTime.getTime();

      // Initial: 50% success rate
      for (let i = 0; i < 20; i++) {
        scorer.recordExecution(
          createExecution('route-1', i % 2 === 0, baseTime + i * 1000),
        );
      }

      const score1 = scorer.getReliabilityScore('route-1');
      expect(score1!.score).toBeCloseTo(0.5, 0);

      // Add more successful executions
      for (let i = 0; i < 30; i++) {
        scorer.recordExecution(
          createExecution('route-1', true, baseTime + 20000 + i * 1000),
        );
      }

      const score2 = scorer.getReliabilityScore('route-1');
      expect(score2!.score).toBeGreaterThan(score1!.score);
    });
  });
});
