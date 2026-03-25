import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BridgeReliabilityService } from './bridge-reliability.service';
import {
  BridgeReliabilityResponseDto,
  GetReliabilityDto,
  RecordBridgeEventDto,
  ReliabilityRankingFactorDto,
} from './reliability.dto';
import { BridgeReliabilityMetric } from './bridge-reliability-metric.entity';

@ApiTags('Bridge Reliability')
@Controller('bridge-reliability')
export class BridgeReliabilityController {
  constructor(private readonly reliabilityService: BridgeReliabilityService) {}

  /**
   * Record a bridge transaction outcome (called internally by bridge adapters).
   */
  @Post('events')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a bridge transaction outcome' })
  @ApiBody({ type: RecordBridgeEventDto })
  async recordEvent(@Body() dto: RecordBridgeEventDto) {
    return this.reliabilityService.recordEvent(dto);
  }

  /**
   * Get reliability score for a specific bridge route.
   */
  @Get()
  @ApiOperation({ summary: 'Get reliability score for a bridge route' })
  @ApiOkResponse({ type: BridgeReliabilityResponseDto })
  async getReliability(
    @Query() dto: GetReliabilityDto,
  ): Promise<BridgeReliabilityResponseDto> {
    return this.reliabilityService.getReliability(dto);
  }

  /**
   * Get all cached reliability metrics (for admin / ranking engine).
   */
  @Get('all')
  @ApiOperation({ summary: 'List all bridge reliability metrics (admin)' })
  async getAllMetrics(): Promise<BridgeReliabilityMetric[]> {
    return this.reliabilityService.getAllMetrics();
  }

  /**
   * Get ranking adjustment factors for all bridges on a route.
   * Called by Smart Bridge Ranking engine (Issue #5).
   */
  @Get('ranking-factors')
  @ApiOperation({
    summary: 'Get reliability ranking factors for a route',
    description:
      'Returns reliability-adjusted scores for all bridges on a route.',
  })
  async getRankingFactors(
    @Query('sourceChain') sourceChain: string,
    @Query('destinationChain') destinationChain: string,
    @Query('threshold') threshold?: number,
    @Query('ignoreReliability') ignoreReliability?: boolean,
  ): Promise<ReliabilityRankingFactorDto[]> {
    return this.reliabilityService.getBulkReliabilityFactors(
      sourceChain,
      destinationChain,
      { threshold, ignoreReliability },
    );
  }
}
