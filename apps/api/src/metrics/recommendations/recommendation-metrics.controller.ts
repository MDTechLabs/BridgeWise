import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import {
  RecommendationMetricsService,
  USER_PREFERENCES,
} from '../../../../../src/api/metrics/recommendations';
import type {
  RankingStatistics,
  RecommendationFilter,
  RecommendationInput,
  RecommendationMetrics,
  RouteMetrics,
  UserPreference,
} from '../../../../../src/api/metrics/recommendations';

/**
 * Soroban Route Recommendation Metrics API (#613).
 *
 * Exposes ranking statistics and per-route metrics for consumers that need
 * to evaluate recommendation quality. The pure service lives at
 * `src/api/metrics/recommendations/`; this controller wires it into Nest.
 */
@ApiTags('Recommendation Metrics')
@Controller('metrics/recommendations')
export class RecommendationMetricsController {
  constructor(private readonly metrics: RecommendationMetricsService) {}

  /**
   * Get a full recommendation-metrics snapshot.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get full recommendation metrics snapshot',
    description:
      'Returns aggregate metrics: totals, score distribution, unique bridge/route counts, and per-preference ranking statistics.',
  })
  @ApiResponse({ status: 200, description: 'Snapshot returned', type: Object })
  getSnapshot(): RecommendationMetrics {
    return this.metrics.snapshot();
  }

  /**
   * Get ranking statistics for one preference (or all if omitted).
   */
  @Get('ranking')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get ranking statistics for a preference',
    description:
      'Returns count, average score, top score, average fee/time/reliability for a single user preference.',
  })
  @ApiQuery({ name: 'preference', enum: USER_PREFERENCES, required: false })
  @ApiResponse({ status: 200, description: 'Ranking statistics returned' })
  getRanking(@Query('preference') preference?: string): RankingStatistics[] {
    if (preference === undefined) {
      return this.metrics.rankingStats();
    }
    if (!isUserPreference(preference)) {
      throw new BadRequestException(
        `Invalid preference "${preference}". Allowed: ${USER_PREFERENCES.join(', ')}`,
      );
    }
    return [this.metrics.rankingFor(preference)];
  }

  /**
   * Get ranking statistics (alias for the snapshot's per-preference block).
   */
  @Get('ranking-stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all ranking statistics',
    description: 'Returns per-preference ranking statistics in a single payload.',
  })
  @ApiResponse({ status: 200, description: 'Ranking statistics returned' })
  getRankingStats(): RankingStatistics[] {
    return this.metrics.rankingStats();
  }

  /**
   * List individual recommendations, filtered and limited.
   */
  @Get('recommendations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List recommendations with filters',
    description:
      'Returns individual recommendation rows that match the supplied filter. All query parameters are optional.',
  })
  @ApiQuery({ name: 'preference', enum: USER_PREFERENCES, required: false })
  @ApiQuery({ name: 'bridgeName', required: false })
  @ApiQuery({ name: 'sourceChain', required: false })
  @ApiQuery({ name: 'destinationChain', required: false })
  @ApiQuery({ name: 'minScore', type: Number, required: false })
  @ApiQuery({ name: 'maxScore', type: Number, required: false })
  @ApiQuery({ name: 'minFeeUsd', type: Number, required: false })
  @ApiQuery({ name: 'maxFeeUsd', type: Number, required: false })
  @ApiQuery({ name: 'minReliabilityScore', type: Number, required: false })
  @ApiQuery({ name: 'maxEstimatedTimeSeconds', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiResponse({ status: 200, description: 'Matching recommendations returned' })
  listRecommendations(
    @Query('preference') preference?: string,
    @Query('bridgeName') bridgeName?: string,
    @Query('sourceChain') sourceChain?: string,
    @Query('destinationChain') destinationChain?: string,
    @Query('minScore') minScore?: string,
    @Query('maxScore') maxScore?: string,
    @Query('minFeeUsd') minFeeUsd?: string,
    @Query('maxFeeUsd') maxFeeUsd?: string,
    @Query('minReliabilityScore') minReliabilityScore?: string,
    @Query('maxEstimatedTimeSeconds') maxEstimatedTimeSeconds?: string,
    @Query('limit') limit?: string,
  ): { count: number; results: RouteMetrics[] } {
    const filter = buildFilter({
      preference,
      bridgeName,
      sourceChain,
      destinationChain,
      minScore,
      maxScore,
      minFeeUsd,
      maxFeeUsd,
      minReliabilityScore,
      maxEstimatedTimeSeconds,
      limit,
    });
    const results = this.metrics.listRecommendations(filter);
    return { count: results.length, results };
  }

  /**
   * Get a single recommendation by its id.
   */
  @Get('recommendations/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a single recommendation by id',
    description: 'Returns the recommendation row for the given id, or 404 when not present.',
  })
  @ApiResponse({ status: 200, description: 'Recommendation found' })
  @ApiResponse({ status: 404, description: 'Recommendation not found' })
  getOne(@Param('id') id: string): RouteMetrics | null {
    const found = this.metrics.getById(id);
    if (!found) {
      throw new NotFoundException(`Recommendation "${id}" not found`);
    }
    return found;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isUserPreference(value: string): value is UserPreference {
  return (USER_PREFERENCES as readonly string[]).includes(value);
}

function buildFilter(raw: {
  preference?: string;
  bridgeName?: string;
  sourceChain?: string;
  destinationChain?: string;
  minScore?: string;
  maxScore?: string;
  minFeeUsd?: string;
  maxFeeUsd?: string;
  minReliabilityScore?: string;
  maxEstimatedTimeSeconds?: string;
  limit?: string;
}): RecommendationFilter {
  const filter: RecommendationFilter = {};
  if (raw.preference) {
    const parts = raw.preference.split(',').map((p) => p.trim());
    const valid = parts.filter(isUserPreference);
    if (valid.length === 0) {
      throw new BadRequestException(
        `Invalid preference "${raw.preference}". Allowed: ${USER_PREFERENCES.join(', ')}`,
      );
    }
    filter.preference = valid.length === 1 ? valid[0] : (valid as UserPreference[]);
  }
  if (raw.bridgeName) filter.bridgeName = raw.bridgeName;
  if (raw.sourceChain) filter.sourceChain = raw.sourceChain;
  if (raw.destinationChain) filter.destinationChain = raw.destinationChain;
  if (raw.minScore) filter.minScore = parseFloatStrict(raw.minScore, 'minScore');
  if (raw.maxScore) filter.maxScore = parseFloatStrict(raw.maxScore, 'maxScore');
  if (raw.minFeeUsd) filter.minFeeUsd = parseFloatStrict(raw.minFeeUsd, 'minFeeUsd');
  if (raw.maxFeeUsd) filter.maxFeeUsd = parseFloatStrict(raw.maxFeeUsd, 'maxFeeUsd');
  if (raw.minReliabilityScore)
    filter.minReliabilityScore = parseFloatStrict(raw.minReliabilityScore, 'minReliabilityScore');
  if (raw.maxEstimatedTimeSeconds)
    filter.maxEstimatedTimeSeconds = parseFloatStrict(
      raw.maxEstimatedTimeSeconds,
      'maxEstimatedTimeSeconds',
    );
  if (raw.limit) filter.limit = parseIntStrict(raw.limit, 'limit');
  return filter;
}

function parseFloatStrict(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new BadRequestException(`Query parameter "${name}" must be a number, got "${value}"`);
  }
  return parsed;
}

function parseIntStrict(value: string, name: string): number {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new BadRequestException(`Query parameter "${name}" must be an integer, got "${value}"`);
  }
  return parsed;
}

// Re-export the public types so consumers can import from one place.
export type {
  RankingStatistics,
  RecommendationFilter,
  RecommendationInput,
  RecommendationMetrics,
  RouteMetrics,
  UserPreference,
};