/**
 * User feedback analytics for Stellar route recommendations.
 *
 * Collects individual feedback records left by users after a route is
 * recommended to them, then aggregates that raw data into per-route metrics,
 * actionable recommendation insights, and time-bucketed trend reports.
 *
 * Storage is in-memory and bounded, mirroring the other analytics modules in
 * `src/analytics/**\/stellar`.
 */

export type FeedbackSentiment = 'positive' | 'neutral' | 'negative';

/** A single piece of user feedback on a recommended route. */
export interface RouteFeedbackEntry {
  routeId: string;
  fromAsset?: string;
  toAsset?: string;
  recommendationId?: string;
  userId?: string;
  /** Star rating from 1 (worst) to 5 (best). */
  rating: number;
  /** Whether the user acted on / accepted the recommendation. */
  accepted: boolean;
  comment?: string;
  submittedAt: Date;
}

export type RouteFeedbackInput = Omit<RouteFeedbackEntry, 'submittedAt'> & {
  submittedAt?: Date;
};

export interface RouteFeedbackAnalyzerOptions {
  keepMaxEntries?: number;
  /** Ratings at or above this are treated as positive. Default 4. */
  positiveRatingThreshold?: number;
  /** Ratings at or below this are treated as negative. Default 2. */
  negativeRatingThreshold?: number;
}

export interface FeedbackQuery {
  from?: Date;
  to?: Date;
}

/** Aggregated feedback metrics for a single route. */
export interface RouteFeedbackAggregate {
  routeId: string;
  totalFeedback: number;
  averageRating: number;
  acceptanceRate: number;
  sentimentDistribution: Record<FeedbackSentiment, number>;
  positiveRate: number;
  negativeRate: number;
  commentCount: number;
  lastFeedbackAt: Date | null;
}

/** A recommendation insight derived from the aggregated feedback. */
export interface RecommendationInsight {
  routeId: string;
  averageRating: number;
  acceptanceRate: number;
  totalFeedback: number;
  sentiment: FeedbackSentiment;
  /** Human-readable summary of what the feedback implies. */
  recommendation: string;
}

export interface RouteFeedbackInsights {
  topRoutes: RecommendationInsight[];
  underperformingRoutes: RecommendationInsight[];
  routesNeedingAttention: RecommendationInsight[];
  overallAverageRating: number;
  overallAcceptanceRate: number;
  totalFeedback: number;
}

export interface FeedbackTrendBucket {
  periodStart: Date;
  periodEnd: Date;
  totalFeedback: number;
  averageRating: number;
  acceptanceRate: number;
  sentimentDistribution: Record<FeedbackSentiment, number>;
}

export interface FeedbackTrendReport {
  routeId: string | null;
  bucketSizeMs: number;
  from: Date;
  to: Date;
  buckets: FeedbackTrendBucket[];
  ratingTrend: 'improving' | 'declining' | 'stable';
  acceptanceTrend: 'improving' | 'declining' | 'stable';
}

const SENTIMENTS: FeedbackSentiment[] = ['positive', 'neutral', 'negative'];

export class StellarRouteFeedbackAnalyzer {
  private readonly entries: RouteFeedbackEntry[] = [];
  private readonly maxEntries: number;
  private readonly positiveThreshold: number;
  private readonly negativeThreshold: number;

  constructor(options: RouteFeedbackAnalyzerOptions = {}) {
    this.maxEntries = options.keepMaxEntries ?? 10_000;
    this.positiveThreshold = options.positiveRatingThreshold ?? 4;
    this.negativeThreshold = options.negativeRatingThreshold ?? 2;
  }

  /** Records a single feedback entry, validating and normalizing the input. */
  recordFeedback(input: RouteFeedbackInput): RouteFeedbackEntry {
    if (!input.routeId?.trim()) {
      throw new Error('routeId must be a non-empty string');
    }
    if (
      typeof input.rating !== 'number' ||
      Number.isNaN(input.rating) ||
      input.rating < 1 ||
      input.rating > 5
    ) {
      throw new Error('rating must be a number between 1 and 5');
    }

    const entry: RouteFeedbackEntry = {
      routeId: input.routeId.trim(),
      fromAsset: input.fromAsset?.trim(),
      toAsset: input.toAsset?.trim(),
      recommendationId: input.recommendationId?.trim(),
      userId: input.userId?.trim(),
      rating: input.rating,
      accepted: input.accepted,
      comment: input.comment?.trim() || undefined,
      submittedAt: input.submittedAt ?? new Date(),
    };

    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
    return entry;
  }

  /** Returns a copy of all stored feedback entries, optionally filtered. */
  getFeedback(routeId?: string, query: FeedbackQuery = {}): RouteFeedbackEntry[] {
    return this.entries
      .filter((e) => (routeId ? e.routeId === routeId : true))
      .filter((e) => withinRange(e.submittedAt, query))
      .map((e) => ({ ...e }));
  }

  /** Lists every route that has at least one feedback entry. */
  getRoutesWithFeedback(): string[] {
    return Array.from(new Set(this.entries.map((e) => e.routeId)));
  }

  /**
   * Aggregates feedback for a single route into rating, acceptance and
   * sentiment metrics. Returns null when there is no feedback in range.
   */
  aggregateRoute(
    routeId: string,
    query: FeedbackQuery = {},
  ): RouteFeedbackAggregate | null {
    const entries = this.getFeedback(routeId, query);
    if (entries.length === 0) {
      return null;
    }
    return this.aggregateEntries(routeId, entries);
  }

  /** Aggregates feedback for every route with feedback in range. */
  aggregateAll(query: FeedbackQuery = {}): RouteFeedbackAggregate[] {
    return this.getRoutesWithFeedback()
      .map((routeId) => this.aggregateRoute(routeId, query))
      .filter((a): a is RouteFeedbackAggregate => a !== null);
  }

  /**
   * Generates recommendation insights: which recommended routes users love,
   * which underperform, and which need attention (enough feedback but poor
   * ratings or low acceptance).
   */
  generateInsights(
    query: FeedbackQuery = {},
    options: { topN?: number; minFeedbackForAttention?: number } = {},
  ): RouteFeedbackInsights {
    const topN = options.topN ?? 5;
    const minFeedbackForAttention = options.minFeedbackForAttention ?? 3;

    const aggregates = this.aggregateAll(query);
    const insights = aggregates.map((agg) => this.toInsight(agg));

    const byRating = [...insights].sort(
      (a, b) =>
        b.averageRating - a.averageRating ||
        b.acceptanceRate - a.acceptanceRate ||
        b.totalFeedback - a.totalFeedback,
    );

    const topRoutes = byRating.slice(0, topN);
    const underperformingRoutes = [...byRating]
      .reverse()
      .slice(0, topN);

    const routesNeedingAttention = insights
      .filter(
        (i) =>
          i.totalFeedback >= minFeedbackForAttention &&
          (i.sentiment === 'negative' || i.acceptanceRate < 0.5),
      )
      .sort((a, b) => a.averageRating - b.averageRating);

    const totalFeedback = aggregates.reduce(
      (sum, a) => sum + a.totalFeedback,
      0,
    );
    const overallAverageRating =
      totalFeedback === 0
        ? 0
        : aggregates.reduce(
            (sum, a) => sum + a.averageRating * a.totalFeedback,
            0,
          ) / totalFeedback;
    const overallAcceptanceRate =
      totalFeedback === 0
        ? 0
        : aggregates.reduce(
            (sum, a) => sum + a.acceptanceRate * a.totalFeedback,
            0,
          ) / totalFeedback;

    return {
      topRoutes,
      underperformingRoutes,
      routesNeedingAttention,
      overallAverageRating,
      overallAcceptanceRate,
      totalFeedback,
    };
  }

  /**
   * Produces a time-bucketed trend report. When `routeId` is provided the
   * report is scoped to that route, otherwise it spans all feedback.
   */
  generateTrendReport(
    options: {
      routeId?: string;
      bucketSizeMs?: number;
      from?: Date;
      to?: Date;
    } = {},
  ): FeedbackTrendReport {
    const bucketSizeMs = options.bucketSizeMs ?? 24 * 60 * 60 * 1000;
    if (bucketSizeMs <= 0) {
      throw new Error('bucketSizeMs must be a positive number');
    }

    const entries = this.getFeedback(options.routeId, {
      from: options.from,
      to: options.to,
    }).sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());

    const from =
      options.from ??
      (entries.length > 0 ? entries[0].submittedAt : new Date());
    const to =
      options.to ??
      (entries.length > 0
        ? entries[entries.length - 1].submittedAt
        : new Date(from.getTime()));

    const buckets: FeedbackTrendBucket[] = [];
    if (entries.length > 0 || options.from || options.to) {
      const start = from.getTime();
      const end = Math.max(to.getTime(), start);
      for (
        let bucketStart = start;
        bucketStart <= end;
        bucketStart += bucketSizeMs
      ) {
        const bucketEnd = bucketStart + bucketSizeMs;
        const bucketEntries = entries.filter((e) => {
          const t = e.submittedAt.getTime();
          return t >= bucketStart && t < bucketEnd;
        });
        buckets.push({
          periodStart: new Date(bucketStart),
          periodEnd: new Date(bucketEnd),
          totalFeedback: bucketEntries.length,
          averageRating: averageRating(bucketEntries),
          acceptanceRate: acceptanceRate(bucketEntries),
          sentimentDistribution: this.sentimentDistribution(bucketEntries),
        });
      }
    }

    const populated = buckets.filter((b) => b.totalFeedback > 0);

    return {
      routeId: options.routeId ?? null,
      bucketSizeMs,
      from,
      to,
      buckets,
      ratingTrend: computeTrend(populated.map((b) => b.averageRating)),
      acceptanceTrend: computeTrend(populated.map((b) => b.acceptanceRate)),
    };
  }

  /** Removes feedback for a single route. */
  clearRoute(routeId: string): number {
    let removed = 0;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].routeId === routeId) {
        this.entries.splice(i, 1);
        removed += 1;
      }
    }
    return removed;
  }

  /** Removes all stored feedback. */
  clear(): void {
    this.entries.length = 0;
  }

  private aggregateEntries(
    routeId: string,
    entries: RouteFeedbackEntry[],
  ): RouteFeedbackAggregate {
    const total = entries.length;
    const ratingSum = entries.reduce((sum, e) => sum + e.rating, 0);
    const accepted = entries.filter((e) => e.accepted).length;
    const sentiment = this.sentimentDistribution(entries);
    const lastFeedbackAt = entries.reduce<Date | null>((latest, e) => {
      if (!latest || e.submittedAt > latest) {
        return e.submittedAt;
      }
      return latest;
    }, null);

    return {
      routeId,
      totalFeedback: total,
      averageRating: ratingSum / total,
      acceptanceRate: accepted / total,
      sentimentDistribution: sentiment,
      positiveRate: sentiment.positive / total,
      negativeRate: sentiment.negative / total,
      commentCount: entries.filter((e) => !!e.comment).length,
      lastFeedbackAt,
    };
  }

  private sentimentDistribution(
    entries: RouteFeedbackEntry[],
  ): Record<FeedbackSentiment, number> {
    const distribution = emptySentiment();
    for (const entry of entries) {
      distribution[this.classifySentiment(entry.rating)] += 1;
    }
    return distribution;
  }

  private classifySentiment(rating: number): FeedbackSentiment {
    if (rating >= this.positiveThreshold) {
      return 'positive';
    }
    if (rating <= this.negativeThreshold) {
      return 'negative';
    }
    return 'neutral';
  }

  private toInsight(agg: RouteFeedbackAggregate): RecommendationInsight {
    const sentiment = dominantSentiment(agg.sentimentDistribution);
    return {
      routeId: agg.routeId,
      averageRating: agg.averageRating,
      acceptanceRate: agg.acceptanceRate,
      totalFeedback: agg.totalFeedback,
      sentiment,
      recommendation: buildRecommendation(agg, sentiment),
    };
  }
}

function withinRange(date: Date, query: FeedbackQuery): boolean {
  if (query.from && date < query.from) {
    return false;
  }
  if (query.to && date > query.to) {
    return false;
  }
  return true;
}

function emptySentiment(): Record<FeedbackSentiment, number> {
  return SENTIMENTS.reduce(
    (acc, s) => {
      acc[s] = 0;
      return acc;
    },
    {} as Record<FeedbackSentiment, number>,
  );
}

function averageRating(entries: RouteFeedbackEntry[]): number {
  if (entries.length === 0) {
    return 0;
  }
  return entries.reduce((sum, e) => sum + e.rating, 0) / entries.length;
}

function acceptanceRate(entries: RouteFeedbackEntry[]): number {
  if (entries.length === 0) {
    return 0;
  }
  return entries.filter((e) => e.accepted).length / entries.length;
}

function dominantSentiment(
  distribution: Record<FeedbackSentiment, number>,
): FeedbackSentiment {
  let best: FeedbackSentiment = 'neutral';
  let bestCount = -1;
  for (const sentiment of SENTIMENTS) {
    if (distribution[sentiment] > bestCount) {
      bestCount = distribution[sentiment];
      best = sentiment;
    }
  }
  return best;
}

function buildRecommendation(
  agg: RouteFeedbackAggregate,
  sentiment: FeedbackSentiment,
): string {
  if (sentiment === 'positive' && agg.acceptanceRate >= 0.6) {
    return 'Performing well — keep prioritizing this route in recommendations.';
  }
  if (sentiment === 'negative') {
    return 'Poorly received — review pricing/liquidity and consider de-prioritizing.';
  }
  if (agg.acceptanceRate < 0.5) {
    return 'Low acceptance despite ratings — investigate why users skip this route.';
  }
  return 'Mixed feedback — monitor for emerging trends before changing priority.';
}

function computeTrend(
  values: number[],
): 'improving' | 'declining' | 'stable' {
  if (values.length < 2) {
    return 'stable';
  }
  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);
  const firstAvg =
    firstHalf.reduce((s, v) => s + v, 0) / Math.max(firstHalf.length, 1);
  const secondAvg =
    secondHalf.reduce((s, v) => s + v, 0) / Math.max(secondHalf.length, 1);
  const delta = secondAvg - firstAvg;
  const threshold = 0.05;
  if (delta > threshold) {
    return 'improving';
  }
  if (delta < -threshold) {
    return 'declining';
  }
  return 'stable';
}
