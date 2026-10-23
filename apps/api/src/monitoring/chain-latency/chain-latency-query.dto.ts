import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  DEFAULT_SERIES_BUCKETS,
  DEFAULT_WINDOW_MS,
  MAX_SERIES_BUCKETS,
  MAX_WINDOW_MS,
  MIN_WINDOW_MS,
} from './chain-latency.constants';

export class ChainLatencyQueryDto {
  @ApiPropertyOptional({
    description: 'Look-back window in milliseconds',
    default: DEFAULT_WINDOW_MS,
    minimum: MIN_WINDOW_MS,
    maximum: MAX_WINDOW_MS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_WINDOW_MS)
  @Max(MAX_WINDOW_MS)
  windowMs?: number;

  @ApiPropertyOptional({
    description: 'Number of time-series buckets (single-chain dashboard only)',
    default: DEFAULT_SERIES_BUCKETS,
    minimum: 1,
    maximum: MAX_SERIES_BUCKETS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SERIES_BUCKETS)
  buckets?: number;
}
