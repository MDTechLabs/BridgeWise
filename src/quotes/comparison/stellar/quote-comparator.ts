/**
 * File: src/quotes/comparison/stellar/quote-comparator.ts
 *
 * Stellar Bridge Quote Comparison Engine
 *
 * Compares normalised bridge quotes using configurable evaluation
 * criteria and returns a ranked result set with per-dimension scores
 * and aggregate metadata.
 *
 * Design goals:
 *   - Pure / dependency-free so the engine is trivial to test.
 *   - Configurable ranking weights that do not need to sum to 1.
 *   - Every dimension is normalised to [0, 1] where 1 = best.
 *   - Expired-quote filtering is opt-in.
 *   - Deterministic timestamps via injected clock.
 */

import type { StellarBridgeQuote } from '../../types/canonical-quote';

import {
  DEFAULT_COMPARISON_WEIGHTS,
  type QuoteComparisonEntry,
  type QuoteComparisonMetadata,
  type QuoteComparisonOptions,
  type QuoteComparisonResult,
  type QuoteDimensionScores,
  type QuoteComparisonWeights,
} from './types';

// ─── Engine ──────────────────────────────────────────────────────────────────

export class QuoteComparator {
  private readonly weights: QuoteComparisonWeights;
  private readonly now: () => number;

  constructor(options: QuoteComparisonOptions = {}) {
    this.weights = {
      ...DEFAULT_COMPARISON_WEIGHTS,
      ...(options.weights ?? {}),
    };
    this.now = options.now ?? (() => Date.now());
  }

  // ─── Public API ────────────────────────────────────────────────────────

  /**
   * Compare a set of quotes and return them ranked best-first together
   * with comparison metadata.
   *
   * If `quotes` is empty the result contains an empty ranked array and
   * null metadata fields.
   */
  compare(
    quotes: StellarBridgeQuote[],
    options: QuoteComparisonOptions = {},
  ): QuoteComparisonResult {
    const weights = { ...this.weights, ...(options.weights ?? {}) };
    const now = options.now ? options.now() : this.now();
    const excludeExpired = options.excludeExpired ?? false;

    // 1 — Optionally filter expired quotes.
    const { eligible, excludedCount } = this.filterQuotes(
      quotes,
      now,
      excludeExpired,
    );

    if (eligible.length === 0) {
      return {
        ranked: [],
        metadata: this.emptyMetadata(
          weights,
          quotes.length,
          excludedCount,
          now,
        ),
      };
    }

    // 2 — Extract raw dimension values.
    const receivedAmounts = eligible.map((q) => this.parseReceivedAmount(q));
    const fees = eligible.map((q) => q.fees.totalFeeUsdCents);
    const times = eligible.map((q) => q.execution.estimatedTimeSeconds);
    const reliabilities = eligible.map((q) => q.execution.successRate);

    // 3 — Compute min/max for each dimension.
    const ranges = {
      receivedAmount: minMax(receivedAmounts),
      fee: minMax(fees),
      time: minMax(times),
      reliability: minMax(reliabilities),
    };

    // 4 — Score each quote.
    const scored: QuoteComparisonEntry[] = eligible.map((quote, i) => {
      const dimensionScores: QuoteDimensionScores = {
        receivedAmountScore: normalize(
          receivedAmounts[i],
          ranges.receivedAmount,
          /* lowerIsBetter */ false,
        ),
        feeScore: normalize(fees[i], ranges.fee, /* lowerIsBetter */ true),
        speedScore: normalize(times[i], ranges.time, /* lowerIsBetter */ true),
        reliabilityScore: normalize(
          reliabilities[i],
          ranges.reliability,
          /* lowerIsBetter */ false,
        ),
      };

      const compositeScore = weightedComposite(dimensionScores, weights);

      return {
        quote,
        dimensionScores,
        compositeScore,
        rank: 0,
        deltaToBest: 0,
      };
    });

    // 5 — Sort descending by composite score and assign ranks.
    scored.sort((a, b) => b.compositeScore - a.compositeScore);
    const bestScore = scored[0].compositeScore;
    scored.forEach((entry, idx) => {
      entry.rank = idx + 1;
      entry.deltaToBest = bestScore - entry.compositeScore;
    });

    // 6 — Apply maxResults cap.
    const maxResults = options.maxResults;
    const ranked =
      typeof maxResults === 'number' && maxResults > 0
        ? scored.slice(0, maxResults)
        : scored;

    // 7 — Build metadata.
    const metadata = this.buildMetadata(
      ranked,
      weights,
      quotes.length,
      excludedCount,
      now,
    );

    return { ranked, metadata };
  }

  /**
   * Convenience wrapper that returns only the best quote entry, or
   * `null` if the input is empty.
   */
  getBest(
    quotes: StellarBridgeQuote[],
    options: QuoteComparisonOptions = {},
  ): QuoteComparisonEntry | null {
    const result = this.compare(quotes, { ...options, maxResults: 1 });
    return result.ranked.length > 0 ? result.ranked[0] : null;
  }

  /**
   * Compare exactly two quotes and return both ranked.
   * Useful for head-to-head provider comparisons.
   */
  comparePair(
    a: StellarBridgeQuote,
    b: StellarBridgeQuote,
    options: QuoteComparisonOptions = {},
  ): [QuoteComparisonEntry, QuoteComparisonEntry] {
    const result = this.compare([a, b], options);
    return result.ranked as [QuoteComparisonEntry, QuoteComparisonEntry];
  }

  /** Returns the currently configured default weights. */
  getDefaultWeights(): QuoteComparisonWeights {
    return { ...this.weights };
  }

  // ─── Dimension helpers (static, exported for external use) ─────────────

  /**
   * Parse the effective received amount from a quote.
   * Prefers `netOutputAmount` (post-fee) and falls back to `outputAmount`.
   */
  static parseReceivedAmount(quote: StellarBridgeQuote): number {
    const net = parseFloat(quote.output.netOutputAmount);
    if (Number.isFinite(net) && net > 0) return net;
    const gross = parseFloat(quote.output.outputAmount);
    return Number.isFinite(gross) ? gross : 0;
  }

  /**
   * Compare quotes solely by received amount (highest first).
   */
  static compareByReceivedAmount(
    quotes: StellarBridgeQuote[],
  ): StellarBridgeQuote[] {
    return [...quotes].sort(
      (a, b) =>
        QuoteComparator.parseReceivedAmount(b) -
        QuoteComparator.parseReceivedAmount(a),
    );
  }

  /**
   * Compare quotes solely by total fee (lowest first).
   */
  static compareByFee(quotes: StellarBridgeQuote[]): StellarBridgeQuote[] {
    return [...quotes].sort(
      (a, b) => a.fees.totalFeeUsdCents - b.fees.totalFeeUsdCents,
    );
  }

  /**
   * Compare quotes solely by estimated execution time (fastest first).
   */
  static compareBySpeed(quotes: StellarBridgeQuote[]): StellarBridgeQuote[] {
    return [...quotes].sort(
      (a, b) =>
        a.execution.estimatedTimeSeconds - b.execution.estimatedTimeSeconds,
    );
  }

  /**
   * Compare quotes solely by success rate (highest first).
   */
  static compareByReliability(
    quotes: StellarBridgeQuote[],
  ): StellarBridgeQuote[] {
    return [...quotes].sort(
      (a, b) => b.execution.successRate - a.execution.successRate,
    );
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  private parseReceivedAmount(quote: StellarBridgeQuote): number {
    return QuoteComparator.parseReceivedAmount(quote);
  }

  private filterQuotes(
    quotes: StellarBridgeQuote[],
    now: number,
    excludeExpired: boolean,
  ): { eligible: StellarBridgeQuote[]; excludedCount: number } {
    if (!excludeExpired) {
      return { eligible: [...quotes], excludedCount: 0 };
    }
    const eligible: StellarBridgeQuote[] = [];
    let excludedCount = 0;
    for (const q of quotes) {
      if (q.expiresAt !== undefined && q.expiresAt < now) {
        excludedCount++;
      } else {
        eligible.push(q);
      }
    }
    return { eligible, excludedCount };
  }

  private buildMetadata(
    ranked: QuoteComparisonEntry[],
    weights: QuoteComparisonWeights,
    totalQuotes: number,
    excludedQuotes: number,
    comparedAt: number,
  ): QuoteComparisonMetadata {
    const scores = ranked.map((e) => e.compositeScore);
    const providerDistribution: Record<string, number> = {};
    for (const e of ranked) {
      providerDistribution[e.quote.providerId] =
        (providerDistribution[e.quote.providerId] ?? 0) + 1;
    }

    return {
      totalQuotes,
      excludedQuotes,
      bestQuoteId: ranked.length > 0 ? ranked[0].quote.id : null,
      bestCompositeScore: scores.length > 0 ? scores[0] : 0,
      averageCompositeScore:
        scores.length > 0
          ? scores.reduce((s, v) => s + v, 0) / scores.length
          : 0,
      scoreRange: {
        min: scores.length > 0 ? Math.min(...scores) : 0,
        max: scores.length > 0 ? Math.max(...scores) : 0,
      },
      providerDistribution,
      appliedWeights: weights,
      comparedAt,
    };
  }

  private emptyMetadata(
    weights: QuoteComparisonWeights,
    totalQuotes: number,
    excludedQuotes: number,
    comparedAt: number,
  ): QuoteComparisonMetadata {
    return {
      totalQuotes,
      excludedQuotes,
      bestQuoteId: null,
      bestCompositeScore: 0,
      averageCompositeScore: 0,
      scoreRange: { min: 0, max: 0 },
      providerDistribution: {},
      appliedWeights: weights,
      comparedAt,
    };
  }
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

interface Range {
  min: number;
  max: number;
}

function minMax(values: number[]): Range {
  if (values.length === 0) return { min: 0, max: 0 };
  let min = values[0];
  let max = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i] < min) min = values[i];
    if (values[i] > max) max = values[i];
  }
  return { min, max };
}

/**
 * Normalise a single value to [0, 1] using min-max scaling.
 *
 * - If `lowerIsBetter` is true the score is inverted so that lower raw
 *   values produce higher scores.
 * - If min === max (all values identical) the score is 0.5 (neutral).
 */
function normalize(
  value: number,
  range: Range,
  lowerIsBetter: boolean,
): number {
  if (range.max === range.min) return 0.5;
  const ratio = (value - range.min) / (range.max - range.min);
  return lowerIsBetter ? 1 - ratio : ratio;
}

/**
 * Compute a weighted composite score from dimension scores.
 *
 * The result is in [0, 1] because the weights are divided out.
 */
function weightedComposite(
  scores: QuoteDimensionScores,
  weights: QuoteComparisonWeights,
): number {
  const totalWeight =
    weights.receivedAmountWeight +
    weights.feeWeight +
    weights.speedWeight +
    weights.reliabilityWeight;

  if (totalWeight === 0) return 0.5;

  return (
    (scores.receivedAmountScore * weights.receivedAmountWeight +
      scores.feeScore * weights.feeWeight +
      scores.speedScore * weights.speedWeight +
      scores.reliabilityScore * weights.reliabilityWeight) /
    totalWeight
  );
}
