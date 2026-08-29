// ─── Routing Scoring Types ───────────────────────────────────────────────────
//
// Re-usable ranking weight types for the routing layer. These types
// mirror the quote comparison weights but are scoped to route-level
// scoring where the dimensions are fee, speed, reliability, and
// confidence (matching the existing RouteRanker contract).

// ─── Weights ─────────────────────────────────────────────────────────────────

/**
 * Configurable weights for route-level scoring.
 *
 * All values must be in the range [0, 1]. The scorer normalises them
 * internally so they do not need to sum to 1.
 */
export interface RoutingScoringWeights {
  /** Importance of lower fees (0–1). */
  feeWeight: number;
  /** Importance of faster execution (0–1). */
  speedWeight: number;
  /** Importance of higher historical success rate (0–1). */
  reliabilityWeight: number;
  /** Importance of higher confidence estimates (0–1). */
  confidenceWeight: number;
}

// ─── Score Breakdown ─────────────────────────────────────────────────────────

/**
 * Per-dimension normalised scores for a single route.
 *
 * Every value is in the range [0, 1] where 1 = best within the
 * compared set.
 */
export interface RoutingDimensionScores {
  feeScore: number;
  speedScore: number;
  reliabilityScore: number;
  confidenceScore: number;
}

// ─── Scored Route Entry ──────────────────────────────────────────────────────

/**
 * A generic scored route entry that the routing layer can use for
 * any route shape.
 */
export interface RoutingScoredEntry<T = unknown> {
  /** The original route data. */
  route: T;
  /** Per-dimension normalised scores. */
  dimensionScores: RoutingDimensionScores;
  /** Weighted composite score (0–1, higher is better). */
  compositeScore: number;
  /** 1-based rank within the scored set. */
  rank: number;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

/**
 * Default routing scoring weights.
 */
export const DEFAULT_ROUTING_SCORING_WEIGHTS: RoutingScoringWeights = {
  feeWeight: 0.3,
  speedWeight: 0.25,
  reliabilityWeight: 0.25,
  confidenceWeight: 0.2,
};
