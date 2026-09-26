import { IsInt, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Query parameters for a relay fee estimate.
 */
export class EstimateFeeQueryDto {
  @ApiProperty({
    description: 'Chain the cross-chain message originates from',
    example: 'stellar',
  })
  @IsString()
  sourceChain: string;

  @ApiProperty({
    description: 'Chain the cross-chain message will be executed on',
    example: 'ethereum',
  })
  @IsString()
  targetChain: string;

  @ApiProperty({
    description: 'Size of the cross-chain payload, in bytes',
    example: 256,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  payloadByteLength: number;
}

/**
 * Relay fee quote for sending a cross-chain payload.
 */
export class RelayFeeEstimateDto {
  @ApiProperty({ description: 'Chain the cross-chain message originates from' })
  sourceChain: string;

  @ApiProperty({ description: 'Chain the cross-chain message will be executed on' })
  targetChain: string;

  @ApiProperty({ description: 'Size of the cross-chain payload, in bytes' })
  payloadByteLength: number;

  @ApiProperty({
    description: 'Estimated gas units required to execute the payload on the target chain',
  })
  estimatedGasUnits: number;

  @ApiProperty({
    description: 'Human-readable target chain gas price used for this quote',
    example: '30 gwei',
  })
  targetGasPrice: string;

  @ApiProperty({
    description: 'Relayer margin applied on top of the raw gas cost, in basis points',
  })
  relayerMarginBps: number;

  @ApiProperty({
    description: 'Symbol of the target chain native token these amounts are denominated in',
    example: 'ETH',
  })
  nativeTokenSymbol: string;

  @ApiProperty({
    description: 'Raw destination gas cost, in target chain native token units',
  })
  destinationGasCostNative: string;

  @ApiProperty({
    description: 'Relayer margin amount, in target chain native token units',
  })
  relayerMarginNative: string;

  @ApiProperty({
    description: 'Total relay fee (gas cost + relayer margin), in target chain native token units',
  })
  totalFeeNative: string;

  @ApiProperty({ description: 'Total relay fee, in USD' })
  totalFeeUsd: string;

  @ApiProperty({ description: 'Unix timestamp (ms) this quote was generated at' })
  quotedAt: number;
}
