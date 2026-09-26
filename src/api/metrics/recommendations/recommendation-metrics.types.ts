/**
 * Public types for the Soroban Route Recommendation Metrics API (#613).
 *
 * These describe the metric, ranking, and filter shapes exposed both by
 * the pure service and the NestJS controller.
 */

export type UserPreference = 'cheapest' | 'fastest' | 'balanced' | 'reliable';

export const USER_PREFERENCES: readonly UserPreference[] = [
  'cheapest',
  'fastest',
  'balanced',
  'reliable',
] as const;

export interface RecommendationInput {
  id: string;
  preference: UserPreference;
  /** Final score produced by the recommendation engine (0-100). */
  score: number;
  /** Confidence label (e.g. "high", "medium", "low"). */
  confidence: string;
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  /** Total fee in USD. */
  feeUsd: number;
  /** Estimated transfer time in seconds. */
  estimatedTimeSeconds: number;
  /** Reliability score (0-100). */
  reliabilityScore: number;
  /** Timestamp when the recommendation was generated. */
  generatedAt?: number;
}

/**
 * Filter applied to recommendation queries. All fields are optional and
 * combined with AND semantics.
 */
export interface RecommendationFilter {
  preference?: UserPreference | UserPreference[];
  bridgeName?: string;
  sourceChain?: string;
  destinationChain?: string;
  minScore?: number;
  maxScore?: number;
  minFeeUsd?: number;
  maxFeeUsd?: number;
  minReliabilityScore?: number;
  maxEstimatedTimeSeconds?: number;
  /** Limit the number of returned recommendations. */
  limit?: number;
}

/** Summary metric for a single preference. */
export interface RankingStatistics {
  preference: UserPreference;
  count: number;
  averageScore: number;
  topScore: number;
  minScore: number;
  maxScore: number;
  averageFeeUsd: number;
  averageReliabilityScore: number;
  averageEstimatedTimeSeconds: number;
}

/** Metric snapshot for a single recommendation row. */
export interface RecommendationMetrics {
  totalRecommendations: number;
  /** Average score across all recommendations. */
  averageScore: number;
  /** Average fee across all recommendations. */
  averageFeeUsd: number;
  /** Number of distinct bridges. */
  uniqueBridges: number;
  /** Number of distinct (source, destination) chain pairs. */
  uniqueRoutePairs: number;
  /** Score distribution bucketed into low/medium/high (33%/66% splits). */
  scoreDistribution: {
    low: number;
    medium: number;
    high: number;
  };
  /** Per-preference ranking statistics. */
  perPreference: RankingStatistics[];
  /** Generated-at timestamp (ms). */
  generatedAt: number;
}

/** Per-route (or per-id) roll-up. */
export interface RouteMetrics {
  id: string;
  preference: UserPreference;
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  score: number;
  confidence: string;
  feeUsd: number;
  estimatedTimeSeconds: number;
  reliabilityScore: number;
}
