/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { calculateQualityScores, RouteWithMetrics, ScoredRoute } from '../index';

interface MockRoute {
  id: string;
}

describe('calculateQualityScores', () => {
  it('returns an empty array when given no routes', () => {
    expect(calculateQualityScores([])).toEqual([]);
  });

  it('returns a perfect score of 1.0 when given a single route', () => {
    const routes: RouteWithMetrics<MockRoute>[] = [
      { route: { id: 'route1' }, metrics: { latencyMs: 100, reliabilityScore: 0.9, feeStroops: 1000 } }
    ];
    const result = calculateQualityScores(routes);
    expect(result).toHaveLength(1);
    expect(result[0].qualityScore).toBe(1.0);
  });

  it('correctly scores routes with varying latency, reliability, and fees', () => {
    const routes: RouteWithMetrics<MockRoute>[] = [
      { route: { id: 'best-all-around' }, metrics: { latencyMs: 100, reliabilityScore: 0.99, feeStroops: 1000 } },
      { route: { id: 'worst-all-around' }, metrics: { latencyMs: 500, reliabilityScore: 0.50, feeStroops: 5000 } },
      { route: { id: 'mixed' }, metrics: { latencyMs: 300, reliabilityScore: 0.75, feeStroops: 3000 } }
    ];

    const result = calculateQualityScores(routes);
    expect(result).toHaveLength(3);

    const best = result.find(r => r.route.id === 'best-all-around');
    const worst = result.find(r => r.route.id === 'worst-all-around');
    const mixed = result.find(r => r.route.id === 'mixed');

    expect(best?.qualityScore).toBe(1.0); // 1.0 on all normalized metrics
    expect(worst?.qualityScore).toBe(0.0); // 0.0 on all normalized metrics
    expect(mixed?.qualityScore).toBeCloseTo(0.5, 2); // exactly in the middle
  });

  it('handles missing metrics gracefully without penalizing out of proportion', () => {
    const routes: RouteWithMetrics<MockRoute>[] = [
      { route: { id: 'no-fee' }, metrics: { latencyMs: 200, reliabilityScore: 0.8 } }, // Fee missing -> defaults to 0.5 for fee
      { route: { id: 'all-metrics' }, metrics: { latencyMs: 100, reliabilityScore: 0.9, feeStroops: 1000 } },
      { route: { id: 'all-metrics-bad' }, metrics: { latencyMs: 300, reliabilityScore: 0.7, feeStroops: 2000 } }
    ];

    const result = calculateQualityScores(routes);
    expect(result).toHaveLength(3);

    const noFeeRoute = result.find(r => r.route.id === 'no-fee');
    expect(noFeeRoute?.qualityScore).toBeDefined();

    // Latency 200 is perfectly in middle -> 0.5
    // Reliability 0.8 is perfectly in middle -> 0.5
    // Fee is missing -> defaults to 0.5
    expect(noFeeRoute?.qualityScore).toBeCloseTo(0.5, 2);
  });

  it('normalizes properly when all metrics are exactly the same', () => {
    const routes: RouteWithMetrics<MockRoute>[] = [
      { route: { id: 'route1' }, metrics: { latencyMs: 100, reliabilityScore: 0.9, feeStroops: 1000 } },
      { route: { id: 'route2' }, metrics: { latencyMs: 100, reliabilityScore: 0.9, feeStroops: 1000 } },
      { route: { id: 'route3' }, metrics: { latencyMs: 100, reliabilityScore: 0.9, feeStroops: 1000 } }
    ];

    const result = calculateQualityScores(routes);
    expect(result).toHaveLength(3);

    result.forEach(route => {
      // Because min === max, they get 1.0 normalized value
      expect(route.qualityScore).toBe(1.0);
    });
  });

  it('supports custom weights', () => {
    const routes: RouteWithMetrics<MockRoute>[] = [
      { route: { id: 'low-latency-high-fee' }, metrics: { latencyMs: 10, reliabilityScore: 0.9, feeStroops: 10000 } },
      { route: { id: 'high-latency-low-fee' }, metrics: { latencyMs: 1000, reliabilityScore: 0.9, feeStroops: 100 } }
    ];

    // Favor latency heavily
    const latencyHeavyWeights = { latency: 0.9, reliability: 0.05, fee: 0.05 };
    const resultLatencyHeavy = calculateQualityScores(routes, latencyHeavyWeights);
    
    expect(resultLatencyHeavy.find(r => r.route.id === 'low-latency-high-fee')!.qualityScore).toBeGreaterThan(
      resultLatencyHeavy.find(r => r.route.id === 'high-latency-low-fee')!.qualityScore
    );

    // Favor fee heavily
    const feeHeavyWeights = { latency: 0.05, reliability: 0.05, fee: 0.9 };
    const resultFeeHeavy = calculateQualityScores(routes, feeHeavyWeights);
    
    expect(resultFeeHeavy.find(r => r.route.id === 'high-latency-low-fee')!.qualityScore).toBeGreaterThan(
      resultFeeHeavy.find(r => r.route.id === 'low-latency-high-fee')!.qualityScore
    );
  });
});
