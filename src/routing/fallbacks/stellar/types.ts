/**
 * Soroban Route Fallback Planner Types
 *
 * Defines types for generating alternative routes when preferred routes fail,
 * ranking alternatives, and supporting automatic failover.
 *
 * @see Issue #470 — Implement Soroban Route Fallback Planner
 */

import type { Route } from '../../smart/stellar/soroban-smart-routing-engine';

// ─── Fallback Reason ──────────────────────────────────────────────────────────

/** Reason a preferred route was rejected and a fallback was needed. */
export type FallbackReason =
  | 'provider_unavailable'
  | 'execution_timeout'
  | 'insufficient_liquidity'
  | 'slippage_exceeded'
  | 'fee_spike'
  | 'manual_override';

// ─── Ranking Criteria ─────────────────────────────────────────────────────────

/** Scoring dimensions used to rank fallback routes. */
export interface FallbackRankingWeights {
  /** Weight for fee scoring (lower fee = better). Range 0–1. */
  fee: number;
  /** Weight for speed scoring (lower latency = better). Range 0–1. */
  speed: number;
  /** Weight for provider reliability scoring. Range 0–1. */
  reliability: number;
}

/** Default ranking weights favour reliability in fallback scenarios. */
export const DEFAULT_FALLBACK_WEIGHTS: FallbackRankingWeights = {
  fee: 0.2,
  speed: 0.3,
  reliability: 0.5,
};

// ─── Ranked Fallback ──────────────────────────────────────────────────────────

/** A route candidate with its computed fallback score. */
export interface RankedFallbackRoute {
  route: Route;
  /** Composite score (0–1, higher is better). */
  score: number;
  /** Per-dimension score breakdown. */
  breakdown: {
    feeScore: number;
    speedScore: number;
    reliabilityScore: number;
  };
}

// ─── Planner Result ───────────────────────────────────────────────────────────

/** Result returned by the fallback planner. */
export interface FallbackPlanResult {
  /** The route that triggered the fallback. */
  failedRoute: Route;
  /** Reason the primary route was rejected. */
  reason: FallbackReason;
  /** Ranked list of alternative routes (best first). */
  alternatives: RankedFallbackRoute[];
  /** The best alternative, or null if none are available. */
  best: RankedFallbackRoute | null;
  /** Providers excluded from consideration during this plan. */
  excludedProviders: string[];
  /** Whether automatic failover should be attempted. */
  shouldAutoFailover: boolean;
}

// ─── Failover Policy ──────────────────────────────────────────────────────────

/** Policy controlling when automatic failover is triggered. */
export interface FailoverPolicy {
  /** Automatically failover when fallbacks are available. Default: true */
  autoFailover: boolean;
  /** Minimum reliability score an alternative must have to be eligible. Default: 0.5 */
  minReliabilityThreshold: number;
  /** Maximum number of alternatives to return. Default: 3 */
  maxAlternatives: number;
  /** Reasons that are eligible for automatic failover. Defaults to all reasons. */
  autoFailoverReasons?: FallbackReason[];
}

/** Default failover policy. */
export const DEFAULT_FAILOVER_POLICY: FailoverPolicy = {
  autoFailover: true,
  minReliabilityThreshold: 0.5,
  maxAlternatives: 3,
};

// ─── Planner Config ───────────────────────────────────────────────────────────

/** Configuration for SorobanRouteFallbackPlanner. */
export interface FallbackPlannerConfig {
  /** Ranking weights for alternative routes. */
  rankingWeights?: Partial<FallbackRankingWeights>;
  /** Failover policy. */
  failoverPolicy?: Partial<FailoverPolicy>;
  /** Callback invoked when a fallback plan is executed. */
  onFallback?: (result: FallbackPlanResult) => void;
  /** Error handler for unexpected errors. */
  onError?: (err: unknown) => void;
}
