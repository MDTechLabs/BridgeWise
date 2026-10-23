/**
 * Abandonment Tracking Controller
 * 
 * REST API endpoints for quote abandonment metrics
 */

import {
  Controller,
  Get,
  Query,
  Param,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { AbandonmentTrackingService } from './abandonment-tracking.service';
import { QuoteEventsQueryDto } from './dto/quote-events-query.dto';

@ApiTags('Analytics - Abandonment')
@Controller('analytics/abandonment')
export class AbandonmentTrackingController {
  constructor(private readonly abandonmentService: AbandonmentTrackingService) {}

  @Get('metrics')
  @ApiOperation({
    summary: 'Get quote abandonment metrics',
    description: 'Returns abandonment rate and related metrics for a time period',
  })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (ISO string)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO string)' })
  @ApiQuery({ name: 'bridgeName', required: false, description: 'Filter by bridge name' })
  @ApiQuery({ name: 'sourceChain', required: false, description: 'Filter by source chain' })
  @ApiQuery({ name: 'destinationChain', required: false, description: 'Filter by destination chain' })
  @ApiQuery({ name: 'token', required: false, description: 'Filter by token' })
  @ApiQuery({ name: 'groupBy', required: false, description: 'Group by: bridge, sourceChain, destinationChain, token' })
  @ApiResponse({ status: 200, description: 'Abandonment metrics retrieved' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getMetrics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('bridgeName') bridgeName?: string,
    @Query('sourceChain') sourceChain?: string,
    @Query('destinationChain') destinationChain?: string,
    @Query('token') token?: string,
    @Query('groupBy') groupBy?: 'bridge' | 'sourceChain' | 'destinationChain' | 'token' | 'none',
  ) {
    const metrics = this.abandonmentService.getAbandonmentMetrics({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      bridgeName,
      sourceChain,
      destinationChain,
      token,
      groupBy,
    });

    return metrics;
  }

  @Get('events')
  @ApiOperation({
    summary: 'Get quote events',
    description: 'Returns quote request and execution events for analysis',
  })
  @ApiResponse({ status: 200, description: 'Events retrieved' })
  async getEvents(@Query() query: QuoteEventsQueryDto) {
    const { items, pagination } = this.abandonmentService.getEventsPage(
      {
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        eventType: query.eventType,
      },
      { page: query.page, limit: query.limit },
    );

    return { events: items, count: items.length, pagination };
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get tracking statistics',
    description: 'Returns current tracking system statistics',
  })
  @ApiResponse({ status: 200, description: 'Statistics retrieved' })
  async getStats() {
    return this.abandonmentService.getStats();
  }
}