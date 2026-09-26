import {
  CostBreakdown,
  CostOptimizationStats,
  CostRoute,
  CostWeights,
  DEFAULT_COST_WEIGHTS,
  RankedRoute,
  RouteCostEvaluation,
} from './soroban-cost-optimizer.types';

// ─── Pure helpers ────────────────────────────────────────────────────────────

/** Convert Soroban stroops to XLM. 1 XLM = 10_000_000 stroops. */
const STROOPS_PER_XLM = 10_000_000;

/**
 * Compute the per-component cost breakdown for a single route. Pure
 * function — no side effects, no state.
 */
export function calculateRouteCost(
  route: CostRoute,
  weights: CostWeights = {},
): { breakdown: CostBreakdown; totalCostUsd: number; costPercent: number } {
  const w = { ...DEFAULT_COST_WEIGHTS, ...weights };
  const totalWeight = w.bridge + w.network + w.gas + w.slippage;
  if (totalWeight <= 0) {
    return {
      breakdown: { bridgeCostUsd: 0, networkCostUsd: 0, gasCostUsd: 0, slippageCostUsd: 0 },
      totalCostUsd: 0,
      costPercent: 0,
    };
  }

  const bridgeCost = route.bridgeFeeUsd;
  const networkCost = (route.networkFeeStroops / STROOPS_PER_XLM) * route.xlmUsdPrice;
  const gasCost = route.gasUsd ?? 0;
  const slippageCost = ((route.slippagePercent ?? 0) / 100) * route.amountUsd;

  const breakdown: CostBreakdown = {
    bridgeCostUsd: round(bridgeCost),
    networkCostUsd: round(networkCost),
    gasCostUsd: round(gasCost),
    slippageCostUsd: round(slippageCost),
  };

  // Weighted sum, normalized so weights always sum to 1 regardless of caller.
  const totalCostUsd =
    ((bridgeCost * w.bridge +
      networkCost * w.network +
      gasCost * w.gas +
      slippageCost * w.slippage) /
      totalWeight);

  const costPercent = route.amountUsd > 0 ? (totalCostUsd / route.amountUsd) * 100 : 0;

  return { breakdown, totalCostUsd: round(totalCostUsd, 6), costPercent: round(costPercent, 4) };
}

function round(value: number, decimals = 4): number {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

/**
 * Soroban Route Cost Optimization Engine (#615).
 *
 * Ranks Stellar/Soroban routes by their all-in USD cost. Costs are weighted
 * sums of bridge, network, gas, and slippage components — weights are
 * configurable at construction time and per-call.
 *
 * Example:
 *   const engine = new SorobanRouteCostOptimizer();
 *   const ranked = engine.rankLowestCost(routes);
 *   const stats  = engine.stats(routes);
 */
export class SorobanRouteCostOptimizer {
  private weights: Required<CostWeights>;

  constructor(weights: CostWeights = {}) {
    this.weights = { ...DEFAULT_COST_WEIGHTS, ...weights };
  }

  /** Update the configured cost weights. */
  updateWeights(weights: CostWeights): void {
    this.weights = { ...this.weights, ...weights };
  }

  /** Return a copy of the currently configured weights. */
  getWeights(): Required<CostWeights> {
    return { ...this.weights };
  }

  /**
   * Evaluate all routes without ranking — returns cost details for each.
   */
  evaluate(routes: CostRoute[]): RouteCostEvaluation[] {
    return routes.map((route) => this.evaluateOne(route));
  }

  /**
   * Rank routes ascending by total cost (cheapest first). Optionally
   * accepts per-call weights that override the configured ones.
   */
  rankLowestCost(routes: CostRoute[], weights?: CostWeights): RankedRoute[] {
    const evaluated = this.evaluate(routes);
    const sorted = [...evaluated].sort((a, b) => a.totalCostUsd - b.totalCostUsd);
    if (weights) {
      // Recompute with per-call weights, then re-sort.
      const perCall = routes
        .map((r) => {
          const result = calculateRouteCost(r, weights);
          return {
            rank: 0,
            route: r,
            totalCostUsd: result.totalCostUsd,
            costPercent: result.costPercent,
            breakdown: result.breakdown,
          };
        })
        .sort((a, b) => a.totalCostUsd - b.totalCostUsd);
      return perCall.map((entry, idx) => ({ ...entry, rank: idx + 1 }));
    }
    return sorted.map((entry, idx) => ({
      rank: idx + 1,
      route: entry.route,
      totalCostUsd: entry.totalCostUsd,
      costPercent: entry.costPercent,
      breakdown: entry.breakdown,
    }));
  }

  /** Aggregate stats for a set of routes using the configured weights. */
  stats(routes: CostRoute[]): CostOptimizationStats {
    const evaluated = this.evaluate(routes);
    if (evaluated.length === 0) {
      return {
        routeCount: 0,
        cheapestRouteId: null,
        mostExpensiveRouteId: null,
        averageCostUsd: 0,
        medianCostUsd: 0,
        minCostUsd: 0,
        maxCostUsd: 0,
      };
    }
    const costs = evaluated.map((e) => e.totalCostUsd);
    const sorted = [...costs].sort((a, b) => a - b);
    const minIdx = costs.indexOf(Math.min(...costs));
    const maxIdx = costs.indexOf(Math.max(...costs));
    return {
      routeCount: evaluated.length,
      cheapestRouteId: evaluated[minIdx]?.route.id ?? null,
      mostExpensiveRouteId: evaluated[maxIdx]?.route.id ?? null,
      averageCostUsd: round(costs.reduce((a, b) => a + b, 0) / costs.length),
      medianCostUsd: round(sorted[Math.floor(sorted.length / 2)]),
      minCostUsd: round(Math.min(...costs)),
      maxCostUsd: round(Math.max(...costs)),
    };
  }

  private evaluateOne(route: CostRoute): RouteCostEvaluation {
    const result = calculateRouteCost(route, this.weights);
    return {
      route,
      breakdown: result.breakdown,
      totalCostUsd: result.totalCostUsd,
      costPercent: result.costPercent,
    };
  }
}
