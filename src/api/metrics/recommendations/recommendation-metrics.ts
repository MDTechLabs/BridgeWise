import { Injectable } from '@nestjs/common';
import {
  RankingStatistics,
  RecommendationFilter,
  RecommendationInput,
  RecommendationMetrics,
  RouteMetrics,
  USER_PREFERENCES,
  UserPreference,
} from './recommendation-metrics.types';

/**
 * Soroban Route Recommendation Metrics service (#613).
 *
 * Pure, in-memory aggregator that turns a set of {@link RecommendationInput}
 * rows into ranking statistics, per-preference summaries, and per-route
 * roll-ups. Consumers (NestJS controller, GraphQL resolvers, etc.) call
 * the public methods to expose metrics to API clients.
 */
@Injectable()
export class RecommendationMetricsService {
  private recommendations: RecommendationInput[] = [];

  /** Ingest recommendations in bulk, replacing any prior state. */
  ingest(recommendations: RecommendationInput[]): void {
    this.recommendations = [...recommendations];
  }

  /** Append a single recommendation. */
  record(rec: RecommendationInput): void {
    this.recommendations.push(rec);
  }

  /** Drop everything currently in memory. */
  clear(): void {
    this.recommendations = [];
  }

  /** Number of stored recommendations. */
  size(): number {
    return this.recommendations.length;
  }

  /**
   * Apply a {@link RecommendationFilter} and return matching rows as
   * {@link RouteMetrics} projections.
   */
  listRecommendations(filter: RecommendationFilter = {}): RouteMetrics[] {
    const filtered = this.applyFilter(this.recommendations, filter);
    const limit = filter.limit && filter.limit > 0 ? filter.limit : filtered.length;
    return filtered.slice(0, limit).map(toRouteMetrics);
  }

  /**
   * Ranking statistics for a single preference. Falls back to a zeroed
   * result when no rows match.
   */
  rankingFor(preference: UserPreference): RankingStatistics {
    const subset = this.recommendations.filter((r) => r.preference === preference);
    return buildRankingStats(preference, subset);
  }

  /**
   * All per-preference ranking statistics.
   */
  rankingStats(): RankingStatistics[] {
    return USER_PREFERENCES.map((p) => this.rankingFor(p));
  }

  /**
   * Full recommendation-metric snapshot — totals, score distribution,
   * unique bridge/route counts, and per-preference stats.
   */
  snapshot(): RecommendationMetrics {
    const recs = this.recommendations;
    if (recs.length === 0) {
      return {
        totalRecommendations: 0,
        averageScore: 0,
        averageFeeUsd: 0,
        uniqueBridges: 0,
        uniqueRoutePairs: 0,
        scoreDistribution: { low: 0, medium: 0, high: 0 },
        perPreference: USER_PREFERENCES.map((p) =>
          buildRankingStats(p, []),
        ),
        generatedAt: Date.now(),
      };
    }

    const bridges = new Set(recs.map((r) => r.bridgeName));
    const pairs = new Set(recs.map((r) => `${r.sourceChain}->${r.destinationChain}`));
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

    return {
      totalRecommendations: recs.length,
      averageScore: round(avg(recs.map((r) => r.score))),
      averageFeeUsd: round(avg(recs.map((r) => r.feeUsd))),
      uniqueBridges: bridges.size,
      uniqueRoutePairs: pairs.size,
      scoreDistribution: scoreDistribution(recs.map((r) => r.score)),
      perPreference: this.rankingStats(),
      generatedAt: Date.now(),
    };
  }

  /**
   * Lookup a single recommendation by its id. Returns null when not found.
   */
  getById(id: string): RouteMetrics | null {
    const found = this.recommendations.find((r) => r.id === id);
    return found ? toRouteMetrics(found) : null;
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private applyFilter(
    recs: RecommendationInput[],
    filter: RecommendationFilter,
  ): RecommendationInput[] {
    const preferences = filter.preference
      ? Array.isArray(filter.preference)
        ? filter.preference
        : [filter.preference]
      : null;

    return recs.filter((r) => {
      if (preferences && !preferences.includes(r.preference)) return false;
      if (filter.bridgeName && r.bridgeName !== filter.bridgeName) return false;
      if (filter.sourceChain && r.sourceChain !== filter.sourceChain) return false;
      if (filter.destinationChain && r.destinationChain !== filter.destinationChain) return false;
      if (filter.minScore != null && r.score < filter.minScore) return false;
      if (filter.maxScore != null && r.score > filter.maxScore) return false;
      if (filter.minFeeUsd != null && r.feeUsd < filter.minFeeUsd) return false;
      if (filter.maxFeeUsd != null && r.feeUsd > filter.maxFeeUsd) return false;
      if (filter.minReliabilityScore != null && r.reliabilityScore < filter.minReliabilityScore) return false;
      if (filter.maxEstimatedTimeSeconds != null && r.estimatedTimeSeconds > filter.maxEstimatedTimeSeconds) return false;
      return true;
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toRouteMetrics(r: RecommendationInput): RouteMetrics {
  return {
    id: r.id,
    preference: r.preference,
    bridgeName: r.bridgeName,
    sourceChain: r.sourceChain,
    destinationChain: r.destinationChain,
    score: r.score,
    confidence: r.confidence,
    feeUsd: r.feeUsd,
    estimatedTimeSeconds: r.estimatedTimeSeconds,
    reliabilityScore: r.reliabilityScore,
  };
}

function buildRankingStats(
  preference: UserPreference,
  recs: RecommendationInput[],
): RankingStatistics {
  if (recs.length === 0) {
    return {
      preference,
      count: 0,
      averageScore: 0,
      topScore: 0,
      minScore: 0,
      maxScore: 0,
      averageFeeUsd: 0,
      averageReliabilityScore: 0,
      averageEstimatedTimeSeconds: 0,
    };
  }
  const scores = recs.map((r) => r.score);
  const fees = recs.map((r) => r.feeUsd);
  const reliabilities = recs.map((r) => r.reliabilityScore);
  const times = recs.map((r) => r.estimatedTimeSeconds);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    preference,
    count: recs.length,
    averageScore: round(avg(scores)),
    topScore: round(Math.max(...scores)),
    minScore: round(Math.min(...scores)),
    maxScore: round(Math.max(...scores)),
    averageFeeUsd: round(avg(fees)),
    averageReliabilityScore: round(avg(reliabilities)),
    averageEstimatedTimeSeconds: round(avg(times)),
  };
}

function scoreDistribution(scores: number[]): { low: number; medium: number; high: number } {
  // Buckets: low < 33, medium 33-66, high > 66 (on a 0-100 scale).
  let low = 0, medium = 0, high = 0;
  for (const s of scores) {
    if (s < 33) low++;
    else if (s < 67) medium++;
    else high++;
  }
  return { low, medium, high };
}

function round(value: number, decimals = 4): number {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}
