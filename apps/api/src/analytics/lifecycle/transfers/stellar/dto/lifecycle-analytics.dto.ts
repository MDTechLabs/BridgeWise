import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BottleneckInfo,
  LifecycleStage,
  StageStatistics,
  TransferOutcome,
} from '../types/lifecycle.types';

// ─── Query DTOs ──────────────────────────────────────────────────────────────

/**
 * Query parameters for lifecycle analytics report endpoint.
 */
export class LifecycleAnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by source chain (e.g. stellar)' })
  @IsOptional()
  @IsString()
  sourceChain?: string;

  @ApiPropertyOptional({ description: 'Filter by destination chain' })
  @IsOptional()
  @IsString()
  destinationChain?: string;

  @ApiPropertyOptional({ description: 'Filter by asset symbol (e.g. USDC)' })
  @IsOptional()
  @IsString()
  asset?: string;

  @ApiPropertyOptional({ description: 'Filter by bridge / provider name' })
  @IsOptional()
  @IsString()
  bridgeName?: string;

  @ApiPropertyOptional({ description: 'Start date for analysis window (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for analysis window (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Restrict analysis to failed transfers only',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  failedOnly?: boolean = false;
}

/**
 * Query parameters for recording a single lifecycle event.
 */
export class RecordLifecycleEventDto {
  @ApiProperty({ description: 'Unique transfer identifier' })
  @IsUUID()
  transferId: string;

  @ApiProperty({ description: 'Lifecycle stage reached', enum: LifecycleStage })
  @IsEnum(LifecycleStage)
  stage: LifecycleStage;

  @ApiPropertyOptional({ description: 'Source chain identifier' })
  @IsOptional()
  @IsString()
  sourceChain?: string;

  @ApiPropertyOptional({ description: 'Destination chain identifier' })
  @IsOptional()
  @IsString()
  destinationChain?: string;

  @ApiPropertyOptional({ description: 'Asset / token symbol' })
  @IsOptional()
  @IsString()
  asset?: string;

  @ApiPropertyOptional({ description: 'Bridge or provider name' })
  @IsOptional()
  @IsString()
  bridgeName?: string;

  @ApiPropertyOptional({ description: 'Event timestamp (ISO 8601). Defaults to now.' })
  @IsOptional()
  @IsDateString()
  timestamp?: string;

  @ApiPropertyOptional({ description: 'Error message (required when stage = FAILED)' })
  @IsOptional()
  @IsString()
  errorMessage?: string;

  @ApiPropertyOptional({ description: 'Arbitrary JSON metadata' })
  @IsOptional()
  metadata?: Record<string, unknown>;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

/**
 * Single lifecycle event as returned by the API.
 */
export class LifecycleEventDto {
  @ApiProperty() id: string;
  @ApiProperty() transferId: string;
  @ApiProperty({ enum: LifecycleStage }) stage: LifecycleStage;
  @ApiPropertyOptional() sourceChain: string | null;
  @ApiPropertyOptional() destinationChain: string | null;
  @ApiPropertyOptional() asset: string | null;
  @ApiPropertyOptional() bridgeName: string | null;
  @ApiPropertyOptional({ nullable: true }) durationFromPreviousMs: number | null;
  @ApiPropertyOptional({ enum: TransferOutcome, nullable: true }) outcome: TransferOutcome | null;
  @ApiPropertyOptional({ nullable: true }) errorMessage: string | null;
  @ApiPropertyOptional() metadata: Record<string, unknown> | null;
  @ApiProperty() recordedAt: Date;
}

/**
 * Per-stage statistics DTO.
 */
export class StageStatisticsDto implements StageStatistics {
  @ApiProperty({ enum: LifecycleStage }) stage: LifecycleStage;
  @ApiProperty() label: string;
  @ApiProperty() reachCount: number;
  @ApiProperty() failCount: number;
  @ApiProperty() stageFailureRate: number;
  @ApiProperty() avgDurationMs: number;
  @ApiProperty() medianDurationMs: number;
  @ApiProperty() p95DurationMs: number;
  @ApiProperty() minDurationMs: number;
  @ApiProperty() maxDurationMs: number;
}

/**
 * Bottleneck description DTO.
 */
export class BottleneckInfoDto implements BottleneckInfo {
  @ApiProperty({ enum: LifecycleStage }) stage: LifecycleStage;
  @ApiProperty() label: string;
  @ApiProperty() avgDurationMs: number;
  @ApiProperty() percentOfTotalTime: number;
  @ApiProperty() failCount: number;
  @ApiProperty({ enum: ['low', 'medium', 'high', 'critical'] })
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Full lifecycle analytics report DTO.
 */
export class LifecycleAnalyticsReportDto {
  @ApiProperty() totalTransfers: number;
  @ApiProperty() successfulTransfers: number;
  @ApiProperty() failedTransfers: number;
  @ApiProperty() timedOutTransfers: number;
  @ApiProperty() overallSuccessRate: number;
  @ApiProperty() avgTotalDurationMs: number;
  @ApiProperty() medianTotalDurationMs: number;
  @ApiProperty() p95TotalDurationMs: number;
  @ApiProperty({ type: [StageStatisticsDto] }) stageStats: StageStatisticsDto[];
  @ApiProperty({ type: [BottleneckInfoDto] }) bottlenecks: BottleneckInfoDto[];
  @ApiProperty() generatedAt: Date;
}

/**
 * Transfer history for a single transferId.
 */
export class TransferLifecycleHistoryDto {
  @ApiProperty() transferId: string;
  @ApiProperty({ type: [LifecycleEventDto] }) events: LifecycleEventDto[];
  @ApiPropertyOptional({ enum: TransferOutcome, nullable: true })
  finalOutcome: TransferOutcome | null;
  @ApiPropertyOptional({ nullable: true }) totalDurationMs: number | null;
}
