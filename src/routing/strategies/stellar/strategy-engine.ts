/**
 * Soroban Route Optimization Strategy Engine
 *
 * Supports pluggable, named optimization strategies with custom rule support
 * and runtime strategy selection based on priority (speed, cost, reliability)
 * or explicit strategy name.
 *
 * @see Issue #595 — Implement Soroban Route Optimization Strategy Engine
 */

import {
  type CustomRule,
  type CustomRouteFilter,
  type CustomWeightResolver,
  type OptimizationPriority,
  PREBUILT_STRATEGIES,
  type StrategyEngineConfig,
  type StrategyMetadata,
  type StrategyOptimizationResult,
  type StrategySelection,
  type StrategyWeights,
} from './types';

import type {
  Route,
  RouteEvaluation,
  TransferRequest,
} from '../../smart/stellar/soroban-smart-routing-engine';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Ensure weights sum to 1. Normalizes proportionally if needed. */
function normalizeWeights(weights: StrategyWeights): StrategyWeights {
  const total = weights.fee + weights.speed + weights.reliability;
  if (Math.abs(total - 1) < 1e-9) return { ...weights };
  if (total === 0) return { fee: 1 / 3, speed: 1 / 3, reliability: 1 / 3 };

  return {
    fee: weights.fee / total,
    speed: weights.speed / total,
    reliability: weights.reliability / total,
  };
}

/** Score a route based on fee (0–1, lower fee = higher score). */
function scoreFee(route: Route): number {
  return Math.max(0, 1 - route.estimatedFee / 100);
}

/** Score a route based on speed (0–1, faster = higher score). */
function scoreSpeed(route: Route): number {
  return Math.max(0, 1 - route.estimatedTimeMs / 300_000);
}

/** Get reliability score for a provider, defaulting to 0.8. */
function getReliabilityScore(
  provider: string,
  reliabilityScores: Map<string, number>,
): number {
  return reliabilityScores.get(provider) ?? 0.8;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class SorobanRouteOptimizationStrategyEngine {
  private readonly strategies = new Map<string, StrategyMetadata>();
  private readonly rules: CustomRule[] = [];
  private readonly reliabilityScores = new Map<string, number>();
  private routes: Route[] = [];
  private defaultStrategy: string;

  constructor(config: StrategyEngineConfig = {}) {
    // Register provided strategies
    for (const strategy of config.strategies ?? []) {
      this.strategies.set(strategy.name, strategy);
    }

    // Register provided rules, sorted by order
    this.rules = [...(config.rules ?? [])].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    );

    this.defaultStrategy = config.defaultStrategy ?? 'balanced';
  }

  // ─── Strategy Management ───────────────────────────────────────────────────

  /**
   * Register an optimization strategy.
   * Overwrites any existing strategy with the same name.
   */
  registerStrategy(strategy: StrategyMetadata): void {
    this.strategies.set(strategy.name, strategy);
  }

  /**
   * Unregister a strategy by name.
   * Returns false if the strategy was not registered.
   */
  unregisterStrategy(name: string): boolean {
    return this.strategies.delete(name);
  }

  /**
   * Get a registered strategy by name.
   */
  getStrategy(name: string): StrategyMetadata | undefined {
    return this.strategies.get(name);
  }

  /**
   * Get all registered strategy names.
   */
  getStrategyNames(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Set the default strategy name used when none is explicitly selected.
   */
  setDefaultStrategy(name: string): void {
    this.defaultStrategy = name;
  }

  /**
   * Get the current default strategy name.
   */
  getDefaultStrategy(): string {
    return this.defaultStrategy;
  }

  // ─── Custom Rule Management ────────────────────────────────────────────────

  /**
   * Register a custom optimization rule.
   * Rules are applied in order (lowest `order` first).
   */
  registerRule(rule: CustomRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  /**
   * Unregister a custom rule by id.
   * Returns false if no rule with that id is registered.
   */
  unregisterRule(id: string): boolean {
    const idx = this.rules.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    this.rules.splice(idx, 1);
    return true;
  }

  /**
   * Get all registered custom rules.
   */
  getRules(): CustomRule[] {
    return [...this.rules];
  }

  // ─── Route Registration ────────────────────────────────────────────────────

  /**
   * Register available routes for optimization.
   */
  registerRoutes(routes: Route[]): void {
    this.routes.push(...routes);
  }

  /**
   * Clear all registered routes.
   */
  clearRoutes(): void {
    this.routes = [];
  }

  /**
   * Get all registered routes.
   */
  getRoutes(): Route[] {
    return [...this.routes];
  }

  // ─── Reliability Scores ────────────────────────────────────────────────────

  /**
   * Update the reliability score for a provider.
   * Score is clamped to [0, 1].
   */
  updateReliability(providerId: string, score: number): void {
    this.reliabilityScores.set(
      providerId,
      Math.max(0, Math.min(1, score)),
    );
  }

  /**
   * Get the reliability score for a provider.
   */
  getReliability(providerId: string): number {
    return this.reliabilityScores.get(providerId) ?? 0.8;
  }

  /**
   * Get all reliability scores.
   */
  getAllReliabilityScores(): ReadonlyMap<string, number> {
    return this.reliabilityScores;
  }

  // ─── Strategy Resolution ───────────────────────────────────────────────────

  /**
   * Resolve which strategy to use from the given selection.
   *
   * Resolution order:
   * 1. Explicit strategy name (if provided and registered)
   * 2. Priority-based auto-selection (matches first strategy with that priority)
   * 3. Default strategy
   */
  resolveStrategy(selection?: StrategySelection): StrategyMetadata {
    // Explicit name takes precedence
    if (selection?.strategyName) {
      const strategy = this.strategies.get(selection.strategyName);
      if (strategy) return strategy;
    }

    // Priority-based auto-selection
    if (selection?.priority) {
      const match = this.findStrategyByPriority(selection.priority);
      if (match) return match;
    }

    // Fall back to default
    const defaultStrat = this.strategies.get(this.defaultStrategy);
    if (defaultStrat) return defaultStrat;

    // Ultimate fallback: balanced from pre-built
    return PREBUILT_STRATEGIES.find((s) => s.name === 'balanced')!;
  }

  /**
   * Find the first registered strategy matching a given priority.
   */
  private findStrategyByPriority(
    priority: OptimizationPriority,
  ): StrategyMetadata | undefined {
    for (const strategy of this.strategies.values()) {
      if (strategy.priority === priority) return strategy;
    }
    return undefined;
  }

  /**
   * Get all registered strategies grouped by priority.
   */
  getStrategiesByPriority(): Record<OptimizationPriority, StrategyMetadata[]> {
    const grouped: Record<OptimizationPriority, StrategyMetadata[]> = {
      speed: [],
      cost: [],
      reliability: [],
      balanced: [],
    };

    for (const strategy of this.strategies.values()) {
      grouped[strategy.priority].push(strategy);
    }

    return grouped;
  }

  // ─── Optimization ──────────────────────────────────────────────────────────

  /**
   * Optimize routes using the selected strategy.
   *
   * Filters candidates by source/destination chain match, applies custom rules,
   * scores with strategy weights, and returns ranked results.
   *
   * @param request  The transfer request to optimize for.
   * @param selection  Optional strategy name or priority to override the default.
   */
  optimize(
    request: TransferRequest,
    selection?: StrategySelection,
  ): StrategyOptimizationResult {
    const strategy = this.resolveStrategy(selection);

    // Filter candidate routes matching the source/destination chains
    let candidates = this.filterCandidates(request);

    const appliedRules: string[] = [];

    // Apply custom rules in order
    for (const rule of this.rules) {
      if (rule.routeFilter) {
        candidates = rule.routeFilter(candidates, request);
        appliedRules.push(rule.id);
      }
    }

    if (candidates.length === 0) {
      return {
        strategy,
        evaluations: [],
        best: null,
        appliedRules,
      };
    }

    // Resolve final weights (custom rules may override)
    let weights = normalizeWeights(strategy.weights);
    for (const rule of this.rules) {
      if (rule.weightResolver) {
        weights = normalizeWeights(rule.weightResolver(request, weights));
      }
    }

    // Score each candidate
    const evaluations: RouteEvaluation[] = candidates.map((route) =>
      this.evaluate(route, weights, strategy.minReliabilityScore),
    );

    // Sort descending by score
    evaluations.sort((a, b) => b.score - a.score);

    // Slice to maxRoutes
    const top = evaluations.slice(0, strategy.maxRoutes);

    return {
      strategy,
      evaluations: top,
      best: top[0] ?? null,
      appliedRules,
    };
  }

  /**
   * Optimize routes and return only the single best route evaluation.
   * Convenience wrapper around `optimize`.
   */
  optimizeBest(
    request: TransferRequest,
    selection?: StrategySelection,
  ): RouteEvaluation | null {
    return this.optimize(request, selection).best;
  }

  /**
   * Rank all eligible routes by all registered strategies and return a
   * comparison of results.
   */
  compareStrategies(
    request: TransferRequest,
  ): Array<{ strategy: StrategyMetadata; best: RouteEvaluation | null }> {
    const results: Array<{
      strategy: StrategyMetadata;
      best: RouteEvaluation | null;
    }> = [];

    for (const strategy of this.strategies.values()) {
      const result = this.optimize(request, { strategyName: strategy.name });
      results.push({ strategy, best: result.best });
    }

    return results;
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private filterCandidates(request: TransferRequest): Route[] {
    return this.routes.filter(
      (r) =>
        r.sourceChain === request.sourceChain &&
        r.destinationChain === request.destinationChain,
    );
  }

  private evaluate(
    route: Route,
    weights: StrategyWeights,
    minReliabilityScore: number,
  ): RouteEvaluation {
    const feeScore = scoreFee(route);
    const speedScore = scoreSpeed(route);
    const reliabilityScore = getReliabilityScore(
      route.provider,
      this.reliabilityScores,
    );

    if (reliabilityScore < minReliabilityScore) {
      return {
        route,
        score: 0,
        breakdown: { feeScore, speedScore, reliabilityScore },
      };
    }

    const score =
      feeScore * weights.fee +
      speedScore * weights.speed +
      reliabilityScore * weights.reliability;

    return { route, score, breakdown: { feeScore, speedScore, reliabilityScore } };
  }
}
