import {
  Controller,
  Get,
  Query,
  Param,
  ParseEnumPipe,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import {
  BridgeAnalyticsQueryDto,
  BridgeAnalyticsResponseDto,
  RouteAnalyticsDto,
  TimeSeriesAnalyticsDto,
  TopPerformingBridgesDto,
  SlippageStatisticsDto,
  UserActivityInsightsDto,
} from './dto/bridge-analytics.dto';

/**
 * Analytics Controller
 *
 * REST API endpoints for BridgeWise analytics data.
 * Provides metrics on bridge usage, performance, and trends.
 */
@ApiTags('Bridge Analytics')
@Controller('api/v1/bridge-analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Get aggregated analytics data with optional filters
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get bridge analytics data',
    description:
      'Returns aggregated analytics metrics for bridge routes with optional filtering by bridge, chain, token, and time range.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Analytics data retrieved successfully',
    type: BridgeAnalyticsResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid query parameters',
  })
  async getAnalytics(
    @Query() query: BridgeAnalyticsQueryDto,
  ): Promise<BridgeAnalyticsResponseDto> {
    return this.analyticsService.getAnalytics(query);
  }

  /**
   * Get analytics for a specific route
   */
  @Get('routes/:bridgeName/:sourceChain/:destinationChain')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get analytics for a specific route',
    description: 'Returns detailed analytics for a specific bridge route.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Route analytics retrieved successfully',
    type: RouteAnalyticsDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Route analytics not found',
  })
  @ApiQuery({
    name: 'token',
    required: false,
    description: 'Filter by token symbol',
  })
  async getRouteAnalytics(
    @Param('bridgeName') bridgeName: string,
    @Param('sourceChain') sourceChain: string,
    @Param('destinationChain') destinationChain: string,
    @Query('token') token?: string,
  ): Promise<RouteAnalyticsDto> {
    const analytics = await this.analyticsService.getRouteAnalytics(
      bridgeName,
      sourceChain,
      destinationChain,
      token,
    );

    if (!analytics) {
      // Return empty analytics for new routes
      return {
        bridgeName,
        sourceChain,
        destinationChain,
        token,
        totalTransfers: 0,
        successfulTransfers: 0,
        failedTransfers: 0,
        successRate: 0,
        failureRate: 0,
        totalVolume: 0,
        lastUpdated: new Date(),
      };
    }

    return analytics;
  }

  /**
   * Get time-series analytics data for trend analysis
   */
  @Get('trends/:bridgeName/:sourceChain/:destinationChain')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get time-series analytics trends',
    description: 'Returns time-series data for analyzing trends over time.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Trend data retrieved successfully',
    type: TimeSeriesAnalyticsDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid parameters',
  })
  @ApiQuery({
    name: 'granularity',
    required: true,
    enum: ['hour', 'day', 'week', 'month'],
    description: 'Time granularity for data points',
  })
  @ApiQuery({
    name: 'startDate',
    required: true,
    description: 'Start date (ISO 8601)',
  })
  @ApiQuery({
    name: 'endDate',
    required: true,
    description: 'End date (ISO 8601)',
  })
  @ApiQuery({
    name: 'token',
    required: false,
    description: 'Filter by token symbol',
  })
  async getTimeSeriesAnalytics(
    @Param('bridgeName') bridgeName: string,
    @Param('sourceChain') sourceChain: string,
    @Param('destinationChain') destinationChain: string,
    @Query(
      'granularity',
      new ParseEnumPipe(['hour', 'day', 'week', 'month'] as const),
    )
    granularity: 'hour' | 'day' | 'week' | 'month',
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('token') token?: string,
  ): Promise<TimeSeriesAnalyticsDto> {
    return this.analyticsService.getTimeSeriesAnalytics(
      bridgeName,
      sourceChain,
      destinationChain,
      granularity,
      new Date(startDate),
      new Date(endDate),
      token,
    );
  }

  /**
   * Get top performing bridges
   */
  @Get('top-performing')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get top performing bridges',
    description:
      'Returns top bridges ranked by volume, success rate, and speed.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Top performing bridges retrieved successfully',
    type: TopPerformingBridgesDto,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of results per category (default: 10)',
  })
  async getTopPerformingBridges(
    @Query('limit') limit?: string,
  ): Promise<TopPerformingBridgesDto> {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.analyticsService.getTopPerformingBridges(limitNum);
  }

  /**
   * Get slippage statistics for a route
   */
  @Get('slippage/:bridgeName/:sourceChain/:destinationChain')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get slippage statistics',
    description: 'Returns slippage distribution and statistics for a route.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Slippage statistics retrieved successfully',
    type: SlippageStatisticsDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No slippage data available',
  })
  @ApiQuery({
    name: 'token',
    required: false,
    description: 'Filter by token symbol',
  })
  async getSlippageStatistics(
    @Param('bridgeName') bridgeName: string,
    @Param('sourceChain') sourceChain: string,
    @Param('destinationChain') destinationChain: string,
    @Query('token') token?: string,
  ): Promise<SlippageStatisticsDto | { message: string }> {
    const stats = await this.analyticsService.getSlippageStatistics(
      bridgeName,
      sourceChain,
      destinationChain,
      token,
    );

    if (!stats) {
      return { message: 'No slippage data available for this route' };
    }

    return stats;
  }

  /**
   * Get user activity insights
   */
  @Get('insights/user-activity')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get user activity insights',
    description: 'Returns aggregated user activity metrics and popular routes.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User activity insights retrieved successfully',
    type: UserActivityInsightsDto,
  })
  async getUserActivityInsights(): Promise<UserActivityInsightsDto> {
    return this.analyticsService.getUserActivityInsights();
  }

  /**
   * Trigger analytics recalculation
   * Useful for initial setup or data correction
   */
  @Get('admin/recalculate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recalculate all analytics',
    description: 'Recalculates all analytics from raw data. Use with caution.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Analytics recalculation started',
  })
  async recalculateAnalytics(): Promise<{ message: string }> {
    await this.analyticsService.recalculateAllAnalytics();
    return { message: 'Analytics recalculation completed successfully' };
  }
}
