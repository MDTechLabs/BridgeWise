import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SorobanLifecycleService } from './soroban-lifecycle.service';
import {
  LifecycleAnalyticsQueryDto,
  LifecycleAnalyticsReportDto,
  LifecycleEventDto,
  RecordLifecycleEventDto,
  TransferLifecycleHistoryDto,
} from './dto/lifecycle-analytics.dto';

/**
 * SorobanLifecycleController
 *
 * REST API for Soroban transfer lifecycle analytics.
 * Provides event recording, per-transfer history, and aggregate reports
 * with bottleneck identification.
 *
 * Base path: /api/v1/analytics/lifecycle/stellar
 */
@ApiTags('Soroban Transfer Lifecycle Analytics')
@Controller('api/v1/analytics/lifecycle/stellar')
export class SorobanLifecycleController {
  constructor(private readonly lifecycleService: SorobanLifecycleService) {}

  /**
   * POST /api/v1/analytics/lifecycle/stellar/events
   *
   * Record a single lifecycle stage event for a transfer.
   * Called by bridge adapters as each stage completes.
   */
  @Post('events')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Record a lifecycle stage event',
    description:
      'Records a single stage transition for a Soroban transfer. ' +
      'Automatically computes the duration from the previous stage.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Lifecycle event recorded successfully',
    type: LifecycleEventDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid request payload',
  })
  async recordEvent(
    @Body() dto: RecordLifecycleEventDto,
  ): Promise<LifecycleEventDto> {
    const entity = await this.lifecycleService.recordEventFromDto(dto);
    return {
      id: entity.id,
      transferId: entity.transferId,
      stage: entity.stage,
      sourceChain: entity.sourceChain,
      destinationChain: entity.destinationChain,
      asset: entity.asset,
      bridgeName: entity.bridgeName,
      durationFromPreviousMs: entity.durationFromPreviousMs
        ? Number(entity.durationFromPreviousMs)
        : null,
      outcome: entity.outcome,
      errorMessage: entity.errorMessage,
      metadata: entity.metadata,
      recordedAt: entity.recordedAt,
    };
  }

  /**
   * GET /api/v1/analytics/lifecycle/stellar/transfers/:transferId
   *
   * Retrieve the full ordered event history for a single transfer.
   */
  @Get('transfers/:transferId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get lifecycle history for a transfer',
    description:
      'Returns all recorded lifecycle events for the specified transfer in chronological order, ' +
      'including per-stage durations and final outcome.',
  })
  @ApiParam({
    name: 'transferId',
    description: 'UUID of the transfer',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transfer lifecycle history',
    type: TransferLifecycleHistoryDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No events found for the given transferId',
  })
  async getTransferHistory(
    @Param('transferId', ParseUUIDPipe) transferId: string,
  ): Promise<TransferLifecycleHistoryDto> {
    return this.lifecycleService.getTransferHistory(transferId);
  }

  /**
   * GET /api/v1/analytics/lifecycle/stellar/report
   *
   * Generate an aggregate analytics report with bottleneck identification.
   */
  @Get('report')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate lifecycle analytics report',
    description:
      'Aggregates all lifecycle events matching the query filters into a full analytics report. ' +
      'Includes per-stage statistics (avg/median/p95 durations, failure rates) and ranked bottlenecks.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lifecycle analytics report',
    type: LifecycleAnalyticsReportDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid query parameters',
  })
  async getAnalyticsReport(
    @Query() query: LifecycleAnalyticsQueryDto,
  ): Promise<LifecycleAnalyticsReportDto> {
    return this.lifecycleService.getAnalyticsReport(query);
  }

  /**
   * GET /api/v1/analytics/lifecycle/stellar/report/bottlenecks
   *
   * Returns only the bottleneck summary from the analytics report — useful for
   * alerting and lightweight polling without the full stage breakdown.
   */
  @Get('report/bottlenecks')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get bottleneck summary',
    description:
      'Returns identified bottleneck stages ranked by severity, without the full per-stage detail.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Bottleneck summary',
  })
  async getBottlenecks(
    @Query() query: LifecycleAnalyticsQueryDto,
  ): Promise<{ bottlenecks: LifecycleAnalyticsReportDto['bottlenecks']; generatedAt: Date }> {
    const report = await this.lifecycleService.getAnalyticsReport(query);
    return {
      bottlenecks: report.bottlenecks,
      generatedAt: report.generatedAt,
    };
  }
}
