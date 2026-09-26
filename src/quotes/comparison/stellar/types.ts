// ─── Quote Comparison Types ──────────────────────────────────────────────────
//
// Configurable evaluation criteria for ranking normalised Stellar bridge
// quotes across multiple providers.

import type { StellarBridgeQuote } from '../../types/canonical-quote';

// ─── Weights ─────────────────────────────────────────────────────────────────

/**
 * Configurable weights that control how much each evaluation dimension
 * contributes to the final composite score.
 *
 * All values must be in the range [0, 1]. The engine normalises them
 * internally so they do not need to sum to 1.
 */
export interface QuoteComparisonWeights {
  /** Importance of receiving a higher output amount (0–1). */
  receivedAmountWeight: number;
  /** Importance of lower total fees (0–1). */
  feeWeight: number;
  /** Importance of faster estimated execution time (0–1). */
  speedWeight: number;
  /** Importance of higher historical success rate (0–1). */
  reliabilityWeight: number;
}

// ─── Options ─────────────────────────────────────────────────────────────────

/**
 * Options accepted by the quote comparison engine.
 */
export interface QuoteComparisonOptions {
  /** Override the default weights. Missing keys fall back to defaults. */
  weights?: Partial<QuoteComparisonWeights>;

  /** Injected clock (epoch ms) for deterministic timestamps in tests. */
  now?: () => number;

  /**
   * Maximum number of ranked results to return.
   * Defaults to the length of the input quotes (i.e. return all).
   */
  maxResults?: number;

  /**
   * If true, quotes that have expired (expiresAt < now) are silently
   * excluded before comparison. Defaults to false.
   */
  excludeExpired?: boolean;
}

// ─── Dimension Scores ────────────────────────────────────────────────────────

/**
 * Per-dimension normalised scores for a single quote.
 *
 * Every value is in the range [0, 1] where **1 is the best** outcome
 * within the compared set.
 */
export interface QuoteDimensionScores {
  /** Higher received amount → higher score. */
  receivedAmountScore: number;
  /** Lower total fee → higher score. */
  feeScore: number;
  /** Faster execution → higher score. */
  speedScore: number;
  /** Higher success rate → higher score. */
  reliabilityScore: number;
}

// ─── Per-Quote Comparison Result ─────────────────────────────────────────────

/**
 * The comparison result for a single quote, enriched with dimension
 * scores, a composite weighted score, and a 1-based rank.
 */
export interface QuoteComparisonEntry {
  /** The original canonical quote that was compared. */
  quote: StellarBridgeQuote;
  /** Normalised per-dimension scores. */
  dimensionScores: QuoteDimensionScores;
  /** Weighted composite score (0–1, higher is better). */
  compositeScore: number;
  /** 1-based rank within the compared set (1 = best). */
  rank: number;
  /**
   * Delta of the composite score relative to the best quote.
   * 0 for the top-ranked quote; positive for all others.
   */
  deltaToBest: number;
}

// ─── Comparison Metadata ─────────────────────────────────────────────────────

/**
 * Aggregate metadata about a comparison run.
 */
export interface QuoteComparisonMetadata {
  /** Number of quotes that entered the comparison. */
  totalQuotes: number;
  /** Number of quotes that were excluded (e.g. expired). */
  excludedQuotes: number;
  /** Quote ID of the top-ranked result. */
  bestQuoteId: string | null;
  /** Composite score of the top-ranked result. */
  bestCompositeScore: number;
  /** Mean composite score across all ranked quotes. */
  averageCompositeScore: number;
  /** Score range across all ranked quotes. */
  scoreRange: { min: number; max: number };
  /** Provider distribution in the ranked set. */
  providerDistribution: Record<string, number>;
  /** Weights that were applied for this comparison. */
  appliedWeights: QuoteComparisonWeights;
  /** Epoch ms when the comparison was generated. */
  comparedAt: number;
}

// ─── Full Comparison Result ──────────────────────────────────────────────────

/**
 * The full result returned by the comparison engine.
 */
export interface QuoteComparisonResult {
  /** Ranked list of compared quotes (best first). */
  ranked: QuoteComparisonEntry[];
  /** Aggregate comparison metadata. */
  metadata: QuoteComparisonMetadata;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

/**
 * Default comparison weights.
 *
 * The defaults favour received amount and fees equally, with speed and
 * reliability as secondary signals.
 */
export const DEFAULT_COMPARISON_WEIGHTS: QuoteComparisonWeights = {
  receivedAmountWeight: 0.35,
  feeWeight: 0.3,
  speedWeight: 0.15,
  reliabilityWeight: 0.2,
};
