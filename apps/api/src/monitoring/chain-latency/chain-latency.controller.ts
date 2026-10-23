import { Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ChainLatencyService } from './chain-latency.service';
import { ChainLatencyQueryDto } from './chain-latency-query.dto';
import { ChainLatencyDashboard, LatencyDashboardOverview } from './chain-latency.types';

/**
 * Read-only per-chain latency dashboards. Samples are recorded internally via
 * ChainLatencyService; there is intentionally no public write endpoint.
 */
@ApiTags('Chain Latency')
@Controller('monitoring/chain-latency')
export class ChainLatencyController {
  constructor(private readonly latency: ChainLatencyService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Latency overview across all chains',
    description: 'Per-chain percentiles, error rate and health status, worst status first.',
  })
  @ApiResponse({ status: 200, description: 'Overview returned' })
  getOverview(@Query() query: ChainLatencyQueryDto): LatencyDashboardOverview {
    return this.latency.getOverview(query.windowMs);
  }

  @Get(':chain')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Latency dashboard for one chain',
    description: 'Percentiles, histogram, time series and per-operation breakdown.',
  })
  @ApiParam({ name: 'chain', example: 'stellar' })
  @ApiResponse({ status: 200, description: 'Dashboard returned' })
  @ApiResponse({ status: 400, description: 'Invalid chain identifier or query' })
  @ApiResponse({ status: 404, description: 'Chain has no recorded latency data' })
  getChain(
    @Param('chain') chain: string,
    @Query() query: ChainLatencyQueryDto,
  ): ChainLatencyDashboard {
    const id = this.latency.normalizeChain(chain);
    if (!this.latency.getTrackedChains().includes(id)) {
      throw new NotFoundException(`No latency data recorded for chain "${id}"`);
    }
    return this.latency.getChainDashboard(id, query.windowMs, query.buckets);
  }
}
