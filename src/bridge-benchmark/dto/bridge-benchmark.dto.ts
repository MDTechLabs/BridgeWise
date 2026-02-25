import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  IsPositive,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChainType, TransactionStatus } from '../entities/bridge-benchmark.entity';

export class InitiateBenchmarkDto {
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

  @ApiProperty({ example: 'USDC' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiPropertyOptional({ enum: ChainType, default: ChainType.EVM })
  @IsOptional()
  @IsEnum(ChainType)
  sourceChainType?: ChainType;

  @ApiPropertyOptional({ enum: ChainType, default: ChainType.EVM })
  @IsOptional()
  @IsEnum(ChainType)
  destinationChainType?: ChainType;

  @ApiPropertyOptional({ example: '1000.00' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({ description: 'ISO timestamp when quote was requested' })
  @IsOptional()
  @IsDateString()
  quoteRequestedAt?: string;
}

export class ConfirmBenchmarkDto {
  @ApiPropertyOptional({ description: 'Source chain transaction hash' })
  @IsOptional()
  @IsString()
  transactionHash?: string;

  @ApiPropertyOptional({ description: 'Destination chain transaction hash' })
  @IsOptional()
  @IsString()
  destinationTxHash?: string;
}

export class UpdateBenchmarkStatusDto {
  @ApiProperty({ enum: TransactionStatus })
  @IsEnum(TransactionStatus)
  status: TransactionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transactionHash?: string;
}

export class SpeedMetricsQueryDto {
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
    description: 'Number of recent transactions used for rolling average',
    default: 50,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  rollingWindow?: number;
}

export class RouteSpeedMetricDto {
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  token: string;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  totalTransactions: number;
  successfulTransactions: number;
  successRate: number;
  rollingAvgDurationMs: number;
  lastUpdated: Date;
}

export class SpeedMetricsResponseDto {
  metrics: RouteSpeedMetricDto[];
  generatedAt: Date;
}
