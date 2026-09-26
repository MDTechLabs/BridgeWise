import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StellarEcosystemMetricsService } from './stellar-ecosystem-metrics.service';
import { StellarEcosystemMetricsController } from './stellar-ecosystem-metrics.controller';
import { BridgeAnalytics } from '../../../analytics/entities/bridge-analytics.entity';

/**
 * Stellar Ecosystem Metrics Module
 *
 * Provides ecosystem-wide metrics collection and reporting for Stellar/Soroban bridges.
 */
@Module({
  imports: [TypeOrmModule.forFeature([BridgeAnalytics])],
  controllers: [StellarEcosystemMetricsController],
  providers: [StellarEcosystemMetricsService],
  exports: [StellarEcosystemMetricsService],
})
export class StellarEcosystemMetricsModule {}
