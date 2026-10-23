import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PaginatedResult } from '../../common/pagination';
import { ComplianceAdminGuard } from './compliance-admin.guard';
import { CreateReviewFlagDto, ListReviewFlagsQueryDto, UpdateReviewFlagStatusDto } from './review-flag.dto';
import { ReviewFlagService } from './review-flag.service';
import { ReviewFlag } from './review-flag.types';

@ApiTags('Compliance Review Flags')
@ApiBearerAuth()
@UseGuards(ComplianceAdminGuard)
@Controller('compliance/review-flags')
export class ReviewFlagController {
  constructor(private readonly flags: ReviewFlagService) {}

  @Post()
  @ApiOperation({
    summary: 'Raise a compliance review flag',
    description:
      'Returns 201 for a new flag, or 200 with the existing flag when an active flag for the same subject and reason already exists.',
  })
  @ApiResponse({ status: 201, description: 'Flag created' })
  @ApiResponse({ status: 200, description: 'Active duplicate returned' })
  raise(@Body() dto: CreateReviewFlagDto, @Res({ passthrough: true }) res: Response): ReviewFlag {
    const { flag, created } = this.flags.raise({ ...dto, source: 'manual' });
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return flag;
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List review flags (paginated, newest first)' })
  list(@Query() query: ListReviewFlagsQueryDto): PaginatedResult<ReviewFlag> {
    const { page, limit, ...filter } = query;
    return this.flags.list(filter, { page, limit });
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a review flag with its audit history' })
  @ApiResponse({ status: 404, description: 'Flag not found' })
  get(@Param('id') id: string): ReviewFlag {
    return this.flags.get(id);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move a flag through the review workflow' })
  @ApiResponse({ status: 400, description: 'Note required for escalated / cleared' })
  @ApiResponse({ status: 404, description: 'Flag not found' })
  @ApiResponse({ status: 409, description: 'Transition not allowed' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateReviewFlagStatusDto): ReviewFlag {
    return this.flags.transition(id, dto.status, dto.actor, dto.note);
  }
}
