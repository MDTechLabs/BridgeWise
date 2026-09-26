import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RouteInsightsExporterService } from './route-insights-exporter.service';
import { RouteInsightsExporterController } from './route-insights-exporter.controller';
import { BridgeAnalytics } from '../../../analytics/entities/bridge-analytics.entity';
import { AnalyticsModule } from '../../../analytics/analytics.module';
import { CsvBuilderUtil } from '../../../Analytics-Export/csv-builder.util';

/**
 * Route Insights Exporter Module
 *
 * Provides functionality to export Stellar route analytics and recommendation insights.
 * Integrates with the Analytics module to fetch route metrics and applies recommendation
 * scoring to provide actionable insights for external consumption.
 *
 * Supports:
 * - CSV and JSON export formats
 * - Route metrics (transfers, fees, slippage, settlement times)
 * - Recommendation rankings and scoring
 * - Date range filtering
 * - Bridge/chain/token filtering
 */
@Module({
  imports: [TypeOrmModule.forFeature([BridgeAnalytics]), AnalyticsModule],
  controllers: [RouteInsightsExporterController],
  providers: [RouteInsightsExporterService, CsvBuilderUtil],
  exports: [RouteInsightsExporterService],
})
export class RouteInsightsExporterModule {}
