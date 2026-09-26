import {
  HopAnalysis,
  HopChainValidation,
  HopMetricSummary,
  MultiHopRoute,
  RankedRouteAnalysis,
  RouteAnalysis,
  RouteHop,
  RouteRating,
  StellarMultiHopAnalyzerOptions,
} from "./types";

const DEFAULT_OPTIONS: Required<StellarMultiHopAnalyzerOptions> = {
  expensiveCostPerHopThreshold: 5,
  slowLatencyPerHopThresholdMs: 5_000,
  suboptimalHopCountThreshold: 4,
};

/**
 * Multi-hop route analyzer for Stellar bridge transfers.
 *
 * Given a route that traverse several bridges / assets in sequence, this
 * analyzer produces a comprehensive assessment: per-hop metrics, chain
 * connectivity validation, cumulative cost and latency, and a high-level
 * rating that downstream UI can surface as warnings.
 *
 * The implementation is intentionally stateless — instantiating the analyzer
 * just captures threshold values via `StellarMultiHopAnalyzerOptions`.
 */
export class StellarMultiHopAnalyzer {
  private readonly options: Required<StellarMultiHopAnalyzerOptions>;

  constructor(options: StellarMultiHopAnalyzerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Analyze a single multi-hop route end-to-end.
   *
   * The returned object exposes both the historical "summary" fields
   * (hopCount, totalCost, totalLatency) and richer per-hop statistics, chain
   * validation, rating and insight fields.
   */
  analyze(route: MultiHopRoute): RouteAnalysis {
    const costBreakdown = this.summarize(route.hops, (h) => h.cost);
    const latencyBreakdown = this.summarize(route.hops, (h) => h.latency);
    // Reuse the totals already computed by summarize() instead of reducing
    // the hops a second time inside buildHopAnalyses().
    const hopAnalyses = this.buildHopAnalyses(
      route.hops,
      costBreakdown.total,
      latencyBreakdown.total,
    );
    const chainValidation = this.validateChain(route.hops);
    const hopCount = route.hops.length;
    const totalCost = costBreakdown.total;
    const totalLatency = latencyBreakdown.total;
    const averageCostPerHop = hopCount === 0 ? 0 : totalCost / hopCount;
    const averageLatencyPerHop = hopCount === 0 ? 0 : totalLatency / hopCount;

    const rating = this.classifyRoute({
      hopCount,
      averageCostPerHop,
      averageLatencyPerHop,
    });
    const insight = this.buildInsight({
      hopCount,
      totalCost,
      totalLatency,
      rating,
      chainValidation,
    });

    return {
      routeId: route.routeId,
      hopCount,
      totalCost,
      totalLatency,
      averageCostPerHop,
      averageLatencyPerHop,
      costBreakdown,
      latencyBreakdown,
      hopAnalyses,
      chainValidation,
      rating,
      insight,
    };
  }

  /**
   * Analyze a batch of routes and return them ranked from best (lowest total
   * cost + latency) to worst.
   */
  analyzeRoutes(routes: MultiHopRoute[]): RankedRouteAnalysis[] {
    const analyses = routes.map((route) => this.analyze(route));
    const ranked = [...analyses].sort((a, b) => {
      // Lower cost wins; ties broken by lower latency; final tie uses hop count.
      const costDelta = a.totalCost - b.totalCost;
      if (costDelta !== 0) return costDelta;
      const latencyDelta = a.totalLatency - b.totalLatency;
      if (latencyDelta !== 0) return latencyDelta;
      return a.hopCount - b.hopCount;
    });
    return ranked.map((analysis, index) => ({ ...analysis, rank: index + 1 }));
  }

  /**
   * Detect the number of hops in a multi-hop route.
   *
   * Equivalent to `route.hops.length` but kept as an explicit method so
   * downstream code can use the analyzer as a single point of truth.
   */
  detectRouteHops(route: MultiHopRoute): number {
    return route.hops.length;
  }

  /**
   * Validate that hops form a continuous chain by ensuring each hop's
   * destination matches the next hop's source. Useful as a standalone check
   * and consumed internally by {@link analyze}.
   */
  validateChain(hops: RouteHop[]): HopChainValidation {
    if (hops.length === 0) {
      return { isValid: true, breakHopIndex: -1, issue: null };
    }

    for (let i = 0; i < hops.length - 1; i++) {
      const expected = hops[i].destination;
      const actual = hops[i + 1].source;
      if (expected !== actual) {
        return {
          isValid: false,
          breakHopIndex: i,
          issue: `Hop ${i + 1} destination "${expected}" does not match hop ${i + 2} source "${actual}".`,
        };
      }
    }

    return { isValid: true, breakHopIndex: -1, issue: null };
  }

  /** Returns the rating thresholds currently in use. */
  getOptions(): Required<StellarMultiHopAnalyzerOptions> {
    return { ...this.options };
  }

  // ─── Internal helpers ────────────────────────────────────────────────────

  private buildHopAnalyses(
    hops: RouteHop[],
    totalCost: number,
    totalLatency: number,
  ): HopAnalysis[] {
    return hops.map((hop, index) => ({
      hopIndex: index,
      source: hop.source,
      destination: hop.destination,
      cost: hop.cost,
      latency: hop.latency,
      costShare: totalCost === 0 ? 0 : hop.cost / totalCost,
      latencyShare: totalLatency === 0 ? 0 : hop.latency / totalLatency,
    }));
  }

  private summarize(
    hops: RouteHop[],
    pick: (hop: RouteHop) => number,
  ): HopMetricSummary {
    if (hops.length === 0) {
      return {
        total: 0,
        average: 0,
        max: 0,
        min: 0,
        maxHopIndex: -1,
        minHopIndex: -1,
      };
    }

    let total = 0;
    let max = -Infinity;
    let min = Infinity;
    let maxHopIndex = -1;
    let minHopIndex = -1;

    hops.forEach((hop, index) => {
      const value = pick(hop);
      total += value;
      if (value > max) {
        max = value;
        maxHopIndex = index;
      }
      if (value < min) {
        min = value;
        minHopIndex = index;
      }
    });

    return {
      total,
      average: total / hops.length,
      max,
      min,
      maxHopIndex,
      minHopIndex,
    };
  }

  private classifyRoute(params: {
    hopCount: number;
    averageCostPerHop: number;
    averageLatencyPerHop: number;
  }): RouteRating {
    const { hopCount, averageCostPerHop, averageLatencyPerHop } = params;

    if (hopCount === 0) {
      return 'efficient';
    }

    const expensive =
      averageCostPerHop > this.options.expensiveCostPerHopThreshold;
    const slow =
      averageLatencyPerHop > this.options.slowLatencyPerHopThresholdMs;
    const tooManyHops =
      hopCount >= this.options.suboptimalHopCountThreshold;

    // When both cost AND latency blow past thresholds the route is unworkable.
    if (expensive && slow) {
      return 'suboptimal';
    }
    if (expensive) {
      return 'expensive';
    }
    if (slow) {
      return 'slow';
    }
    if (tooManyHops) {
      return 'suboptimal';
    }

    // "acceptable" is reserved for routes that exceed one of the soft budgets
    // even though neither threshold is fully blown.
    if (
      averageCostPerHop >
        this.options.expensiveCostPerHopThreshold * 0.75 ||
      averageLatencyPerHop >
        this.options.slowLatencyPerHopThresholdMs * 0.75
    ) {
      return 'acceptable';
    }

    return 'efficient';
  }

  private buildInsight(params: {
    hopCount: number;
    totalCost: number;
    totalLatency: number;
    rating: RouteRating;
    chainValidation: HopChainValidation;
  }): string {
    const { hopCount, totalCost, totalLatency, rating, chainValidation } =
      params;

    if (hopCount === 0) {
      return 'No hops defined for this route.';
    }

    if (!chainValidation.isValid) {
      return `Route chain is broken: ${chainValidation.issue}`;
    }

    switch (rating) {
      case 'efficient':
        return `Route is efficient across ${hopCount} hops — total cost ${totalCost}, total latency ${totalLatency}ms are within healthy bounds.`;
      case 'acceptable':
        return `Route is acceptable but trending towards the cost/latency thresholds across ${hopCount} hops.`;
      case 'expensive':
        return `Route is expensive: average cost per hop exceeds the configured budget. Consider cheaper bridged legs.`;
      case 'slow':
        return `Route is slow: average latency per hop exceeds the configured budget. Consider faster bridged legs.`;
      case 'suboptimal':
        return `Route is suboptimal: either the hop count is high or cost+latency substantially exceed thresholds. Consider a shorter path.`;
      default: {
        // Exhaustiveness guard: if a new RouteRating is added in the future,
        // this assignment fails to compile so the switch above gets updated.
        const _exhaustive: never = rating;
        throw new Error(`Unhandled route rating: ${String(_exhaustive)}`);
      }
    }
  }
}

// ─── Default Instance ─────────────────────────────────────────────────────────

/**
 * Shared analyzer instance with default thresholds, mirroring the singleton
 * pattern used by sibling Stellar modules like `stellarRouteValidator` and
 * `routeRanker`.
 */
export const stellarMultiHopAnalyzer = new StellarMultiHopAnalyzer();
