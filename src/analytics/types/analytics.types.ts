/**
 * Bridge Analytics Types
 *
 * TypeScript interfaces for the Bridge Analytics Dashboard
 * These types are shared between frontend and backend
 */

/**
 * Core Bridge Analytics interface
 * Matches the entity structure for type consistency
 */
export interface BridgeAnalytics {
  id: string;
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  token: string | null;
  totalTransfers: number;
  successfulTransfers: number;
  failedTransfers: number;
  averageSettlementTimeMs: number | null;
  averageFee: number | null;
  averageSlippagePercent: number | null;
  totalVolume: number;
  minSettlementTimeMs: number | null;
  maxSettlementTimeMs: number | null;
  lastUpdated: Date;
  createdAt: Date;
  successRate: number;
  failureRate: number;
}

/**
 * Route identifier for grouping analytics
 */
export interface RouteIdentifier {
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  token?: string;
}

/**
 * Options for the useBridgeAnalytics hook
 */
export interface UseBridgeAnalyticsOptions {
  /** Filter by bridge name */
  bridgeName?: string;
  /** Filter by source chain */
  sourceChain?: string;
  /** Filter by destination chain */
  destinationChain?: string;
  /** Filter by token */
  token?: string;
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
 * Result returned by useBridgeAnalytics hook
 */
export interface UseBridgeAnalyticsResult {
  /** Analytics data array */
  analyticsData: BridgeAnalytics[];
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
  /** Refetch function to manually refresh data */
  refetch: () => Promise<void>;
}

/**
 * Time series data point
 */
export interface TimeSeriesDataPoint {
  timestamp: Date;
  transfers: number;
  successfulTransfers: number;
  failedTransfers: number;
  averageSettlementTimeMs?: number;
  averageFee?: number;
  averageSlippagePercent?: number;
  totalVolume: number;
}

/**
 * Options for time series analytics
 */
export interface UseTimeSeriesOptions {
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  token?: string;
  granularity: 'hour' | 'day' | 'week' | 'month';
  startDate: Date;
  endDate: Date;
}

/**
 * Result for time series analytics
 */
export interface UseTimeSeriesResult {
  data: TimeSeriesDataPoint[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Performance metrics summary
 */
export interface PerformanceMetrics {
  averageSettlementTimeMs: number;
  minSettlementTimeMs: number;
  maxSettlementTimeMs: number;
  successRate: number;
  totalTransfers: number;
}

/**
 * Slippage statistics
 */
export interface SlippageStatistics {
  averageSlippagePercent: number;
  minSlippagePercent: number;
  maxSlippagePercent: number;
  highSlippageCount: number;
  highSlippagePercentage: number;
  distribution: Array<{
    range: string;
    count: number;
    percentage: number;
  }>;
}

/**
 * Top performing routes
 */
export interface TopPerformingRoutes {
  byVolume: BridgeAnalytics[];
  bySuccessRate: BridgeAnalytics[];
  bySpeed: BridgeAnalytics[];
}

/**
 * Analytics event for real-time updates
 */
export interface AnalyticsEvent {
  type: 'transfer_initiated' | 'transfer_completed' | 'transfer_failed' | 'metrics_updated';
  timestamp: number;
  route: RouteIdentifier;
  data?: Record<string, unknown>;
}

/**
 * Analytics update payload
 */
export interface AnalyticsUpdatePayload {
  route: RouteIdentifier;
  settlementTimeMs?: number;
  fee?: number;
  slippagePercent?: number;
  volume?: number;
  status: 'success' | 'failed';
  timestamp: Date;
}

/**
 * API response wrapper
 */
export interface AnalyticsApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

/**
 * Paginated API response
 */
export interface PaginatedAnalyticsResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  generatedAt: Date;
}
