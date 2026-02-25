import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsCollector } from './analytics.collector';
import { BridgeAnalytics } from './entities/bridge-analytics.entity';

/**
 * Analytics Module
 *
 * Provides analytics functionality for BridgeWise including:
 * - Aggregated metrics for bridge routes
 * - Time-series data for trend analysis
 * - Real-time data collection from transactions
 * - REST API endpoints for analytics data
 */
@Module({
  imports: [TypeOrmModule.forFeature([BridgeAnalytics])],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsCollector],
  exports: [AnalyticsService, AnalyticsCollector],
})
export class AnalyticsModule {}
