/**
 * Bridge Analytics Module
 *
 * Provides comprehensive analytics for BridgeWise bridge operations.
 * Includes data collection, aggregation, API endpoints, and React hooks.
 */

// Module
export { AnalyticsModule } from './analytics.module';

// Services
export { AnalyticsService } from './analytics.service';
export { AnalyticsCollector } from './analytics.collector';

// Controller
export { AnalyticsController } from './analytics.controller';

// Entities
export { BridgeAnalytics } from './entities/bridge-analytics.entity';

// DTOs
export {
  BridgeAnalyticsQueryDto,
  BridgeAnalyticsResponseDto,
  RouteAnalyticsDto,
  TimeSeriesDataPointDto,
  TimeSeriesAnalyticsDto,
  TopPerformingBridgesDto,
  SlippageStatisticsDto,
  UserActivityInsightsDto,
} from './dto/bridge-analytics.dto';

// Types
export type {
  BridgeAnalytics as BridgeAnalyticsType,
  RouteIdentifier,
  UseBridgeAnalyticsOptions,
  UseBridgeAnalyticsResult,
  TimeSeriesDataPoint,
  UseTimeSeriesOptions,
  UseTimeSeriesResult,
  PerformanceMetrics,
  SlippageStatistics,
  TopPerformingRoutes,
  AnalyticsEvent,
  AnalyticsUpdatePayload,
  AnalyticsApiResponse,
  PaginatedAnalyticsResponse,
} from './types/analytics.types';

// Migration
export { CreateBridgeAnalytics1700000000000 } from './migrations/1700000000000-CreateBridgeAnalytics';
