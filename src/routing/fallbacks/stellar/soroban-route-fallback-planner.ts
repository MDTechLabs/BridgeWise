/**
 * Soroban Route Fallback Planner
 *
 * Generates alternative routes when preferred routes fail. Ranks candidates
 * by a weighted score of fee, speed, and provider reliability, and supports
 * configurable automatic failover policies.
 *
 * @see Issue #470 — Implement Soroban Route Fallback Planner
 */

import type { Route } from '../../smart/stellar/soroban-smart-routing-engine';

import type {
  FallbackPlannerConfig,
  FallbackPlanResult,
  FallbackRankingWeights,
  FallbackReason,
  FailoverPolicy,
  RankedFallbackRoute,
} from './types';

import {
  DEFAULT_FALLBACK_WEIGHTS,
  DEFAULT_FAILOVER_POLICY,
} from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeWeights(w: FallbackRankingWeights): FallbackRankingWeights {
  const total = w.fee + w.speed + w.reliability;
  if (Math.abs(total - 1) < 1e-9 || total === 0) return { ...w };
  return {
    fee: w.fee / total,
    speed: w.speed / total,
    reliability: w.reliability / total,
  };
}

/** Score a route's fee (lower fee → higher score, capped at 100 units baseline). */
function scoreFee(route: Route): number {
  return Math.max(0, Math.min(1, 1 - route.estimatedFee / 100));
}

/** Score a route's speed (lower latency → higher score, 300 s baseline). */
function scoreSpeed(route: Route): number {
  return Math.max(0, Math.min(1, 1 - route.estimatedTimeMs / 300_000));
}

function rankRoute(
  route: Route,
  weights: FallbackRankingWeights,
  reliabilityScores: Map<string, number>,
): RankedFallbackRoute {
  const feeScore = scoreFee(route);
  const speedScore = scoreSpeed(route);
  const reliabilityScore = reliabilityScores.get(route.provider) ?? 0.8;
  const score =
    feeScore * weights.fee +
    speedScore * weights.speed +
    reliabilityScore * weights.reliability;

  return {
    route,
    score: Math.max(0, Math.min(1, score)),
    breakdown: { feeScore, speedScore, reliabilityScore },
  };
}

function shouldAutoFailover(
  policy: FailoverPolicy,
  reason: FallbackReason,
  alternatives: RankedFallbackRoute[],
): boolean {
  if (!policy.autoFailover) return false;
  if (alternatives.length === 0) return false;
  if (policy.autoFailoverReasons && !policy.autoFailoverReasons.includes(reason)) return false;
  return true;
}

// ─── Planner ─────────────────────────────────────────────────────────────────

export class SorobanRouteFallbackPlanner {
  private readonly routes: Route[] = [];
  private readonly reliabilityScores = new Map<string, number>();
  private readonly weights: FallbackRankingWeights;
  private readonly policy: FailoverPolicy;
  private readonly onFallback?: FallbackPlannerConfig['onFallback'];
  private readonly onError?: FallbackPlannerConfig['onError'];

  constructor(config: FallbackPlannerConfig = {}) {
    this.weights = normalizeWeights({
      ...DEFAULT_FALLBACK_WEIGHTS,
      ...config.rankingWeights,
    });
    this.policy = { ...DEFAULT_FAILOVER_POLICY, ...config.failoverPolicy };
    this.onFallback = config.onFallback;
    this.onError = config.onError;
  }

  // ─── Route Registration ────────────────────────────────────────────────────

  /**
   * Register candidate routes that can be used as fallbacks.
   * Duplicates (same route id) are ignored.
   */
  registerRoutes(routes: Route[]): void {
    for (const route of routes) {
      if (!this.routes.some((r) => r.id === route.id)) {
        this.routes.push(route);
      }
    }
  }

  /**
   * Remove all registered routes.
   */
  clearRoutes(): void {
    this.routes.length = 0;
  }

  /**
   * Get all registered routes.
   */
  getRoutes(): Route[] {
    return [...this.routes];
  }

  // ─── Reliability ───────────────────────────────────────────────────────────

  /**
   * Update the reliability score for a provider (clamped 0–1).
   */
  updateReliability(providerId: string, score: number): void {
    this.reliabilityScores.set(providerId, Math.max(0, Math.min(1, score)));
  }

  /**
   * Get the reliability score for a provider (default 0.8).
   */
  getReliability(providerId: string): number {
    return this.reliabilityScores.get(providerId) ?? 0.8;
  }

  // ─── Planning ──────────────────────────────────────────────────────────────

  /**
   * Generate a fallback plan for a failed route.
   *
   * The planner:
   * 1. Excludes the failed route's provider (and any extra excluded providers).
   * 2. Filters candidates to the same source/destination chains.
   * 3. Excludes routes below the minimum reliability threshold.
   * 4. Ranks remaining candidates by weighted score.
   * 5. Returns the top N alternatives based on the failover policy.
   *
   * @param failedRoute  The route that could not be executed.
   * @param reason  Why the route failed.
   * @param excludeProviders  Additional provider IDs to exclude from consideration.
   */
  plan(
    failedRoute: Route,
    reason: FallbackReason,
    excludeProviders: string[] = [],
  ): FallbackPlanResult {
    try {
      const excluded = new Set([failedRoute.provider, ...excludeProviders]);

      const candidates = this.routes.filter(
        (r) =>
          r.id !== failedRoute.id &&
          !excluded.has(r.provider) &&
          r.sourceChain === failedRoute.sourceChain &&
          r.destinationChain === failedRoute.destinationChain,
      );

      // Score and filter by reliability threshold
      const ranked = candidates
        .map((r) => rankRoute(r, this.weights, this.reliabilityScores))
        .filter((r) => r.breakdown.reliabilityScore >= this.policy.minReliabilityThreshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, this.policy.maxAlternatives);

      const autoFailover = shouldAutoFailover(this.policy, reason, ranked);

      const result: FallbackPlanResult = {
        failedRoute,
        reason,
        alternatives: ranked,
        best: ranked[0] ?? null,
        excludedProviders: Array.from(excluded),
        shouldAutoFailover: autoFailover,
      };

      this.onFallback?.(result);
      return result;
    } catch (err) {
      this.onError?.(err);
      return {
        failedRoute,
        reason,
        alternatives: [],
        best: null,
        excludedProviders: [failedRoute.provider, ...excludeProviders],
        shouldAutoFailover: false,
      };
    }
  }

  /**
   * Convenience method: plan a fallback and return only the best route,
   * or null if no alternatives are available.
   */
  planBest(failedRoute: Route, reason: FallbackReason, excludeProviders?: string[]): Route | null {
    return this.plan(failedRoute, reason, excludeProviders).best?.route ?? null;
  }

  /**
   * Mark a provider as temporarily unavailable.
   * Sets its reliability score to 0 so it is excluded from all fallback plans
   * until its score is updated via `updateReliability`.
   */
  markProviderUnavailable(providerId: string): void {
    this.reliabilityScores.set(providerId, 0);
  }
}
