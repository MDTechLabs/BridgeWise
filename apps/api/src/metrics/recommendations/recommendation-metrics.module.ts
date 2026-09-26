import { Module } from '@nestjs/common';
import { RecommendationMetricsController } from './recommendation-metrics.controller';
import { RecommendationMetricsService } from '../../../../../src/api/metrics/recommendations';

/**
 * Soroban Route Recommendation Metrics API module (#613).
 *
 * Wires the pure {@link RecommendationMetricsService} into a NestJS
 * controller exposing metrics and ranking statistics endpoints.
 */
@Module({
  controllers: [RecommendationMetricsController],
  providers: [RecommendationMetricsService],
  exports: [RecommendationMetricsService],
})
export class RecommendationMetricsModule {}