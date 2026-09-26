/**
 * Soroban Route Reliability Scorer
 *
 * Tracks bridge route execution history, calculates reliability metrics,
 * and generates reliability scores that influence route ranking.
 *
 * Features:
 * - Success rate tracking with time-decay weighting
 * - Multi-component reliability scoring (success rate, recency, consistency, trend)
 * - Confidence calculation based on sample size and data freshness
 * - Streak analysis (consecutive successes/failures)
 * - Error pattern tracking and categorization
 * - Volume-weighted scoring for amount-aware reliability
 * - Integration support for route ranking systems
 *
 * Usage:
 *   const scorer = new SorobanRouteReliabilityScorer({
 *     successRateWeight: 0.35,
 *     recentPerformanceWeight: 0.25,
 *   });
 *
 *   // Track execution
 *   scorer.recordExecution({
 *     executionId: 'exec-123',
 *     routeId: 'stellar-ethereum-usdc',
 *     success: true,
 *     timestamp: Date.now(),
 *   });
 *
 *   // Get reliability score
 *   const score = scorer.getReliabilityScore('stellar-ethereum-usdc');
 *
 *   // Rank routes by reliability
 *   const ranked = scorer.rankRoutesByReliability(routes);
 */

import type {
  RouteExecutionRecord,
  RouteReliabilityMetrics,
  RouteReliabilityScore,
  ReliabilityScoringConfig,
  ExecutionQueryFilter,
  ReliabilityScoringResult,
  ReliabilityRankedRoute,
} from './soroban-route-reliability.types';

const DEFAULT_CONFIG: Required<Omit<ReliabilityScoringConfig, 'now'>> = {
  successRateWeight: 0.35,
  recentPerformanceWeight: 0.25,
  consistencyWeight: 0.2,
  volumeWeight: 0.1,
  trendWeight: 0.1,
  recentWindowMs: 86_400_000, // 24 hours
  weeklyWindowMs: 604_800_000, // 7 days
  highConfidenceMinSamples: 100,
  mediumConfidenceMinSamples: 30,
  maxDataAgeMs: 2_592_000_000, // 30 days
  enableTimeDecay: true,
  timeDecayHalfLifeMs: 604_800_000, // 7 days
};

/**
 * SorobanRouteReliabilityScorer
 *
 * Manages route execution history and calculates comprehensive reliability
 * scores based on multiple performance dimensions.
 */
export class SorobanRouteReliabilityScorer {
  private executions: RouteExecutionRecord[] = [];
  private config: Required<ReliabilityScoringConfig>;
  private routeIndex: Map<string, number[]> = new Map(); // routeId -> execution indices

  constructor(config: ReliabilityScoringConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      now: config.now ?? (() => Date.now()),
    };
  }

  // ─── Execution Tracking ───────────────────────────────────────────────────

  /**
   * Record a route execution event.
   */
  recordExecution(execution: RouteExecutionRecord): void {
    const index = this.executions.length;
    this.executions.push(execution);

    // Update route index
    const indices = this.routeIndex.get(execution.routeId) ?? [];
    indices.push(index);
    this.routeIndex.set(execution.routeId, indices);
  }

  /**
   * Record multiple executions at once.
   */
  recordExecutions(executions: RouteExecutionRecord[]): void {
    for (const execution of executions) {
      this.recordExecution(execution);
    }
  }

  /**
   * Clear all execution history.
   */
  clearHistory(): void {
    this.executions = [];
    this.routeIndex.clear();
  }

  /**
   * Get execution history for a route.
   */
  getExecutions(routeId: string): RouteExecutionRecord[] {
    const indices = this.routeIndex.get(routeId);
    if (!indices) return [];
    return indices.map((i) => this.executions[i]);
  }

  /**
   * Query executions with filters.
   */
  queryExecutions(filter: ExecutionQueryFilter = {}): RouteExecutionRecord[] {
    let results = this.executions;

    if (filter.routeId) {
      results = results.filter((e) => e.routeId === filter.routeId);
    }

    if (filter.routeIds?.length) {
      const routeIdSet = new Set(filter.routeIds);
      results = results.filter((e) => routeIdSet.has(e.routeId));
    }

    if (filter.success !== undefined) {
      results = results.filter((e) => e.success === filter.success);
    }

    if (filter.errorCategory) {
      results = results.filter((e) => e.errorCategory === filter.errorCategory);
    }

    if (filter.fromTimestamp) {
      results = results.filter((e) => e.timestamp >= filter.fromTimestamp);
    }

    if (filter.toTimestamp) {
      results = results.filter((e) => e.timestamp <= filter.toTimestamp);
    }

    if (filter.minAmountUsd !== undefined) {
      results = results.filter(
        (e) => (e.amountUsd ?? 0) >= filter.minAmountUsd,
      );
    }

    if (filter.maxAmountUsd !== undefined) {
      results = results.filter(
        (e) => (e.amountUsd ?? 0) <= filter.maxAmountUsd,
      );
    }

    return results;
  }

  // ─── Metrics Calculation ──────────────────────────────────────────────────

  /**
   * Calculate comprehensive reliability metrics for a route.
   */
  calculateMetrics(routeId: string): RouteReliabilityMetrics | null {
    const executions = this.getExecutionsForRoute(routeId);
    if (executions.length === 0) return null;

    const now = this.config.now();
    const recentWindow = now - this.config.recentWindowMs;
    const weeklyWindow = now - this.config.weeklyWindowMs;
    const maxAge = now - this.config.maxDataAgeMs;

    // Filter by max age
    const validExecutions = executions.filter((e) => e.timestamp >= maxAge);
    if (validExecutions.length === 0) return null;

    // Sort by timestamp
    const sorted = [...validExecutions].sort(
      (a, b) => a.timestamp - b.timestamp,
    );

    // Basic counts
    const totalExecutions = sorted.length;
    const successfulExecutions = sorted.filter((e) => e.success).length;
    const failedExecutions = totalExecutions - successfulExecutions;
    const successRate = successfulExecutions / totalExecutions;

    // Recent success rate (last 24h)
    const recentExecutions = sorted.filter((e) => e.timestamp >= recentWindow);
    const recentSuccessRate =
      recentExecutions.length > 0
        ? recentExecutions.filter((e) => e.success).length /
          recentExecutions.length
        : undefined;

    // Weekly success rate (last 7d)
    const weeklyExecutions = sorted.filter((e) => e.timestamp >= weeklyWindow);
    const weeklySuccessRate =
      weeklyExecutions.length > 0
        ? weeklyExecutions.filter((e) => e.success).length /
          weeklyExecutions.length
        : undefined;

    // Duration statistics
    const durations = sorted
      .filter((e) => e.durationMs)
      .map((e) => e.durationMs);
    const avgDurationMs =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : undefined;
    const medianDurationMs =
      durations.length > 0 ? this.calculateMedian(durations) : undefined;
    const p95DurationMs =
      durations.length > 0
        ? this.calculatePercentile(durations, 0.95)
        : undefined;

    // Failure breakdown
    const failures = sorted.filter((e) => !e.success);
    const failureBreakdown: Record<string, number> = {};
    for (const failure of failures) {
      const category = failure.errorCategory ?? 'unknown';
      failureBreakdown[category] = (failureBreakdown[category] ?? 0) + 1;
    }

    // Streak analysis
    const {
      consecutiveSuccesses,
      consecutiveFailures,
      longestSuccessStreak,
      longestFailureStreak,
    } = this.analyzeStreaks(sorted);

    return {
      routeId,
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      successRate,
      recentSuccessRate,
      weeklySuccessRate,
      avgDurationMs,
      medianDurationMs,
      p95DurationMs,
      failureBreakdown:
        Object.keys(failureBreakdown).length > 0 ? failureBreakdown : undefined,
      consecutiveSuccesses,
      consecutiveFailures,
      longestSuccessStreak,
      longestFailureStreak,
      lastExecutionAt: sorted[sorted.length - 1].timestamp,
      calculatedAt: now,
      sampleSize: totalExecutions,
    };
  }

  // ─── Reliability Scoring ──────────────────────────────────────────────────

  /**
   * Calculate comprehensive reliability score for a route.
   */
  getReliabilityScore(routeId: string): RouteReliabilityScore | null {
    const metrics = this.calculateMetrics(routeId);
    if (!metrics) return null;

    const now = this.config.now();

    // Calculate score components
    const successRateScore = this.calculateSuccessRateScore(metrics);
    const recentPerformanceScore =
      this.calculateRecentPerformanceScore(metrics);
    const consistencyScore = this.calculateConsistencyScore(metrics);
    const volumeScore = this.calculateVolumeScore(routeId);
    const trendScore = this.calculateTrendScore(metrics);

    // Calculate weighted total score
    let totalScore = 0;
    let totalWeight = 0;

    totalScore += successRateScore * this.config.successRateWeight;
    totalWeight += this.config.successRateWeight;

    totalScore += recentPerformanceScore * this.config.recentPerformanceWeight;
    totalWeight += this.config.recentPerformanceWeight;

    totalScore += consistencyScore * this.config.consistencyWeight;
    totalWeight += this.config.consistencyWeight;

    if (volumeScore !== undefined) {
      totalScore += volumeScore * this.config.volumeWeight;
      totalWeight += this.config.volumeWeight;
    }

    totalScore += trendScore * this.config.trendWeight;
    totalWeight += this.config.trendWeight;

    const finalScore = totalWeight > 0 ? totalScore / totalWeight : 0.5;

    // Calculate confidence
    const confidence = this.calculateConfidence(metrics);
    const confidenceTier = this.getConfidenceTier(
      confidence,
      metrics.sampleSize,
    );

    return {
      routeId,
      score: Math.round(finalScore * 10000) / 10000,
      confidence: Math.round(confidence * 10000) / 10000,
      confidenceTier,
      breakdown: {
        successRateScore: Math.round(successRateScore * 10000) / 10000,
        recentPerformanceScore:
          Math.round(recentPerformanceScore * 10000) / 10000,
        consistencyScore: Math.round(consistencyScore * 10000) / 10000,
        volumeScore:
          volumeScore !== undefined
            ? Math.round(volumeScore * 10000) / 10000
            : undefined,
        trendScore: Math.round(trendScore * 10000) / 10000,
      },
      metrics,
      scoredAt: now,
    };
  }

  /**
   * Score multiple routes and return ranked results.
   */
  scoreRoutes(routeIds: string[]): ReliabilityScoringResult {
    const scoredRoutes: RouteReliabilityScore[] = [];

    for (const routeId of routeIds) {
      const score = this.getReliabilityScore(routeId);
      if (score) {
        scoredRoutes.push(score);
      }
    }

    // Sort by score descending
    scoredRoutes.sort((a, b) => b.score - a.score);

    return {
      scoredRoutes,
      totalRoutes: scoredRoutes.length,
      scoredAt: this.config.now(),
      config: this.config,
    };
  }

  // ─── Route Ranking Integration ────────────────────────────────────────────

  /**
   * Rank routes by reliability score.
   * Can be used standalone or integrated with existing ranking systems.
   */
  rankRoutesByReliability<T>(
    routes: Array<T & { id: string }>,
  ): ReliabilityRankedRoute<T>[] {
    const routeIds = routes.map((r) => r.id);
    const scoringResult = this.scoreRoutes(routeIds);

    const routeMap = new Map(routes.map((r) => [r.id, r]));

    return scoringResult.scoredRoutes.map((score, index) => {
      const route = routeMap.get(score.routeId);
      if (!route) {
        throw new Error(`Route not found: ${score.routeId}`);
      }
      return {
        route,
        reliabilityScore: score,
        combinedScore: score.score,
        rank: index + 1,
      };
    });
  }

  /**
   * Get reliability-adjusted scores for route ranking integration.
   * Returns a map of routeId -> reliability score that can be merged
   * with other scoring systems.
   */
  getReliabilityScoresForRanking(routeIds: string[]): Map<string, number> {
    const result = this.scoreRoutes(routeIds);
    const scores = new Map<string, number>();

    for (const scored of result.scoredRoutes) {
      scores.set(scored.routeId, scored.score);
    }

    return scores;
  }

  // ─── Data Management ──────────────────────────────────────────────────────

  /**
   * Get total number of tracked executions.
   */
  get totalExecutions(): number {
    return this.executions.length;
  }

  /**
   * Get all tracked route IDs.
   */
  get trackedRoutes(): string[] {
    return Array.from(this.routeIndex.keys());
  }

  /**
   * Remove old executions beyond max age.
   */
  pruneOldExecutions(): number {
    const maxAge = this.config.now() - this.config.maxDataAgeMs;
    const originalCount = this.executions.length;

    this.executions = this.executions.filter((e) => e.timestamp >= maxAge);

    // Rebuild index
    this.rebuildIndex();

    return originalCount - this.executions.length;
  }

  // ─── Internal Scoring Components ──────────────────────────────────────────

  private calculateSuccessRateScore(metrics: RouteReliabilityMetrics): number {
    return metrics.successRate;
  }

  private calculateRecentPerformanceScore(
    metrics: RouteReliabilityMetrics,
  ): number {
    // Prefer recent success rate, fallback to overall
    if (metrics.recentSuccessRate !== undefined) {
      return metrics.recentSuccessRate;
    }
    return metrics.successRate;
  }

  private calculateConsistencyScore(metrics: RouteReliabilityMetrics): number {
    // Consistency based on current streak and longest streaks
    const {
      consecutiveSuccesses,
      consecutiveFailures,
      longestSuccessStreak,
      longestFailureStreak,
    } = metrics;

    // Calculate streak ratio (successes vs failures)
    const currentStreak =
      consecutiveSuccesses > 0 ? consecutiveSuccesses : -consecutiveFailures;
    const maxPossibleStreak = Math.max(
      longestSuccessStreak,
      longestFailureStreak,
      1,
    );

    // Normalize to 0-1 range
    const streakScore = 0.5 + (currentStreak / maxPossibleStreak) * 0.5;

    // Also factor in overall success rate variance
    const successRateVariance = metrics.successRate * (1 - metrics.successRate);
    const variancePenalty = successRateVariance * 0.3; // Lower variance = more consistent

    return Math.max(0, Math.min(1, streakScore - variancePenalty));
  }

  private calculateVolumeScore(routeId: string): number | undefined {
    const executions = this.getExecutionsForRoute(routeId);
    const withAmount = executions.filter(
      (e) => e.amountUsd !== undefined && e.amountUsd > 0,
    );

    if (withAmount.length === 0) return undefined;

    // Calculate volume-weighted success rate
    let totalVolume = 0;
    let successfulVolume = 0;

    for (const exec of withAmount) {
      const weight = this.config.enableTimeDecay
        ? this.calculateTimeWeight(exec.timestamp)
        : 1;
      const amount = exec.amountUsd * weight;
      totalVolume += amount;
      if (exec.success) {
        successfulVolume += amount;
      }
    }

    return totalVolume > 0 ? successfulVolume / totalVolume : 0.5;
  }

  private calculateTrendScore(metrics: RouteReliabilityMetrics): number {
    // Compare recent vs older performance to detect trend
    if (
      metrics.recentSuccessRate === undefined ||
      metrics.weeklySuccessRate === undefined
    ) {
      return 0.5; // No trend data
    }

    const improvement = metrics.recentSuccessRate - metrics.weeklySuccessRate;

    // Normalize to 0-1 range
    // improvement of +0.2 or more = 1.0, -0.2 or less = 0.0
    return Math.max(0, Math.min(1, 0.5 + improvement * 2.5));
  }

  private calculateConfidence(metrics: RouteReliabilityMetrics): number {
    const { sampleSize, lastExecutionAt } = metrics;
    const now = this.config.now();

    // Sample size component (0-0.6)
    let sampleScore = 0;
    if (sampleSize >= this.config.highConfidenceMinSamples) {
      sampleScore = 0.6;
    } else if (sampleSize >= this.config.mediumConfidenceMinSamples) {
      sampleScore = 0.4;
    } else if (sampleSize > 0) {
      sampleScore = (sampleSize / this.config.mediumConfidenceMinSamples) * 0.4;
    }

    // Data freshness component (0-0.4)
    const ageMs = now - lastExecutionAt;
    const maxAge = this.config.maxDataAgeMs;
    let freshnessScore = 0;
    if (ageMs < maxAge * 0.1) {
      freshnessScore = 0.4; // Very fresh (within 10% of max age)
    } else if (ageMs < maxAge * 0.5) {
      freshnessScore = 0.3; // Moderately fresh
    } else if (ageMs < maxAge) {
      freshnessScore = 0.2; // Getting old
    } else {
      freshnessScore = 0; // Too old
    }

    return sampleScore + freshnessScore;
  }

  private getConfidenceTier(
    confidence: number,
    sampleSize: number,
  ): 'high' | 'medium' | 'low' {
    if (
      confidence >= 0.7 &&
      sampleSize >= this.config.highConfidenceMinSamples
    ) {
      return 'high';
    }
    if (
      confidence >= 0.4 &&
      sampleSize >= this.config.mediumConfidenceMinSamples
    ) {
      return 'medium';
    }
    return 'low';
  }

  // ─── Helper Methods ───────────────────────────────────────────────────────

  private getExecutionsForRoute(routeId: string): RouteExecutionRecord[] {
    const indices = this.routeIndex.get(routeId);
    if (!indices) return [];
    return indices.map((i) => this.executions[i]);
  }

  private analyzeStreaks(executions: RouteExecutionRecord[]): {
    consecutiveSuccesses: number;
    consecutiveFailures: number;
    longestSuccessStreak: number;
    longestFailureStreak: number;
  } {
    let consecutiveSuccesses = 0;
    let consecutiveFailures = 0;
    let longestSuccessStreak = 0;
    let longestFailureStreak = 0;
    let currentSuccessStreak = 0;
    let currentFailureStreak = 0;

    for (const exec of executions) {
      if (exec.success) {
        currentSuccessStreak++;
        currentFailureStreak = 0;
        consecutiveSuccesses = currentSuccessStreak;
        consecutiveFailures = 0;
        longestSuccessStreak = Math.max(
          longestSuccessStreak,
          currentSuccessStreak,
        );
      } else {
        currentFailureStreak++;
        currentSuccessStreak = 0;
        consecutiveFailures = currentFailureStreak;
        consecutiveSuccesses = 0;
        longestFailureStreak = Math.max(
          longestFailureStreak,
          currentFailureStreak,
        );
      }
    }

    return {
      consecutiveSuccesses,
      consecutiveFailures,
      longestSuccessStreak,
      longestFailureStreak,
    };
  }

  private calculateTimeWeight(timestamp: number): number {
    if (!this.config.enableTimeDecay) return 1;

    const age = this.config.now() - timestamp;
    const halfLife = this.config.timeDecayHalfLifeMs;

    // Exponential decay: weight = 0.5^(age / halfLife)
    return Math.pow(0.5, age / halfLife);
  }

  private calculateMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(percentile * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private rebuildIndex(): void {
    this.routeIndex.clear();
    for (let i = 0; i < this.executions.length; i++) {
      const routeId = this.executions[i].routeId;
      const indices = this.routeIndex.get(routeId) ?? [];
      indices.push(i);
      this.routeIndex.set(routeId, indices);
    }
  }
}

/** Default shared scorer instance */
export const routeReliabilityScorer = new SorobanRouteReliabilityScorer();

export default routeReliabilityScorer;
