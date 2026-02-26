import { IsOptional, IsString, IsNumber, IsBoolean, Min, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for fee estimate query
 */
export class FeeEstimateQueryDto {
  @ApiProperty({ description: 'Bridge name' })
  @IsString()
  bridgeName: string;

  @ApiProperty({ description: 'Source chain' })
  @IsString()
  sourceChain: string;

  @ApiProperty({ description: 'Destination chain' })
  @IsString()
  destinationChain: string;

  @ApiPropertyOptional({ description: 'Token symbol' })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiPropertyOptional({ description: 'Transfer amount' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ description: 'Include USD estimates', default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeUsd?: boolean = true;
}

/**
 * DTO for fee estimate response
 */
export class FeeEstimateDto {
  @ApiProperty({ description: 'Bridge name' })
  bridgeName: string;

  @ApiProperty({ description: 'Source chain' })
  sourceChain: string;

  @ApiProperty({ description: 'Destination chain' })
  destinationChain: string;

  @ApiPropertyOptional({ description: 'Token symbol' })
  token?: string;

  @ApiPropertyOptional({ description: 'Transfer amount' })
  amount?: number;

  @ApiProperty({ description: 'Total fee in native token' })
  totalFee: number;

  @ApiProperty({ description: 'Gas fee component' })
  gasFee: number;

  @ApiProperty({ description: 'Bridge fee component' })
  bridgeFee: number;

  @ApiProperty({ description: 'Liquidity-based fee component', default: 0 })
  liquidityFee: number;

  @ApiProperty({ description: 'Protocol fee component', default: 0 })
  protocolFee: number;

  @ApiPropertyOptional({ description: 'Gas price in Gwei' })
  gasPriceGwei?: number;

  @ApiPropertyOptional({ description: 'Gas limit estimate' })
  gasLimit?: number;

  @ApiPropertyOptional({ description: 'Network congestion level (0-100)' })
  networkCongestion?: number;

  @ApiProperty({ description: 'Token used for fee payment' })
  feeToken: string;

  @ApiPropertyOptional({ description: 'Fee token price in USD' })
  feeTokenPriceUsd?: number;

  @ApiPropertyOptional({ description: 'Total fee in USD' })
  totalFeeUsd?: number;

  @ApiProperty({ description: 'Whether this is a fallback estimate', default: false })
  isFallback: boolean;

  @ApiPropertyOptional({ description: 'Reason for fallback if applicable' })
  fallbackReason?: string;

  @ApiPropertyOptional({ description: 'Estimated transaction duration in seconds' })
  estimatedDurationSeconds?: number;

  @ApiProperty({ description: 'Last update timestamp' })
  lastUpdated: Date;

  @ApiProperty({ description: 'Expiration timestamp' })
  expiresAt: Date;

  @ApiProperty({ description: 'Cache TTL in seconds' })
  cacheTtlSeconds: number;
}

/**
 * DTO for batch fee estimates
 */
export class BatchFeeEstimateQueryDto {
  @ApiProperty({ description: 'Array of route identifiers', type: [Object] })
  routes: Array<{
    bridgeName: string;
    sourceChain: string;
    destinationChain: string;
    token?: string;
    amount?: number;
  }>;

  @ApiPropertyOptional({ description: 'Include USD estimates', default: true })
  @IsOptional()
  @IsBoolean()
  includeUsd?: boolean = true;
}

/**
 * DTO for batch fee estimate response
 */
export class BatchFeeEstimateResponseDto {
  @ApiProperty({ description: 'Fee estimates for each route', type: [FeeEstimateDto] })
  estimates: FeeEstimateDto[];

  @ApiProperty({ description: 'Number of successful estimates' })
  successful: number;

  @ApiProperty({ description: 'Number of fallback estimates' })
  fallbacks: number;

  @ApiProperty({ description: 'Response generation timestamp' })
  generatedAt: Date;
}

/**
 * DTO for gas price response
 */
export class GasPriceDto {
  @ApiProperty({ description: 'Chain name' })
  chain: string;

  @ApiProperty({ description: 'Gas price in Gwei' })
  gasPriceGwei: number;

  @ApiPropertyOptional({ description: 'Base fee (EIP-1559)' })
  baseFeeGwei?: number;

  @ApiPropertyOptional({ description: 'Priority fee (EIP-1559)' })
  priorityFeeGwei?: number;

  @ApiPropertyOptional({ description: 'Network congestion level (0-100)' })
  congestionLevel?: number;

  @ApiProperty({ description: 'Recommended gas limit' })
  recommendedGasLimit: number;

  @ApiProperty({ description: 'Last updated timestamp' })
  lastUpdated: Date;

  @ApiProperty({ description: 'Expiration timestamp' })
  expiresAt: Date;
}

/**
 * DTO for fee comparison request
 */
export class FeeComparisonQueryDto {
  @ApiProperty({ description: 'Source chain' })
  @IsString()
  sourceChain: string;

  @ApiProperty({ description: 'Destination chain' })
  @IsString()
  destinationChain: string;

  @ApiPropertyOptional({ description: 'Token symbol' })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiPropertyOptional({ description: 'Transfer amount' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ description: 'Bridge names to compare' })
  @IsOptional()
  bridges?: string[];
}

/**
 * DTO for fee comparison result
 */
export class FeeComparisonDto {
  @ApiProperty({ description: 'Bridge name' })
  bridgeName: string;

  @ApiProperty({ description: 'Total fee' })
  totalFee: number;

  @ApiPropertyOptional({ description: 'Total fee in USD' })
  totalFeeUsd?: number;

  @ApiProperty({ description: 'Fee breakdown' })
  breakdown: {
    gasFee: number;
    bridgeFee: number;
    liquidityFee: number;
    protocolFee: number;
  };

  @ApiProperty({ description: 'Whether this is a fallback estimate' })
  isFallback: boolean;

  @ApiProperty({ description: 'Rank by total fee (1 = cheapest)' })
  rank: number;

  @ApiProperty({ description: 'Savings compared to most expensive option' })
  savingsPercent: number;
}

/**
 * DTO for fee comparison response
 */
export class FeeComparisonResponseDto {
  @ApiProperty({ description: 'Fee comparisons', type: [FeeComparisonDto] })
  comparisons: FeeComparisonDto[];

  @ApiProperty({ description: 'Cheapest option' })
  cheapest: FeeComparisonDto;

  @ApiProperty({ description: 'Fastest option (if data available)' })
  fastest?: FeeComparisonDto;

  @ApiProperty({ description: 'Source chain' })
  sourceChain: string;

  @ApiProperty({ description: 'Destination chain' })
  destinationChain: string;

  @ApiProperty({ description: 'Response generation timestamp' })
  generatedAt: Date;
}

/**
 * DTO for network congestion status
 */
export class NetworkCongestionDto {
  @ApiProperty({ description: 'Chain name' })
  chain: string;

  @ApiProperty({ description: 'Congestion level (0-100)' })
  congestionLevel: number;

  @ApiProperty({ description: 'Congestion status' })
  status: 'low' | 'moderate' | 'high' | 'severe';

  @ApiProperty({ description: 'Average gas price in Gwei' })
  averageGasPriceGwei: number;

  @ApiProperty({ description: 'Pending transaction count' })
  pendingTransactions: number;

  @ApiProperty({ description: 'Average block time in seconds' })
  averageBlockTimeSeconds: number;

  @ApiProperty({ description: 'Last updated timestamp' })
  lastUpdated: Date;
}
