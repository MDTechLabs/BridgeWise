/**
 * Soroban Route Reliability Scoring Types
 *
 * Type definitions for tracking and scoring bridge route reliability
 * based on success rates, failure patterns, and historical performance.
 *
 * @module
 */

/** Individual route execution record */
export interface RouteExecutionRecord {
  /** Unique execution identifier */
  executionId: string;
  /** Route identifier */
  routeId: string;
  /** Whether the execution was successful */
  success: boolean;
  /** Execution timestamp (ms since epoch) */
  timestamp: number;
  /** Execution duration in milliseconds */
  durationMs?: number;
  /** Error message if failed */
  error?: string;
  /** Error category for pattern analysis */
  errorCategory?:
    | 'timeout'
    | 'insufficient_liquidity'
    | 'slippage'
    | 'network'
    | 'contract'
    | 'unknown';
  /** Transfer amount in USD (optional, for volume-weighted scoring) */
  amountUsd?: number;
}

/** Aggregated reliability metrics for a route */
export interface RouteReliabilityMetrics {
  /** Route identifier */
  routeId: string;
  /** Total number of executions */
  totalExecutions: number;
  /** Number of successful executions */
  successfulExecutions: number;
  /** Number of failed executions */
  failedExecutions: number;
  /** Overall success rate (0-1) */
  successRate: number;
  /** Success rate over last 24 hours (0-1) */
  recentSuccessRate?: number;
  /** Success rate over last 7 days (0-1) */
  weeklySuccessRate?: number;
  /** Average execution duration in milliseconds */
  avgDurationMs?: number;
  /** Median execution duration in milliseconds */
  medianDurationMs?: number;
  /** P95 execution duration in milliseconds */
  p95DurationMs?: number;
  /** Failure rate breakdown by error category */
  failureBreakdown?: Record<string, number>;
  /** Consecutive successes (current streak) */
  consecutiveSuccesses: number;
  /** Consecutive failures (current streak) */
  consecutiveFailures: number;
  /** Longest success streak ever */
  longestSuccessStreak: number;
  /** Longest failure streak ever */
  longestFailureStreak: number;
  /** Timestamp of last execution */
  lastExecutionAt: number;
  /** Timestamp when metrics were calculated */
  calculatedAt: number;
  /** Number of data points used (for confidence calculation) */
  sampleSize: number;
}

/** Reliability score with breakdown */
export interface RouteReliabilityScore {
  /** Route identifier */
  routeId: string;
  /** Overall reliability score (0-1, where 1 is most reliable) */
  score: number;
  /** Confidence in the score (0-1, based on sample size and data freshness) */
  confidence: number;
  /** Confidence tier */
  confidenceTier: 'high' | 'medium' | 'low';
  /** Score breakdown by component */
  breakdown: {
    /** Base success rate component (0-1) */
    successRateScore: number;
    /** Recency-weighted success rate (0-1) */
    recentPerformanceScore: number;
    /** Consistency score based on streaks (0-1) */
    consistencyScore: number;
    /** Volume-weighted score (0-1) */
    volumeScore?: number;
    /** Trend score (improving or degrading) (0-1) */
    trendScore: number;
  };
  /** Underlying metrics used for scoring */
  metrics: RouteReliabilityMetrics;
  /** Score calculation timestamp */
  scoredAt: number;
}

/** Configuration for reliability scoring */
export interface ReliabilityScoringConfig {
  /** Weight for base success rate. Default: 0.35 */
  successRateWeight?: number;
  /** Weight for recent performance. Default: 0.25 */
  recentPerformanceWeight?: number;
  /** Weight for consistency. Default: 0.20 */
  consistencyWeight?: number;
  /** Weight for volume (if amount data available). Default: 0.10 */
  volumeWeight?: number;
  /** Weight for trend. Default: 0.10 */
  trendWeight?: number;
  /** Time window for "recent" calculations in ms. Default: 86400000 (24h) */
  recentWindowMs?: number;
  /** Time window for weekly calculations in ms. Default: 604800000 (7d) */
  weeklyWindowMs?: number;
  /** Minimum sample size for high confidence. Default: 100 */
  highConfidenceMinSamples?: number;
  /** Minimum sample size for medium confidence. Default: 30 */
  mediumConfidenceMinSamples?: number;
  /** Maximum age of data to consider in ms. Default: 2592000000 (30d) */
  maxDataAgeMs?: number;
  /** Enable time-decay weighting. Default: true */
  enableTimeDecay?: boolean;
  /** Half-life for time decay in ms. Default: 604800000 (7d) */
  timeDecayHalfLifeMs?: number;
  /** Injected clock for testing */
  now?: () => number;
}

/** Filter options for querying route executions */
export interface ExecutionQueryFilter {
  /** Filter by route ID */
  routeId?: string;
  /** Filter by route IDs (multiple) */
  routeIds?: string[];
  /** Filter by success status */
  success?: boolean;
  /** Filter by error category */
  errorCategory?: string;
  /** Filter by timestamp range (start) */
  fromTimestamp?: number;
  /** Filter by timestamp range (end) */
  toTimestamp?: number;
  /** Filter by amount range (min USD) */
  minAmountUsd?: number;
  /** Filter by amount range (max USD) */
  maxAmountUsd?: number;
}

/** Result of reliability scoring for multiple routes */
export interface ReliabilityScoringResult {
  /** Scored routes, sorted by score descending */
  scoredRoutes: RouteReliabilityScore[];
  /** Total routes scored */
  totalRoutes: number;
  /** Scoring timestamp */
  scoredAt: number;
  /** Configuration used for scoring */
  config: Required<ReliabilityScoringConfig>;
}

/** Route ranking with reliability influence */
export interface ReliabilityRankedRoute<T = unknown> {
  /** Original route data */
  route: T;
  /** Reliability score */
  reliabilityScore: RouteReliabilityScore;
  /** Combined score (includes other factors if provided) */
  combinedScore: number;
  /** Rank position */
  rank: number;
}
