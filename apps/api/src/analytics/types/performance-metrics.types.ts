/**
 * Historical Bridge Performance Metrics Types
 *
 * TypeScript interfaces for historical performance tracking
 */

/**
 * Time interval for metric aggregation
 */
export type TimeInterval = 'hourly' | 'daily' | 'weekly' | 'monthly';

/**
 * Historical performance metric interface
 */
export interface BridgePerformanceMetric {
  id: string;
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  token: string | null;
  timeInterval: TimeInterval;
  totalTransfers: number;
  successfulTransfers: number;
  failedTransfers: number;
  averageSettlementTimeMs: number | null;
  minSettlementTimeMs: number | null;
  maxSettlementTimeMs: number | null;
  averageFee: number | null;
  minFee: number | null;
  maxFee: number | null;
  averageSlippagePercent: number | null;
  minSlippagePercent: number | null;
  maxSlippagePercent: number | null;
  totalVolume: number;
  totalFees: number;
  timestamp: Date;
  createdAt: Date;
  successRate: number;
  failureRate: number;
}

/**
 * Options for useBridgePerformanceMetrics hook
 */
export interface UseBridgePerformanceMetricsOptions {
  /** Filter by bridge name */
  bridgeName?: string;
  /** Filter by source chain */
  sourceChain?: string;
  /** Filter by destination chain */
  destinationChain?: string;
  /** Filter by token */
  token?: string;
  /** Time interval for aggregation */
  timeInterval?: TimeInterval;
  /** Start date for time range */
  startDate?: Date;
  /** End date for time range */
  endDate?: Date;
  /** Page number for pagination */
  page?: number;
  /** Items per page */
  limit?: number;
  /** Auto-refresh interval in milliseconds (0 to disable) */
  refreshInterval?: number;
  /** Enable/disable the query */
  enabled?: boolean;
}

/**
 * Result returned by useBridgePerformanceMetrics hook
 */
export interface UseBridgePerformanceMetricsResult {
  /** Performance metrics data array */
  metrics: BridgePerformanceMetric[];
  /** Loading state */
  loading: boolean;
  /** Error if any */
  error: Error | null;
  /** Total count for pagination */
  total: number;
  /** Current page */
  page: number;
  /** Total pages */
  totalPages: number;
  /** Time interval used */
  timeInterval: TimeInterval;
  /** Refetch function to manually refresh data */
  refetch: () => Promise<void>;
}

/**
 * Options for historical trends
 */
export interface UseHistoricalTrendsOptions {
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  token?: string;
  timeInterval: TimeInterval;
  startDate: Date;
  endDate: Date;
}

/**
 * Result for historical trends
 */
export interface UseHistoricalTrendsResult {
  /** Trend data points */
  trends: BridgePerformanceMetric[];
  /** Loading state */
  loading: boolean;
  /** Error if any */
  error: Error | null;
  /** Refetch function */
  refetch: () => Promise<void>;
}

/**
 * Performance trend analysis
 */
export interface PerformanceTrendAnalysis {
  /** Metric being analyzed */
  metric: 'successRate' | 'settlementTime' | 'fees' | 'slippage' | 'volume';
  /** Trend direction */
  direction: 'improving' | 'declining' | 'stable';
  /** Percentage change over period */
  changePercent: number;
  /** Starting value */
  startValue: number;
  /** Ending value */
  endValue: number;
  /** Average value over period */
  averageValue: number;
  /** Minimum value */
  minValue: number;
  /** Maximum value */
  maxValue: number;
}

/**
 * Bridge comparison data
 */
export interface BridgeComparison {
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  timeInterval: TimeInterval;
  dataPoints: number;
  avgSuccessRate: number;
  avgSettlementTimeMs: number;
  avgFee: number;
  avgSlippagePercent: number;
  totalVolume: number;
  totalTransfers: number;
  trendDirection: 'improving' | 'declining' | 'stable';
  trendAnalysis: PerformanceTrendAnalysis[];
}

/**
 * Options for bridge comparison
 */
export interface UseBridgeComparisonOptions {
  bridgeNames?: string[];
  sourceChain?: string;
  destinationChain?: string;
  token?: string;
  timeInterval: TimeInterval;
  startDate: Date;
  endDate: Date;
}

/**
 * Result for bridge comparison
 */
export interface UseBridgeComparisonResult {
  /** Comparison data */
  comparisons: BridgeComparison[];
  /** Loading state */
  loading: boolean;
  /** Error if any */
  error: Error | null;
  /** Refetch function */
  refetch: () => Promise<void>;
}

/**
 * Aggregation job status
 */
export interface AggregationJobStatus {
  id: string;
  timeInterval: TimeInterval;
  date: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  recordsProcessed: number;
  recordsInserted: number;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Metric summary for quick overview
 */
export interface PerformanceMetricSummary {
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  totalDataPoints: number;
  dateRange: {
    start: Date;
    end: Date;
  };
  overallStats: {
    totalTransfers: number;
    avgSuccessRate: number;
    avgSettlementTimeMs: number;
    avgFee: number;
    avgSlippagePercent: number;
    totalVolume: number;
  };
  bestPeriod?: {
    timestamp: Date;
    successRate: number;
  };
  worstPeriod?: {
    timestamp: Date;
    successRate: number;
  };
}
