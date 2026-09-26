import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, FindOptionsWhere } from 'typeorm';
import { BridgeAnalytics } from '../../../analytics/entities/bridge-analytics.entity';
import {
  StellarTransferMetrics,
  StellarProviderMetrics,
  StellarEcosystemSummary,
} from './stellar-ecosystem-metrics.types';
import { getAllChains } from '../../../config/chains.config';

/**
 * Stellar Ecosystem Metrics Service
 *
 * Collects and aggregates Stellar/Soroban ecosystem-wide metrics including:
 * - Transfer metrics (volume, success rate, etc.)
 * - Provider metrics (per-bridge performance)
 * - Ecosystem summaries
 */
@Injectable()
export class StellarEcosystemMetricsService {
  private readonly logger = new Logger(StellarEcosystemMetricsService.name);

  constructor(
    @InjectRepository(BridgeAnalytics)
    private readonly analyticsRepository: Repository<BridgeAnalytics>,
  ) {}

  /**
   * Get Stellar chain IDs from config
   */
  private getStellarChainIds(): string[] {
    return getAllChains()
      .filter((chain) => chain.type === 'Stellar')
      .map((chain) => chain.id.toLowerCase());
  }

  /**
   * Get all Stellar-related routes from analytics
   */
  private async getStellarRoutes(
    startDate?: Date,
    endDate?: Date,
  ): Promise<BridgeAnalytics[]> {
    const stellarChains = this.getStellarChainIds();
    if (stellarChains.length === 0) {
      return [];
    }

    const whereConditions: FindOptionsWhere<BridgeAnalytics>[] = [];
    const configCaseIds = getAllChains()
      .filter((chain) => chain.type === 'Stellar')
      .map((chain) => chain.id);

    const buildCondition = (base: FindOptionsWhere<BridgeAnalytics>) => {
      const cond = { ...base };
      if (startDate && endDate) {
        cond.lastUpdated = Between(startDate, endDate);
      }
      return cond;
    };

    whereConditions.push(buildCondition({ sourceChain: In(configCaseIds) }));
    whereConditions.push(buildCondition({ destinationChain: In(configCaseIds) }));

    return this.analyticsRepository.find({
      where: whereConditions,
    });
  }

  /**
   * Collect overall transfer metrics
   */
  async collectTransferMetrics(
    startDate?: Date,
    endDate?: Date,
  ): Promise<StellarTransferMetrics> {
    const routes = await this.getStellarRoutes(startDate, endDate);

    let totalTransfers = 0;
    let totalVolume = 0;
    let successfulTransfers = 0;
    let failedTransfers = 0;
    let sumWeightedSettlement = 0;
    let sumWeightedFee = 0;
    let sumWeightedSlippage = 0;
    let totalSuccessForSettlement = 0;
    let totalTransfersForFee = 0;
    let totalTransfersForSlippage = 0;

    for (const route of routes) {
      totalTransfers += route.totalTransfers;
      totalVolume += Number(route.totalVolume) || 0;
      successfulTransfers += route.successfulTransfers;
      failedTransfers += route.failedTransfers;

      if (route.averageSettlementTimeMs !== null) {
        sumWeightedSettlement +=
          Number(route.averageSettlementTimeMs) * route.successfulTransfers;
        totalSuccessForSettlement += route.successfulTransfers;
      }

      if (route.averageFee !== null) {
        sumWeightedFee += Number(route.averageFee) * route.totalTransfers;
        totalTransfersForFee += route.totalTransfers;
      }

      if (route.averageSlippagePercent !== null) {
        sumWeightedSlippage +=
          Number(route.averageSlippagePercent) * route.totalTransfers;
        totalTransfersForSlippage += route.totalTransfers;
      }
    }

    return {
      totalTransfers,
      totalVolume: Number(totalVolume.toFixed(10)),
      successfulTransfers,
      failedTransfers,
      successRate:
        totalTransfers > 0
          ? Number(((successfulTransfers / totalTransfers) * 100).toFixed(4))
          : 0,
      averageSettlementTimeMs:
        totalSuccessForSettlement > 0
          ? Math.round(sumWeightedSettlement / totalSuccessForSettlement)
          : null,
      averageFee:
        totalTransfersForFee > 0
          ? Number((sumWeightedFee / totalTransfersForFee).toFixed(10))
          : null,
      averageSlippagePercent:
        totalTransfersForSlippage > 0
          ? Number((sumWeightedSlippage / totalTransfersForSlippage).toFixed(4))
          : null,
    };
  }

  /**
   * Collect provider metrics
   */
  async collectProviderMetrics(
    startDate?: Date,
    endDate?: Date,
  ): Promise<StellarProviderMetrics[]> {
    const routes = await this.getStellarRoutes(startDate, endDate);

    const providerMap = new Map<string, StellarProviderMetrics>();

    for (const route of routes) {
      const existing = providerMap.get(route.bridgeName) || {
        providerName: route.bridgeName,
        totalTransfers: 0,
        totalVolume: 0,
        successfulTransfers: 0,
        failedTransfers: 0,
        successRate: 0,
        averageSettlementTimeMs: null,
        averageFee: null,
        routeCount: 0,
      };

      existing.totalTransfers += route.totalTransfers;
      existing.totalVolume += Number(route.totalVolume) || 0;
      existing.successfulTransfers += route.successfulTransfers;
      existing.failedTransfers += route.failedTransfers;
      existing.routeCount += 1;

      providerMap.set(route.bridgeName, existing);
    }

    // Calculate success rates and weighted averages
    for (const [providerName, metrics] of providerMap) {
      const providerRoutes = routes.filter(
        (route) => route.bridgeName === providerName,
      );

      metrics.successRate =
        metrics.totalTransfers > 0
          ? Number(
              ((metrics.successfulTransfers / metrics.totalTransfers) * 100).toFixed(
                4,
              ),
            )
          : 0;

      let sumSettlement = 0;
      let countSettlement = 0;
      let sumFee = 0;
      let countFee = 0;

      for (const route of providerRoutes) {
        if (route.averageSettlementTimeMs !== null) {
          sumSettlement +=
            Number(route.averageSettlementTimeMs) * route.successfulTransfers;
          countSettlement += route.successfulTransfers;
        }
        if (route.averageFee !== null) {
          sumFee += Number(route.averageFee) * route.totalTransfers;
          countFee += route.totalTransfers;
        }
      }

      metrics.averageSettlementTimeMs =
        countSettlement > 0 ? Math.round(sumSettlement / countSettlement) : null;
      metrics.averageFee =
        countFee > 0 ? Number((sumFee / countFee).toFixed(10)) : null;
    }

    return Array.from(providerMap.values()).sort(
      (a, b) => b.totalVolume - a.totalVolume,
    );
  }

  /**
   * Generate full ecosystem summary
   */
  async generateEcosystemSummary(
    options: { startDate?: Date; endDate?: Date } = {},
  ): Promise<StellarEcosystemSummary> {
    const { startDate, endDate = new Date() } = options;
    const routes = await this.getStellarRoutes(startDate, endDate);
    const overallMetrics = await this.collectTransferMetrics(startDate, endDate);
    const providerMetrics = await this.collectProviderMetrics(startDate, endDate);

    // Calculate top tokens
    const tokenMap = new Map<string, { totalTransfers: number; totalVolume: number }>();
    for (const route of routes) {
      const token = route.token || 'unknown';
      const existing = tokenMap.get(token) || { totalTransfers: 0, totalVolume: 0 };
      existing.totalTransfers += route.totalTransfers;
      existing.totalVolume += Number(route.totalVolume) || 0;
      tokenMap.set(token, existing);
    }

    const topTokens = Array.from(tokenMap.entries())
      .map(([token, data]) => ({
        token,
        totalTransfers: data.totalTransfers,
        totalVolume: Number(data.totalVolume.toFixed(10)),
      }))
      .sort((a, b) => b.totalVolume - a.totalVolume)
      .slice(0, 10);

    return {
      generatedAt: new Date(),
      periodStart: startDate || new Date(0),
      periodEnd: endDate,
      overall: overallMetrics,
      topProviders: providerMetrics.slice(0, 5),
      topTokens,
      activeRoutes: routes.length,
      uniqueTokens: tokenMap.size,
    };
  }
}
