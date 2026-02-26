import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan, FindOptionsWhere } from 'typeorm';
import {
  BridgePerformanceMetric,
  TimeInterval,
} from './entities/bridge-performance-metric.entity';
import {
  BridgePerformanceMetricQueryDto,
  BridgePerformanceMetricResponseDto,
  BridgePerformanceMetricDto,
  HistoricalTrendsDto,
  BridgePerformanceComparisonResponseDto,
  BridgePerformanceComparisonDto,
} from './dto/bridge-performance-metric.dto';
import { BridgeBenchmark } from '../bridge-benchmark/entities/bridge-benchmark.entity';

/**
 * Performance Metric Service
 *
 * Manages historical performance metrics aggregation and retrieval.
 * Provides time-series data for trend analysis and bridge comparisons.
 */
@Injectable()
export class PerformanceMetricService {
  private readonly logger = new Logger(PerformanceMetricService.name);

  constructor(
    @InjectRepository(BridgePerformanceMetric)
    private readonly metricRepository: Repository<BridgePerformanceMetric>,
    @InjectRepository(BridgeBenchmark)
    private readonly benchmarkRepository: Repository<BridgeBenchmark>,
  ) {}

  /**
   * Get paginated performance metrics with optional filters
   */
  async getMetrics(
    query: BridgePerformanceMetricQueryDto,
  ): Promise<BridgePerformanceMetricResponseDto> {
    const where: FindOptionsWhere<BridgePerformanceMetric> = {
      timeInterval: query.timeInterval,
    };

    if (query.bridgeName) {
      where.bridgeName = query.bridgeName;
    }
    if (query.sourceChain) {
      where.sourceChain = query.sourceChain;
    }
    if (query.destinationChain) {
      where.destinationChain = query.destinationChain;
    }
    if (query.token) {
      where.token = query.token;
    }
    if (query.startDate && query.endDate) {
      where.timestamp = Between(
        new Date(query.startDate),
        new Date(query.endDate),
      );
    }

    const [data, total] = await this.metricRepository.findAndCount({
      where,
      order: { timestamp: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    const metrics: BridgePerformanceMetricDto[] = data.map((entity) =>
      this.mapToMetricDto(entity),
    );

    return {
      data: metrics,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
      timeInterval: query.timeInterval,
      generatedAt: new Date(),
    };
  }

  /**
   * Get historical trends for a specific route
   */
  async getHistoricalTrends(
    bridgeName: string,
    sourceChain: string,
    destinationChain: string,
    timeInterval: TimeInterval,
    startDate: Date,
    endDate: Date,
    token?: string,
  ): Promise<HistoricalTrendsDto> {
    const where: FindOptionsWhere<BridgePerformanceMetric> = {
      bridgeName,
      sourceChain,
      destinationChain,
      timeInterval,
      timestamp: Between(startDate, endDate),
    };

    if (token) {
      where.token = token;
    }

    const data = await this.metricRepository.find({
      where,
      order: { timestamp: 'ASC' },
    });

    const trends: BridgePerformanceMetricDto[] = data.map((entity) =>
      this.mapToMetricDto(entity),
    );

    return {
      bridgeName,
      sourceChain,
      destinationChain,
      token,
      timeInterval,
      trends,
      generatedAt: new Date(),
    };
  }

  /**
   * Compare performance across multiple bridges
   */
  async compareBridgePerformance(
    bridgeNames: string[],
    timeInterval: TimeInterval,
    startDate: Date,
    endDate: Date,
    sourceChain?: string,
    destinationChain?: string,
    token?: string,
  ): Promise<BridgePerformanceComparisonResponseDto> {
    const comparisons: BridgePerformanceComparisonDto[] = [];

    for (const bridgeName of bridgeNames) {
      const where: FindOptionsWhere<BridgePerformanceMetric> = {
        bridgeName,
        timeInterval,
        timestamp: Between(startDate, endDate),
      };

      if (sourceChain) where.sourceChain = sourceChain;
      if (destinationChain) where.destinationChain = destinationChain;
      if (token) where.token = token;

      const metrics = await this.metricRepository.find({ where });

      if (metrics.length === 0) continue;

      // Aggregate across all routes for this bridge
      const totalTransfers = metrics.reduce(
        (sum, m) => sum + m.totalTransfers,
        0,
      );
      const successfulTransfers = metrics.reduce(
        (sum, m) => sum + m.successfulTransfers,
        0,
      );

      const avgSuccessRate =
        totalTransfers > 0 ? (successfulTransfers / totalTransfers) * 100 : 0;

      const settlementTimes = metrics
        .filter((m) => m.averageSettlementTimeMs)
        .map((m) => m.averageSettlementTimeMs as number);
      const avgSettlementTimeMs =
        settlementTimes.length > 0
          ? settlementTimes.reduce((a, b) => a + b, 0) / settlementTimes.length
          : 0;

      const fees = metrics
        .filter((m) => m.averageFee)
        .map((m) => m.averageFee as number);
      const avgFee =
        fees.length > 0 ? fees.reduce((a, b) => a + b, 0) / fees.length : 0;

      const slippages = metrics
        .filter((m) => m.averageSlippagePercent)
        .map((m) => m.averageSlippagePercent as number);
      const avgSlippagePercent =
        slippages.length > 0
          ? slippages.reduce((a, b) => a + b, 0) / slippages.length
          : 0;

      const totalVolume = metrics.reduce((sum, m) => sum + m.totalVolume, 0);

      // Determine trend direction based on success rate changes
      const sortedByTime = [...metrics].sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
      );
      let trendDirection: 'improving' | 'declining' | 'stable' = 'stable';
      if (sortedByTime.length >= 2) {
        const firstHalf = sortedByTime.slice(0, Math.floor(sortedByTime.length / 2));
        const secondHalf = sortedByTime.slice(Math.floor(sortedByTime.length / 2));
        
        const firstRate = firstHalf.reduce((sum, m) => sum + m.successRate, 0) / firstHalf.length;
        const secondRate = secondHalf.reduce((sum, m) => sum + m.successRate, 0) / secondHalf.length;
        
        if (secondRate > firstRate + 2) trendDirection = 'improving';
        else if (secondRate < firstRate - 2) trendDirection = 'declining';
      }

      comparisons.push({
        bridgeName,
        sourceChain: sourceChain || 'all',
        destinationChain: destinationChain || 'all',
        timeInterval,
        dataPoints: metrics.length,
        avgSuccessRate,
        avgSettlementTimeMs,
        avgFee,
        avgSlippagePercent,
        totalVolume,
        totalTransfers,
        trendDirection,
      });
    }

    return {
      comparisons,
      timeInterval,
      startDate,
      endDate,
      generatedAt: new Date(),
    };
  }

  /**
   * Aggregate metrics for a specific time period
   */
  async aggregateMetrics(
    timeInterval: TimeInterval,
    date: Date,
    bridgeName?: string,
  ): Promise<{ processed: number; inserted: number }> {
    const { startTime, endTime } = this.getTimeRange(timeInterval, date);

    this.logger.log(
      `Aggregating ${timeInterval} metrics for ${date.toISOString()}${
        bridgeName ? ` (${bridgeName})` : ''
      }`,
    );

    // Build query for raw benchmark data
    let query = this.benchmarkRepository
      .createQueryBuilder('b')
      .where('b.created_at >= :startTime', { startTime })
      .andWhere('b.created_at < :endTime', { endTime });

    if (bridgeName) {
      query = query.andWhere('b.bridge_name = :bridgeName', { bridgeName });
    }

    const benchmarks = await query.getMany();

    if (benchmarks.length === 0) {
      this.logger.debug(`No benchmarks found for period`);
      return { processed: 0, inserted: 0 };
    }

    // Group by route
    const grouped = this.groupByRoute(benchmarks);
    let inserted = 0;

    for (const [key, group] of grouped.entries()) {
      const metric = this.calculateMetrics(group, timeInterval, startTime);
      
      // Check for existing metric
      const existing = await this.metricRepository.findOne({
        where: {
          bridgeName: metric.bridgeName,
          sourceChain: metric.sourceChain,
          destinationChain: metric.destinationChain,
          token: metric.token,
          timeInterval,
          timestamp: startTime,
        },
      });

      if (existing) {
        // Update existing
        Object.assign(existing, metric);
        await this.metricRepository.save(existing);
      } else {
        // Create new
        const entity = this.metricRepository.create(metric);
        await this.metricRepository.save(entity);
        inserted++;
      }
    }

    this.logger.log(
      `Aggregated ${benchmarks.length} benchmarks into ${inserted} metrics`,
    );
    return { processed: benchmarks.length, inserted };
  }

  /**
   * Run aggregation for all bridges for a date range
   */
  async aggregateDateRange(
    timeInterval: TimeInterval,
    startDate: Date,
    endDate: Date,
  ): Promise<{ processed: number; inserted: number }> {
    let totalProcessed = 0;
    let totalInserted = 0;

    const current = new Date(startDate);
    while (current < endDate) {
      const result = await this.aggregateMetrics(timeInterval, new Date(current));
      totalProcessed += result.processed;
      totalInserted += result.inserted;

      // Advance to next period
      switch (timeInterval) {
        case 'hourly':
          current.setHours(current.getHours() + 1);
          break;
        case 'daily':
          current.setDate(current.getDate() + 1);
          break;
        case 'weekly':
          current.setDate(current.getDate() + 7);
          break;
        case 'monthly':
          current.setMonth(current.getMonth() + 1);
          break;
      }
    }

    return { processed: totalProcessed, inserted: totalInserted };
  }

  /**
   * Get the latest aggregated metrics
   */
  async getLatestMetrics(
    timeInterval: TimeInterval,
    limit = 10,
  ): Promise<BridgePerformanceMetric[]> {
    return this.metricRepository.find({
      where: { timeInterval },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get metric summary for a route
   */
  async getMetricSummary(
    bridgeName: string,
    sourceChain: string,
    destinationChain: string,
    token?: string,
  ): Promise<{
    totalDataPoints: number;
    dateRange: { start: Date | null; end: Date | null };
    overallStats: {
      totalTransfers: number;
      avgSuccessRate: number;
      avgSettlementTimeMs: number;
      avgFee: number;
      avgSlippagePercent: number;
      totalVolume: number;
    };
  } | null> {
    const where: FindOptionsWhere<BridgePerformanceMetric> = {
      bridgeName,
      sourceChain,
      destinationChain,
    };
    if (token) where.token = token;

    const metrics = await this.metricRepository.find({ where });

    if (metrics.length === 0) return null;

    const timestamps = metrics.map((m) => m.timestamp);
    const totalTransfers = metrics.reduce((sum, m) => sum + m.totalTransfers, 0);
    const successfulTransfers = metrics.reduce(
      (sum, m) => sum + m.successfulTransfers,
      0,
    );

    const settlementTimes = metrics
      .filter((m) => m.averageSettlementTimeMs)
      .map((m) => m.averageSettlementTimeMs as number);
    const fees = metrics.filter((m) => m.averageFee).map((m) => m.averageFee as number);
    const slippages = metrics
      .filter((m) => m.averageSlippagePercent)
      .map((m) => m.averageSlippagePercent as number);

    return {
      totalDataPoints: metrics.length,
      dateRange: {
        start: new Date(Math.min(...timestamps.map((t) => t.getTime()))),
        end: new Date(Math.max(...timestamps.map((t) => t.getTime()))),
      },
      overallStats: {
        totalTransfers,
        avgSuccessRate:
          totalTransfers > 0 ? (successfulTransfers / totalTransfers) * 100 : 0,
        avgSettlementTimeMs:
          settlementTimes.length > 0
            ? settlementTimes.reduce((a, b) => a + b, 0) / settlementTimes.length
            : 0,
        avgFee:
          fees.length > 0 ? fees.reduce((a, b) => a + b, 0) / fees.length : 0,
        avgSlippagePercent:
          slippages.length > 0
            ? slippages.reduce((a, b) => a + b, 0) / slippages.length
            : 0,
        totalVolume: metrics.reduce((sum, m) => sum + m.totalVolume, 0),
      },
    };
  }

  /**
   * Delete old metrics to save storage
   */
  async pruneOldMetrics(
    timeInterval: TimeInterval,
    olderThan: Date,
  ): Promise<number> {
    const result = await this.metricRepository.delete({
      timeInterval,
      timestamp: LessThan(olderThan),
    });
    return result.affected || 0;
  }

  /**
   * Group benchmarks by route
   */
  private groupByRoute(
    benchmarks: BridgeBenchmark[],
  ): Map<string, BridgeBenchmark[]> {
    const grouped = new Map<string, BridgeBenchmark[]>();

    for (const benchmark of benchmarks) {
      const key = `${benchmark.bridgeName}:${benchmark.sourceChain}:${benchmark.destinationChain}:${benchmark.token || 'null'}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(benchmark);
    }

    return grouped;
  }

  /**
   * Calculate metrics from a group of benchmarks
   */
  private calculateMetrics(
    benchmarks: BridgeBenchmark[],
    timeInterval: TimeInterval,
    timestamp: Date,
  ): Partial<BridgePerformanceMetric> {
    const first = benchmarks[0];
    const totalTransfers = benchmarks.length;
    const successful = benchmarks.filter(
      (b) => b.status === 'confirmed',
    ).length;
    const failed = benchmarks.filter((b) => b.status === 'failed').length;

    // Settlement times
    const settlementTimes = benchmarks
      .filter((b) => b.durationMs && b.status === 'confirmed')
      .map((b) => b.durationMs as number);

    // Amounts for volume
    const amounts = benchmarks
      .filter((b) => b.amount)
      .map((b) => parseFloat(b.amount?.toString() || '0'));

    return {
      bridgeName: first.bridgeName,
      sourceChain: first.sourceChain,
      destinationChain: first.destinationChain,
      token: first.token,
      timeInterval,
      timestamp,
      totalTransfers,
      successfulTransfers: successful,
      failedTransfers: failed,
      averageSettlementTimeMs:
        settlementTimes.length > 0
          ? settlementTimes.reduce((a, b) => a + b, 0) / settlementTimes.length
          : null,
      minSettlementTimeMs:
        settlementTimes.length > 0 ? Math.min(...settlementTimes) : null,
      maxSettlementTimeMs:
        settlementTimes.length > 0 ? Math.max(...settlementTimes) : null,
      totalVolume: amounts.reduce((a, b) => a + b, 0),
      // Fees and slippage would come from additional data sources
      averageFee: null,
      minFee: null,
      maxFee: null,
      averageSlippagePercent: null,
      minSlippagePercent: null,
      maxSlippagePercent: null,
      totalFees: 0,
    };
  }

  /**
   * Get time range for a time interval
   */
  private getTimeRange(
    timeInterval: TimeInterval,
    date: Date,
  ): { startTime: Date; endTime: Date } {
    const start = new Date(date);
    const end = new Date(date);

    switch (timeInterval) {
      case 'hourly':
        start.setMinutes(0, 0, 0);
        end.setMinutes(0, 0, 0);
        end.setHours(end.getHours() + 1);
        break;
      case 'daily':
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() + 1);
        break;
      case 'weekly':
        // Start of week (Sunday)
        const dayOfWeek = start.getDay();
        start.setDate(start.getDate() - dayOfWeek);
        start.setHours(0, 0, 0, 0);
        end.setTime(start.getTime());
        end.setDate(end.getDate() + 7);
        break;
      case 'monthly':
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setTime(start.getTime());
        end.setMonth(end.getMonth() + 1);
        break;
    }

    return { startTime: start, endTime: end };
  }

  /**
   * Map entity to DTO
   */
  private mapToMetricDto(entity: BridgePerformanceMetric): BridgePerformanceMetricDto {
    return {
      bridgeName: entity.bridgeName,
      sourceChain: entity.sourceChain,
      destinationChain: entity.destinationChain,
      token: entity.token || undefined,
      timeInterval: entity.timeInterval,
      timestamp: entity.timestamp,
      totalTransfers: entity.totalTransfers,
      successfulTransfers: entity.successfulTransfers,
      failedTransfers: entity.failedTransfers,
      successRate: entity.successRate,
      failureRate: entity.failureRate,
      averageSettlementTimeMs: entity.averageSettlementTimeMs || undefined,
      minSettlementTimeMs: entity.minSettlementTimeMs || undefined,
      maxSettlementTimeMs: entity.maxSettlementTimeMs || undefined,
      averageFee: entity.averageFee || undefined,
      minFee: entity.minFee || undefined,
      maxFee: entity.maxFee || undefined,
      averageSlippagePercent: entity.averageSlippagePercent || undefined,
      minSlippagePercent: entity.minSlippagePercent || undefined,
      maxSlippagePercent: entity.maxSlippagePercent || undefined,
      totalVolume: entity.totalVolume,
      totalFees: entity.totalFees,
    };
  }
}
