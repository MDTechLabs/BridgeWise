import { IsNumber, IsString, IsNotEmpty, IsOptional, IsIn, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GetQuotesDto {
  @ApiProperty({ example: 1, description: 'Source chain ID' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  fromChain: number;

  @ApiProperty({ example: 137, description: 'Destination chain ID' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  toChain: number;

  @ApiProperty({ example: 'USDC', description: 'Token symbol to bridge' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.toUpperCase())
  token: string;

  @ApiProperty({ example: '1000', description: 'Amount to bridge (in token units)' })
  @IsString()
  @IsNotEmpty()
  amount: string;

  @ApiPropertyOptional({
    example: 'cost',
    enum: ['cost', 'speed', 'score'],
    description: 'Ranking strategy for results',
  })
  @IsOptional()
  @IsIn(['cost', 'speed', 'score'])
  rankBy?: 'cost' | 'speed' | 'score' = 'score';
}

export class CompareQuotesResponseDto {
  fromChain: number;
  toChain: number;
  token: string;
  amount: string;
  fetchedAt: string;
  quotes: NormalizedQuoteDto[];
}

export class NormalizedQuoteDto {
  bridgeName: string;
  totalFeeUSD: number;
  feeToken: string;
  estimatedArrivalTime: number;
  outputAmount: string;
  score?: number;
  supported: boolean;
  error?: string;
}
