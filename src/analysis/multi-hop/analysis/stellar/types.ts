/**
 * Type definitions for the Stellar multi-hop route analyzer.
 *
 * A "hop" here is a single bridge leg between two assets/chains forming part of
 * a longer multi-hop transfer. The analyzer aggregates cost, latency and
 * structural validity across the entire hop sequence.
 */

/** A single bridge leg inside a multi-hop route. */
export interface RouteHop {
  source: string;
  destination: string;
  /** Cost charged for traversing this hop (e.g. in USD or native units). */
  cost: number;
  /** Latency introduced by this hop, expressed in milliseconds. */
  latency: number;
}

/** A complete multi-hop route composed of an ordered list of hops. */
export interface MultiHopRoute {
  routeId: string;
  hops: RouteHop[];
}

/**
 * Severity classifications describing how a multi-hop route looks once the
 * cumulative cost and latency have been tallied. Routes with excessive cost
 * or latency are flagged so they can be surfaced to users as warnings.
 */
export type RouteRating =
  | 'efficient'
  | 'acceptable'
  | 'expensive'
  | 'slow'
  | 'suboptimal';

/** Per-hop aggregate: total + statistical breakdown for a single dimension. */
export interface HopMetricSummary {
  total: number;
  average: number;
  max: number;
  min: number;
  /** Index of the hop that contributed the largest value (0-based). */
  maxHopIndex: number;
  /** Index of the hop that contributed the smallest value (0-based). */
  minHopIndex: number;
}

/** Detailed breakdown for an individual hop, useful for UI display. */
export interface HopAnalysis {
  hopIndex: number;
  source: string;
  destination: string;
  cost: number;
  latency: number;
  /** Share of the route's total cost the hop contributes (0-1). */
  costShare: number;
  /** Share of the route's total latency the hop contributes (0-1). */
  latencyShare: number;
}

/** Result of validating that a route's hops form a continuous chain. */
export interface HopChainValidation {
  /** True when every hop's destination matches the next hop's source. */
  isValid: boolean;
  /** Index of the first hop that breaks the chain, or -1 when valid. */
  breakHopIndex: number;
  /** Human-readable description of any structural problem detected. */
  issue: string | null;
}

/**
 * Full analysis result for a single multi-hop route.
 *
 * The original `hopCount`, `totalCost` and `totalLatency` fields are kept for
 * backward compatibility with the minimal analyzer contract.
 */
export interface RouteAnalysis {
  routeId: string;
  hopCount: number;
  totalCost: number;
  totalLatency: number;

  /** Average cost per hop (totalCost / hopCount, or 0 if no hops). */
  averageCostPerHop: number;
  /** Average latency per hop. */
  averageLatencyPerHop: number;

  /** Cost statistics across the individual hops. */
  costBreakdown: HopMetricSummary;
  /** Latency statistics across the individual hops. */
  latencyBreakdown: HopMetricSummary;

  /** Per-hop details including contribution shares. */
  hopAnalyses: HopAnalysis[];

  /** Structural validity of the hop chain. */
  chainValidation: HopChainValidation;

  /** Overall rating of the route once aggregated. */
  rating: RouteRating;

  /** Human-readable insight describing the analysis outcome. */
  insight: string;
}

/** A ranked route produced by `analyzeRoutes`. */
export interface RankedRouteAnalysis extends RouteAnalysis {
  /** Best (1) to worst among the routes supplied for comparison. */
  rank: number;
}

/** Thresholds used to classify a route's rating. */
export interface StellarMultiHopAnalyzerOptions {
  /** Cost per hop (in same units as `hop.cost`) above which a route is "expensive". */
  expensiveCostPerHopThreshold?: number;
  /** Latency per hop above which a route is "slow". */
  slowLatencyPerHopThresholdMs?: number;
  /** Hop count at or above which a route is "suboptimal". */
  suboptimalHopCountThreshold?: number;
}
