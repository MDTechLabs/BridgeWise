import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  Min,
  Max,
  IsPositive,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { RankingMode, SupportedChain } from '../enums';

export class GetQuotesDto {
  @ApiProperty({ description: 'Source blockchain', enum: SupportedChain, example: 'stellar' })
  @IsString()
  @IsNotEmpty()
  sourceChain: string;

  @ApiProperty({ description: 'Destination blockchain', enum: SupportedChain, example: 'ethereum' })
  @IsString()
  @IsNotEmpty()
  destinationChain: string;

  @ApiProperty({ description: 'Source token symbol', example: 'USDC' })
  @IsString()
  @IsNotEmpty()
  sourceToken: string;

  @ApiPropertyOptional({ description: 'Destination token symbol (defaults to sourceToken)', example: 'USDC' })
  @IsOptional()
  @IsString()
  destinationToken?: string;

  @ApiProperty({ description: 'Amount to bridge', example: 100 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Min(0.000001)
  amount: number;

  @ApiPropertyOptional({ description: 'Ranking mode for route comparison', enum: RankingMode, default: RankingMode.BALANCED })
  @IsOptional()
  @IsEnum(RankingMode)
  rankingMode?: RankingMode = RankingMode.BALANCED;

  @ApiPropertyOptional({ description: 'Max acceptable slippage %', example: 0.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  slippageTolerance?: number;
}

export class RouteSelectDto {
  @ApiProperty({ description: 'Bridge provider ID' })
  @IsString()
  @IsNotEmpty()
  bridgeId: string;

  @ApiProperty({ description: 'Source chain' })
  @IsString()
  @IsNotEmpty()
  sourceChain: string;

  @ApiProperty({ description: 'Destination chain' })
  @IsString()
  @IsNotEmpty()
  destinationChain: string;

  @ApiProperty({ description: 'Source token' })
  @IsString()
  @IsNotEmpty()
  sourceToken: string;

  @ApiProperty({ description: 'Input amount' })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;
}
