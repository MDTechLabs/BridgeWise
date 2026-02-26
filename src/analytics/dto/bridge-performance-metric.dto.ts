import { IsOptional, IsString, IsEnum, IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Time interval type
 */
export type TimeInterval = 'hourly' | 'daily' | 'weekly' | 'monthly';

/**
 * Time interval enum for validation
 */
export enum TimeIntervalEnum {
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

/**
 * DTO for querying historical performance metrics
 */
export class BridgePerformanceMetricQueryDto {
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

  @ApiPropertyOptional({
    description: 'Time interval for aggregation',
    enum: TimeIntervalEnum,
    default: TimeIntervalEnum.DAILY,
  })
  @IsOptional()
  @IsEnum(TimeIntervalEnum)
  timeInterval?: TimeInterval = TimeIntervalEnum.DAILY;

  @ApiPropertyOptional({ description: 'Start date for time range (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for time range (ISO 8601)' })
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
 * DTO for a single performance metric data point
 */
export class BridgePerformanceMetricDto {
  @ApiProperty({ description: 'Bridge name' })
  bridgeName: string;

  @ApiProperty({ description: 'Source chain' })
  sourceChain: string;

  @ApiProperty({ description: 'Destination chain' })
  destinationChain: string;

  @ApiPropertyOptional({ description: 'Token symbol' })
  token?: string;

  @ApiProperty({ description: 'Time interval', enum: TimeInterval })
  timeInterval: TimeInterval;

  @ApiProperty({ description: 'Timestamp for this metric period' })
  timestamp: Date;

  @ApiProperty({ description: 'Total transfers in this period' })
  totalTransfers: number;

  @ApiProperty({ description: 'Successful transfers' })
  successfulTransfers: number;

  @ApiProperty({ description: 'Failed transfers' })
  failedTransfers: number;

  @ApiProperty({ description: 'Success rate percentage' })
  successRate: number;

  @ApiProperty({ description: 'Failure rate percentage' })
  failureRate: number;

  @ApiPropertyOptional({ description: 'Average settlement time in milliseconds' })
  averageSettlementTimeMs?: number;

  @ApiPropertyOptional({ description: 'Minimum settlement time' })
  minSettlementTimeMs?: number;

  @ApiPropertyOptional({ description: 'Maximum settlement time' })
  maxSettlementTimeMs?: number;

  @ApiPropertyOptional({ description: 'Average fee amount' })
  averageFee?: number;

  @ApiPropertyOptional({ description: 'Minimum fee' })
  minFee?: number;

  @ApiPropertyOptional({ description: 'Maximum fee' })
  maxFee?: number;

  @ApiPropertyOptional({ description: 'Average slippage percentage' })
  averageSlippagePercent?: number;

  @ApiPropertyOptional({ description: 'Minimum slippage' })
  minSlippagePercent?: number;

  @ApiPropertyOptional({ description: 'Maximum slippage' })
  maxSlippagePercent?: number;

  @ApiProperty({ description: 'Total volume transferred' })
  totalVolume: number;

  @ApiProperty({ description: 'Total fees collected' })
  totalFees: number;
}

/**
 * DTO for paginated performance metrics response
 */
export class BridgePerformanceMetricResponseDto {
  @ApiProperty({ description: 'Performance metrics data', type: [BridgePerformanceMetricDto] })
  data: BridgePerformanceMetricDto[];

  @ApiProperty({ description: 'Total number of records' })
  total: number;

  @ApiProperty({ description: 'Current page number' })
  page: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;

  @ApiProperty({ description: 'Time interval used' })
  timeInterval: TimeInterval;

  @ApiProperty({ description: 'Response generation timestamp' })
  generatedAt: Date;
}

/**
 * DTO for historical trends data
 */
export class HistoricalTrendsDto {
  @ApiProperty({ description: 'Bridge name' })
  bridgeName: string;

  @ApiProperty({ description: 'Source chain' })
  sourceChain: string;

  @ApiProperty({ description: 'Destination chain' })
  destinationChain: string;

  @ApiPropertyOptional({ description: 'Token symbol' })
  token?: string;

  @ApiProperty({ description: 'Time interval', enum: TimeInterval })
  timeInterval: TimeInterval;

  @ApiProperty({ description: 'Trend data points', type: [BridgePerformanceMetricDto] })
  trends: BridgePerformanceMetricDto[];

  @ApiProperty({ description: 'Response generation timestamp' })
  generatedAt: Date;
}

/**
 * DTO for performance comparison between bridges
 */
export class BridgePerformanceComparisonDto {
  @ApiProperty({ description: 'Bridge name' })
  bridgeName: string;

  @ApiProperty({ description: 'Source chain' })
  sourceChain: string;

  @ApiProperty({ description: 'Destination chain' })
  destinationChain: string;

  @ApiProperty({ description: 'Time interval', enum: TimeInterval })
  timeInterval: TimeInterval;

  @ApiProperty({ description: 'Number of data points' })
  dataPoints: number;

  @ApiProperty({ description: 'Average success rate over period' })
  avgSuccessRate: number;

  @ApiProperty({ description: 'Average settlement time over period' })
  avgSettlementTimeMs: number;

  @ApiProperty({ description: 'Average fee over period' })
  avgFee: number;

  @ApiProperty({ description: 'Average slippage over period' })
  avgSlippagePercent: number;

  @ApiProperty({ description: 'Total volume over period' })
  totalVolume: number;

  @ApiProperty({ description: 'Total transfers over period' })
  totalTransfers: number;

  @ApiProperty({ description: 'Trend direction (improving/declining/stable)' })
  trendDirection: 'improving' | 'declining' | 'stable';
}

/**
 * DTO for performance comparison response
 */
export class BridgePerformanceComparisonResponseDto {
  @ApiProperty({ description: 'Comparison data', type: [BridgePerformanceComparisonDto] })
  comparisons: BridgePerformanceComparisonDto[];

  @ApiProperty({ description: 'Time interval used' })
  timeInterval: TimeInterval;

  @ApiProperty({ description: 'Start date of comparison period' })
  startDate: Date;

  @ApiProperty({ description: 'End date of comparison period' })
  endDate: Date;

  @ApiProperty({ description: 'Response generation timestamp' })
  generatedAt: Date;
}

/**
 * DTO for aggregation trigger request
 */
export class TriggerAggregationDto {
  @ApiPropertyOptional({
    description: 'Time interval to aggregate',
    enum: TimeInterval,
    default: TimeInterval.DAILY,
  })
  @IsOptional()
  @IsEnum(TimeInterval)
  timeInterval?: TimeInterval = TimeInterval.DAILY;

  @ApiPropertyOptional({ description: 'Date to aggregate (defaults to previous period)' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ description: 'Specific bridge to aggregate' })
  @IsOptional()
  @IsString()
  bridgeName?: string;
}
