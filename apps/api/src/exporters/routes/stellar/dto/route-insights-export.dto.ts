import {
  IsEnum,
  IsOptional,
  IsDateString,
  IsIn,
  IsBoolean,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Route Insights Export Format Options
 */
export enum ExportFormat {
  CSV = 'csv',
  JSON = 'json',
}

/**
 * Route Insights Export Request DTO
 */
export class RouteInsightsExportDto {
  @ApiProperty({
    description: 'Export format',
    enum: ExportFormat,
    default: ExportFormat.CSV,
  })
  @IsEnum(ExportFormat)
  @IsOptional()
  format?: ExportFormat = ExportFormat.CSV;

  @ApiPropertyOptional({
    description: 'Start date for analytics range (ISO 8601)',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for analytics range (ISO 8601)',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by source chain',
  })
  @IsOptional()
  @IsString()
  sourceChain?: string;

  @ApiPropertyOptional({
    description: 'Filter by destination chain',
  })
  @IsOptional()
  @IsString()
  destinationChain?: string;

  @ApiPropertyOptional({
    description: 'Filter by bridge name',
  })
  @IsOptional()
  @IsString()
  bridgeName?: string;

  @ApiPropertyOptional({
    description: 'Filter by token',
  })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiPropertyOptional({
    description: 'Include recommendation insights',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  includeRecommendations?: boolean = true;

  @ApiPropertyOptional({
    description: 'Include performance metrics',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  includeMetrics?: boolean = true;

  @ApiPropertyOptional({
    description: 'CSV delimiter (only for CSV format)',
    default: ',',
  })
  @IsOptional()
  @IsIn([',', ';', '\t'])
  delimiter?: ',' | ';' | '\t' = ',';

  @ApiPropertyOptional({
    description: 'Include route ranking',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  includeRanking?: boolean = true;

  @ApiPropertyOptional({
    description: 'Async export for large datasets',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  async?: boolean = false;
}

/**
 * Route Insights Data Point
 */
export class RouteInsightDataDto {
  @ApiProperty()
  bridgeName: string;

  @ApiProperty()
  sourceChain: string;

  @ApiProperty()
  destinationChain: string;

  @ApiPropertyOptional()
  token?: string;

  @ApiProperty({ description: 'Total number of transfers' })
  totalTransfers: number;

  @ApiProperty({ description: 'Successful transfers' })
  successfulTransfers: number;

  @ApiProperty({ description: 'Failed transfers' })
  failedTransfers: number;

  @ApiProperty({ description: 'Success rate percentage' })
  successRate: number;

  @ApiPropertyOptional({ description: 'Average settlement time in ms' })
  averageSettlementTimeMs?: number;

  @ApiPropertyOptional({ description: 'Average fee' })
  averageFee?: number;

  @ApiPropertyOptional({ description: 'Average slippage percentage' })
  averageSlippagePercent?: number;

  @ApiProperty({ description: 'Total volume transferred' })
  totalVolume: number;

  @ApiPropertyOptional({ description: 'Recommendation rank (1 = best)' })
  recommendationRank?: number;

  @ApiPropertyOptional({ description: 'Recommendation score (0-500)' })
  recommendationScore?: number;

  @ApiProperty({ description: 'Last updated timestamp' })
  lastUpdated: Date;
}

/**
 * Route Insights Export Response
 */
export class RouteInsightsExportResponseDto {
  @ApiProperty()
  exportId: string;

  @ApiProperty()
  format: ExportFormat;

  @ApiProperty()
  rowCount: number;

  @ApiPropertyOptional()
  downloadUrl?: string;

  @ApiProperty()
  generatedAt: Date;

  @ApiPropertyOptional()
  data?: RouteInsightDataDto[];

  @ApiPropertyOptional({ description: 'For async exports' })
  statusUrl?: string;

  @ApiPropertyOptional({ description: 'For async exports' })
  status?: string;
}
