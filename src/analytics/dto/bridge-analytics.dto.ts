import { IsOptional, IsString, IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for querying bridge analytics with filters
 */
export class BridgeAnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by bridge name' })
  @IsOptional()
  @IsString()
  bridgeName?: string;

  @ApiPropertyOptional({ description: 'Filter by source chain' })
  @IsOptional()
  @IsString()
  sourceChain?: string;

  @ApiPropertyOptional({ description: 'Filter by destination chain' })
  @IsOptional()
  @IsString()
  destinationChain?: string;

  @ApiPropertyOptional({ description: 'Filter by token' })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiPropertyOptional({ description: 'Start date for time range filter (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for time range filter (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Page number for pagination', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;
}

/**
 * DTO for route-specific analytics data
 */
export class RouteAnalyticsDto {
  @ApiProperty({ description: 'Bridge name' })
  bridgeName: string;

  @ApiProperty({ description: 'Source chain' })
  sourceChain: string;

  @ApiProperty({ description: 'Destination chain' })
  destinationChain: string;

  @ApiPropertyOptional({ description: 'Token symbol' })
  token?: string;

  @ApiProperty({ description: 'Total number of transfers' })
  totalTransfers: number;

  @ApiProperty({ description: 'Number of successful transfers' })
  successfulTransfers: number;

  @ApiProperty({ description: 'Number of failed transfers' })
  failedTransfers: number;

  @ApiProperty({ description: 'Success rate percentage' })
  successRate: number;

  @ApiProperty({ description: 'Failure rate percentage' })
  failureRate: number;

  @ApiPropertyOptional({ description: 'Average settlement time in milliseconds' })
  averageSettlementTimeMs?: number;

  @ApiPropertyOptional({ description: 'Minimum settlement time in milliseconds' })
  minSettlementTimeMs?: number;

  @ApiPropertyOptional({ description: 'Maximum settlement time in milliseconds' })
  maxSettlementTimeMs?: number;

  @ApiPropertyOptional({ description: 'Average fee amount' })
  averageFee?: number;

  @ApiPropertyOptional({ description: 'Average slippage percentage' })
  averageSlippagePercent?: number;

  @ApiProperty({ description: 'Total volume transferred' })
  totalVolume: number;

  @ApiProperty({ description: 'Last updated timestamp' })
  lastUpdated: Date;
}

/**
 * DTO for time-series analytics data point
 */
export class TimeSeriesDataPointDto {
  @ApiProperty({ description: 'Timestamp for the data point' })
  timestamp: Date;

  @ApiProperty({ description: 'Number of transfers in this period' })
  transfers: number;

  @ApiProperty({ description: 'Number of successful transfers' })
  successfulTransfers: number;

  @ApiProperty({ description: 'Number of failed transfers' })
  failedTransfers: number;

  @ApiPropertyOptional({ description: 'Average settlement time' })
  averageSettlementTimeMs?: number;

  @ApiPropertyOptional({ description: 'Average fee' })
  averageFee?: number;

  @ApiPropertyOptional({ description: 'Average slippage' })
  averageSlippagePercent?: number;

  @ApiProperty({ description: 'Total volume' })
  totalVolume: number;
}

/**
 * DTO for time-series analytics response
 */
export class TimeSeriesAnalyticsDto {
  @ApiProperty({ description: 'Bridge name' })
  bridgeName: string;

  @ApiProperty({ description: 'Source chain' })
  sourceChain: string;

  @ApiProperty({ description: 'Destination chain' })
  destinationChain: string;

  @ApiPropertyOptional({ description: 'Token symbol' })
  token?: string;

  @ApiProperty({ description: 'Time granularity (hour, day, week, month)' })
  granularity: 'hour' | 'day' | 'week' | 'month';

  @ApiProperty({ description: 'Time series data points', type: [TimeSeriesDataPointDto] })
  data: TimeSeriesDataPointDto[];
}

/**
 * DTO for paginated analytics response
 */
export class BridgeAnalyticsResponseDto {
  @ApiProperty({ description: 'Analytics data', type: [RouteAnalyticsDto] })
  data: RouteAnalyticsDto[];

  @ApiProperty({ description: 'Total number of records' })
  total: number;

  @ApiProperty({ description: 'Current page number' })
  page: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;

  @ApiProperty({ description: 'Response generation timestamp' })
  generatedAt: Date;
}

/**
 * DTO for top performing bridges response
 */
export class TopPerformingBridgesDto {
  @ApiProperty({ description: 'Top bridges by volume', type: [RouteAnalyticsDto] })
  byVolume: RouteAnalyticsDto[];

  @ApiProperty({ description: 'Top bridges by success rate', type: [RouteAnalyticsDto] })
  bySuccessRate: RouteAnalyticsDto[];

  @ApiProperty({ description: 'Top bridges by speed', type: [RouteAnalyticsDto] })
  bySpeed: RouteAnalyticsDto[];

  @ApiProperty({ description: 'Response generation timestamp' })
  generatedAt: Date;
}

/**
 * DTO for slippage statistics
 */
export class SlippageStatisticsDto {
  @ApiProperty({ description: 'Bridge name' })
  bridgeName: string;

  @ApiProperty({ description: 'Source chain' })
  sourceChain: string;

  @ApiProperty({ description: 'Destination chain' })
  destinationChain: string;

  @ApiProperty({ description: 'Average slippage percentage' })
  averageSlippagePercent: number;

  @ApiProperty({ description: 'Minimum slippage percentage' })
  minSlippagePercent: number;

  @ApiProperty({ description: 'Maximum slippage percentage' })
  maxSlippagePercent: number;

  @ApiProperty({ description: 'Number of high slippage transfers (>1%)' })
  highSlippageCount: number;

  @ApiProperty({ description: 'Percentage of transfers with high slippage' })
  highSlippagePercentage: number;

  @ApiProperty({ description: 'Slippage distribution buckets' })
  distribution: {
    range: string;
    count: number;
    percentage: number;
  }[];
}

/**
 * DTO for user activity insights
 */
export class UserActivityInsightsDto {
  @ApiProperty({ description: 'Total unique users (anonymized)' })
  totalUniqueUsers: number;

  @ApiProperty({ description: 'Total transfers' })
  totalTransfers: number;

  @ApiProperty({ description: 'Average transfers per user' })
  averageTransfersPerUser: number;

  @ApiProperty({ description: 'Most active time period' })
  peakActivityPeriod: {
    hour: number;
    transferCount: number;
  };

  @ApiProperty({ description: 'Most popular routes', type: [RouteAnalyticsDto] })
  popularRoutes: RouteAnalyticsDto[];

  @ApiProperty({ description: 'Response generation timestamp' })
  generatedAt: Date;
}
