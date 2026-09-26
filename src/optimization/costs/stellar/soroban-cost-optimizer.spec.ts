import {
  SorobanRouteCostOptimizer,
  calculateRouteCost,
} from './soroban-cost-optimizer';
import type { CostRoute } from './soroban-cost-optimizer.types';

const sampleRoutes: CostRoute[] = [
  {
    id: 'route-a',
    provider: 'StellarBridge',
    sourceChain: 'stellar',
    destinationChain: 'ethereum',
    bridgeFeeUsd: 0.5,
    networkFeeStroops: 100_000,   // 0.01 XLM
    xlmUsdPrice: 0.12,
    gasUsd: 0.2,
    slippagePercent: 0.1,
    amountUsd: 1_000,
  },
  {
    id: 'route-b',
    provider: 'CheapBridge',
    sourceChain: 'stellar',
    destinationChain: 'ethereum',
    bridgeFeeUsd: 0.1,
    networkFeeStroops: 500_000,   // 0.05 XLM
    xlmUsdPrice: 0.12,
    gasUsd: 0.3,
    slippagePercent: 0.2,
    amountUsd: 1_000,
  },
  {
    id: 'route-c',
    provider: 'FastBridge',
    sourceChain: 'stellar',
    destinationChain: 'polygon',
    bridgeFeeUsd: 1.0,
    networkFeeStroops: 50_000,
    xlmUsdPrice: 0.12,
    gasUsd: 0.05,
    slippagePercent: 0.05,
    amountUsd: 1_000,
  },
];

// ---------------------------------------------------------------------------
// calculateRouteCost
// ---------------------------------------------------------------------------

describe('calculateRouteCost', () => {
  it('computes a weighted breakdown with default weights', () => {
    const result = calculateRouteCost(sampleRoutes[0]);
    expect(result.breakdown.bridgeCostUsd).toBe(0.5);
    expect(result.breakdown.networkCostUsd).toBeCloseTo(0.0012, 4);
    expect(result.breakdown.gasCostUsd).toBe(0.2);
    expect(result.breakdown.slippageCostUsd).toBe(1.0);
    expect(result.totalCostUsd).toBeGreaterThan(0);
  });

  it('treats missing gas/slippage as zero', () => {
    const result = calculateRouteCost({
      ...sampleRoutes[0],
      gasUsd: undefined,
      slippagePercent: undefined,
    });
    expect(result.breakdown.gasCostUsd).toBe(0);
    expect(result.breakdown.slippageCostUsd).toBe(0);
  });

  it('returns zero when weights sum to zero', () => {
    const result = calculateRouteCost(sampleRoutes[0], {
      bridge: 0,
      network: 0,
      gas: 0,
      slippage: 0,
    });
    expect(result.totalCostUsd).toBe(0);
  });

  it('normalizes weights that do not sum to 1', () => {
    const a = calculateRouteCost(sampleRoutes[0], { bridge: 2, network: 1, gas: 1, slippage: 0 });
    const b = calculateRouteCost(sampleRoutes[0], { bridge: 1, network: 0.5, gas: 0.5, slippage: 0 });
    // Both should yield the same total because weights are normalized.
    expect(a.totalCostUsd).toBeCloseTo(b.totalCostUsd, 4);
  });

  it('handles amountUsd = 0 for costPercent', () => {
    const result = calculateRouteCost({ ...sampleRoutes[0], amountUsd: 0 });
    expect(result.costPercent).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SorobanRouteCostOptimizer
// ---------------------------------------------------------------------------

describe('SorobanRouteCostOptimizer', () => {
  it('evaluates every route with a total cost > 0', () => {
    const engine = new SorobanRouteCostOptimizer();
    const evaluated = engine.evaluate(sampleRoutes);
    expect(evaluated).toHaveLength(3);
    evaluated.forEach((e) => expect(e.totalCostUsd).toBeGreaterThan(0));
  });

  it('ranks routes ascending by total cost', () => {
    const engine = new SorobanRouteCostOptimizer();
    const ranked = engine.rankLowestCost(sampleRoutes);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].totalCostUsd).toBeGreaterThanOrEqual(ranked[i - 1].totalCostUsd);
    }
  });

  it('accepts per-call weights to override configured weights', () => {
    const engine = new SorobanRouteCostOptimizer();
    const defaultRank = engine.rankLowestCost(sampleRoutes);
    const bridgeHeavyRank = engine.rankLowestCost(sampleRoutes, {
      bridge: 1,
      network: 0,
      gas: 0,
      slippage: 0,
    });
    // Different weightings should produce different orderings somewhere.
    const defaultIds = defaultRank.map((r) => r.route.id);
    const bridgeIds = bridgeHeavyRank.map((r) => r.route.id);
    expect(bridgeIds).not.toEqual(defaultIds);
  });

  it('updateWeights mutates the configured weights', () => {
    const engine = new SorobanRouteCostOptimizer();
    engine.updateWeights({ bridge: 1 });
    expect(engine.getWeights().bridge).toBe(1);
  });

  it('produces aggregate stats for a route set', () => {
    const engine = new SorobanRouteCostOptimizer();
    const stats = engine.stats(sampleRoutes);
    expect(stats.routeCount).toBe(3);
    expect(stats.cheapestRouteId).toBeTruthy();
    expect(stats.mostExpensiveRouteId).toBeTruthy();
    expect(stats.minCostUsd).toBeLessThanOrEqual(stats.maxCostUsd);
  });

  it('returns zeroed stats for an empty input', () => {
    const engine = new SorobanRouteCostOptimizer();
    const stats = engine.stats([]);
    expect(stats.routeCount).toBe(0);
    expect(stats.cheapestRouteId).toBeNull();
    expect(stats.mostExpensiveRouteId).toBeNull();
    expect(stats.averageCostUsd).toBe(0);
  });
});
