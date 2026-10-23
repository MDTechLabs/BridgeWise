import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/pagination';
import { ACTOR_PATTERN, MAX_NOTE_LENGTH, SUBJECT_ID_PATTERN } from './review-flag.constants';
import {
  FLAG_REASONS,
  FLAG_SEVERITIES,
  FLAG_STATUSES,
  FlagReason,
  FlagSeverity,
  FlagStatus,
  FlagSubjectType,
  SUBJECT_TYPES,
} from './review-flag.types';

export class CreateReviewFlagDto {
  @ApiProperty({ enum: SUBJECT_TYPES })
  @IsIn(SUBJECT_TYPES)
  subjectType!: FlagSubjectType;

  @ApiProperty({ example: 'tx-100' })
  @IsString()
  @Matches(SUBJECT_ID_PATTERN)
  subjectId!: string;

  @ApiProperty({ enum: FLAG_REASONS })
  @IsIn(FLAG_REASONS)
  reason!: FlagReason;

  @ApiProperty({ enum: FLAG_SEVERITIES })
  @IsIn(FLAG_SEVERITIES)
  severity!: FlagSeverity;

  @ApiPropertyOptional({ maxLength: MAX_NOTE_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTE_LENGTH)
  note?: string;

  @ApiProperty({ description: 'Identifier of the person or service raising the flag' })
  @IsString()
  @Matches(ACTOR_PATTERN)
  createdBy!: string;
}

export class UpdateReviewFlagStatusDto {
  @ApiProperty({ enum: FLAG_STATUSES })
  @IsIn(FLAG_STATUSES)
  status!: FlagStatus;

  @ApiProperty({ description: 'Identifier of the reviewer making the change' })
  @IsString()
  @Matches(ACTOR_PATTERN)
  actor!: string;

  @ApiPropertyOptional({ maxLength: MAX_NOTE_LENGTH, description: 'Required for escalated / cleared' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTE_LENGTH)
  note?: string;
}

export class ListReviewFlagsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SUBJECT_TYPES })
  @IsOptional()
  @IsIn(SUBJECT_TYPES)
  subjectType?: FlagSubjectType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(SUBJECT_ID_PATTERN)
  subjectId?: string;

  @ApiPropertyOptional({ enum: FLAG_REASONS })
  @IsOptional()
  @IsIn(FLAG_REASONS)
  reason?: FlagReason;

  @ApiPropertyOptional({ enum: FLAG_SEVERITIES })
  @IsOptional()
  @IsIn(FLAG_SEVERITIES)
  severity?: FlagSeverity;

  @ApiPropertyOptional({ enum: FLAG_STATUSES })
  @IsOptional()
  @IsIn(FLAG_STATUSES)
  status?: FlagStatus;
}
