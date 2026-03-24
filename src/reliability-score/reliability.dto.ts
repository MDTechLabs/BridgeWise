import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ReliabilityTier,
  TransactionOutcome,
  WindowMode,
} from './reliability.enum';

// ─── Record Event ────────────────────────────────────────────────────────────
export class RecordBridgeEventDto {
  @ApiProperty({ example: 'Stargate' })
  @IsString()
  @IsNotEmpty()
  bridgeName: string;

  @ApiProperty({ example: 'ethereum' })
  @IsString()
  @IsNotEmpty()
  sourceChain: string;

  @ApiProperty({ example: 'polygon' })
  @IsString()
  @IsNotEmpty()
  destinationChain: string;

  @ApiProperty({ enum: TransactionOutcome })
  @IsEnum(TransactionOutcome)
  outcome: TransactionOutcome;

  @ApiPropertyOptional({ example: '0xabc123' })
  @IsOptional()
  @IsString()
  transactionHash?: string;

  @ApiPropertyOptional({ example: 'RPC timeout after 30s' })
  @IsOptional()
  @IsString()
  failureReason?: string;

  @ApiPropertyOptional({ example: 12000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  durationMs?: number;
}

// ─── Query Reliability ────────────────────────────────────────────────────────
export class GetReliabilityDto {
  @ApiProperty({ example: 'Stargate' })
  @IsString()
  @IsNotEmpty()
  bridgeName: string;

  @ApiProperty({ example: 'ethereum' })
  @IsString()
  @IsNotEmpty()
  sourceChain: string;

  @ApiProperty({ example: 'polygon' })
  @IsString()
  @IsNotEmpty()
  destinationChain: string;

  @ApiPropertyOptional({
    enum: WindowMode,
    default: WindowMode.TRANSACTION_COUNT,
  })
  @IsOptional()
  @IsEnum(WindowMode)
  windowMode?: WindowMode;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10000)
  windowSize?: number;
}

// ─── Response ─────────────────────────────────────────────────────────────────
export class ReliabilityBadgeDto {
  @ApiProperty({ enum: ReliabilityTier })
  tier: ReliabilityTier;

  @ApiProperty({ example: 'High Reliability' })
  label: string;

  @ApiProperty({ example: '#22c55e' })
  color: string;

  @ApiProperty({
    example:
      'Score based on last 100 transactions. Excludes user-cancelled events.',
  })
  tooltip: string;
}

export class BridgeReliabilityResponseDto {
  @ApiProperty({ example: 'Stargate' })
  bridgeName: string;

  @ApiProperty({ example: 'ethereum' })
  sourceChain: string;

  @ApiProperty({ example: 'polygon' })
  destinationChain: string;

  @ApiProperty({ example: 240 })
  totalAttempts: number;

  @ApiProperty({ example: 235 })
  successfulTransfers: number;

  @ApiProperty({ example: 3 })
  failedTransfers: number;

  @ApiProperty({ example: 2 })
  timeoutCount: number;

  @ApiProperty({ example: 97.92 })
  reliabilityPercent: number;

  @ApiProperty({ example: 97.92 })
  reliabilityScore: number;

  @ApiProperty({ type: ReliabilityBadgeDto })
  badge: ReliabilityBadgeDto;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  lastComputedAt: Date;
}

// ─── Ranking Integration ──────────────────────────────────────────────────────
export class ReliabilityRankingFactorDto {
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  reliabilityScore: number;
  penaltyApplied: boolean;
  adjustedScore: number;
}
