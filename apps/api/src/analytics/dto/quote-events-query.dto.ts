import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/pagination';
import { QuoteEventType } from '../abandonment-tracking.service';

/**
 * Query for the paginated quote events listing
 */
export class QuoteEventsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Start date (ISO string)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO string)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by event type',
    enum: QuoteEventType,
  })
  @IsOptional()
  @IsEnum(QuoteEventType)
  eventType?: QuoteEventType;
}
