/**
 * Soroban Route Optimization Strategy Engine Types
 *
 * Defines types for pluggable route optimization strategies that can be
 * registered and selected at runtime based on application needs.
 *
 * @see Issue #595 — Implement Soroban Route Optimization Strategy Engine
 */

import type { Route, TransferRequest, RouteEvaluation } from '../../smart/stellar/soroban-smart-routing-engine';

// ─── Strategy Types ───────────────────────────────────────────────────────────

/** Named optimization priority a strategy can target. */
export type OptimizationPriority = 'speed' | 'cost' | 'reliability' | 'balanced';

/** Weight configuration for route scoring dimensions. */
export interface StrategyWeights {
  /** Weight applied to fee/cost scoring (0–1). */
  fee: number;
  /** Weight applied to speed/latency scoring (0–1). */
  speed: number;
  /** Weight applied to reliability scoring (0–1). */
  reliability: number;
}

/** Metadata describing a registered strategy. */
export interface StrategyMetadata {
  /** Unique strategy name (e.g. "cheapest", "fastest", "safest"). */
  name: string;
  /** Human-readable description. */
  description: string;
  /** The optimization priority this strategy targets. */
  priority: OptimizationPriority;
  /** Scoring weights for this strategy. */
  weights: StrategyWeights;
  /** Minimum acceptable reliability score (0–1). Routes below this are excluded. */
  minReliabilityScore: number;
  /** Maximum number of top routes to return. */
  maxRoutes: number;
}

/** A function that maps a TransferRequest to custom scoring weights. */
export type CustomWeightResolver = (
  request: TransferRequest,
  defaultWeights: StrategyWeights,
) => StrategyWeights;

/** A function that applies custom filtering to candidate routes before scoring. */
export type CustomRouteFilter = (
  routes: Route[],
  request: TransferRequest,
) => Route[];

/** Definition of a custom optimization rule. */
export interface CustomRule {
  /** Rule identifier for debugging and management. */
  id: string;
  /** Optional custom weight resolver to override strategy weights per-request. */
  weightResolver?: CustomWeightResolver;
  /** Optional custom route filter to pre-filter candidates. */
  routeFilter?: CustomRouteFilter;
  /** Priority of this rule when multiple rules apply. Lower = higher priority. */
  order?: number;
}

// ─── Engine Configuration ────────────────────────────────────────────────────

/** Configuration for the strategy engine. */
export interface StrategyEngineConfig {
  /** Pre-registered strategies. */
  strategies?: StrategyMetadata[];
  /** Pre-registered custom rules. */
  rules?: CustomRule[];
  /** Default strategy name to use when none is specified. */
  defaultStrategy?: string;
}

// ─── Selection & Results ─────────────────────────────────────────────────────

/** Result of a strategy-based route optimization. */
export interface StrategyOptimizationResult {
  /** The strategy that was applied. */
  strategy: StrategyMetadata;
  /** Ranked route evaluations, best first. */
  evaluations: RouteEvaluation[];
  /** The best route evaluation, or null if no routes matched. */
  best: RouteEvaluation | null;
  /** Custom rules that were applied during optimization. */
  appliedRules: string[];
}

/** Input for selecting a strategy at runtime. */
export interface StrategySelection {
  /** Explicit strategy name to use. Takes precedence over priority. */
  strategyName?: string;
  /** Optimization priority — used to auto-select a matching strategy. */
  priority?: OptimizationPriority;
}

// ─── Pre-built Strategy Definitions ──────────────────────────────────────────

/** Pre-built "cheapest" strategy — heavily weights fee minimization. */
export const CHEAPEST_STRATEGY: StrategyMetadata = {
  name: 'cheapest',
  description: 'Optimize for lowest transaction fees',
  priority: 'cost',
  weights: { fee: 0.7, speed: 0.2, reliability: 0.1 },
  minReliabilityScore: 0.4,
  maxRoutes: 5,
};

/** Pre-built "fastest" strategy — heavily weights speed/latency. */
export const FASTEST_STRATEGY: StrategyMetadata = {
  name: 'fastest',
  description: 'Optimize for fastest transfer completion',
  priority: 'speed',
  weights: { fee: 0.15, speed: 0.7, reliability: 0.15 },
  minReliabilityScore: 0.4,
  maxRoutes: 5,
};

/** Pre-built "safest" strategy — heavily weights provider reliability. */
export const SAFEST_STRATEGY: StrategyMetadata = {
  name: 'safest',
  description: 'Optimize for highest reliability and success rate',
  priority: 'reliability',
  weights: { fee: 0.2, speed: 0.15, reliability: 0.65 },
  minReliabilityScore: 0.7,
  maxRoutes: 3,
};

/** Pre-built "balanced" strategy — equal weighting across all dimensions. */
export const BALANCED_STRATEGY: StrategyMetadata = {
  name: 'balanced',
  description: 'Equal balance of speed, cost, and reliability',
  priority: 'balanced',
  weights: { fee: 0.35, speed: 0.35, reliability: 0.3 },
  minReliabilityScore: 0.5,
  maxRoutes: 5,
};

/** All pre-built strategies. */
export const PREBUILT_STRATEGIES: StrategyMetadata[] = [
  CHEAPEST_STRATEGY,
  FASTEST_STRATEGY,
  SAFEST_STRATEGY,
  BALANCED_STRATEGY,
];
