import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { BridgeTransactionEvent } from './bridge-transaction-event.entity';
import { BridgeReliabilityMetric } from './bridge-reliability-metric.entity';
import {
  RawCounts,
  ReliabilityCalculatorService,
} from './reliability-calculator.service';
import {
  BridgeReliabilityResponseDto,
  GetReliabilityDto,
  RecordBridgeEventDto,
  ReliabilityRankingFactorDto,
} from './reliability.dto';
import { TransactionOutcome, WindowMode } from './reliability.enum';
import { RELIABILITY_CONSTANTS } from './reliability.constants';

@Injectable()
export class BridgeReliabilityService {
  private readonly logger = new Logger(BridgeReliabilityService.name);

  constructor(
    @InjectRepository(BridgeTransactionEvent)
    private readonly eventRepo: Repository<BridgeTransactionEvent>,

    @InjectRepository(BridgeReliabilityMetric)
    private readonly metricRepo: Repository<BridgeReliabilityMetric>,

    private readonly calculator: ReliabilityCalculatorService,
  ) {}

  // ─── Record Event ──────────────────────────────────────────────────────────

  async recordEvent(
    dto: RecordBridgeEventDto,
  ): Promise<BridgeTransactionEvent> {
    const event = this.eventRepo.create({
      bridgeName: dto.bridgeName,
      sourceChain: dto.sourceChain.toLowerCase(),
      destinationChain: dto.destinationChain.toLowerCase(),
      outcome: dto.outcome,
      transactionHash: dto.transactionHash ?? null,
      failureReason: dto.failureReason ?? null,
      durationMs: dto.durationMs ?? 0,
    });

    const saved = await this.eventRepo.save(event);
    this.logger.log(
      `Recorded ${dto.outcome} event for ${dto.bridgeName} [${dto.sourceChain} → ${dto.destinationChain}]`,
    );

    // Invalidate cached metric so next query recalculates
    await this.invalidateCachedMetric(
      dto.bridgeName,
      dto.sourceChain,
      dto.destinationChain,
    );

    return saved;
  }

  // ─── Rolling Window Queries ────────────────────────────────────────────────

  private async getRollingCounts(
    bridgeName: string,
    sourceChain: string,
    destinationChain: string,
    windowMode: WindowMode,
    windowSize: number,
  ): Promise<RawCounts> {
    const baseWhere = {
      bridgeName,
      sourceChain: sourceChain.toLowerCase(),
      destinationChain: destinationChain.toLowerCase(),
    };

    // Exclude cancelled transactions
    const excludedOutcomes = [TransactionOutcome.CANCELLED];

    if (windowMode === WindowMode.TIME_BASED) {
      const since = new Date();
      since.setDate(since.getDate() - windowSize);

      const events = await this.eventRepo.find({
        where: {
          ...baseWhere,
          createdAt: MoreThanOrEqual(since),
        },
        select: ['outcome'],
      });

      return this.aggregateCounts(
        events.filter((e) => !excludedOutcomes.includes(e.outcome)),
      );
    }

    // TRANSACTION_COUNT mode: last N non-cancelled events
    const events = await this.eventRepo.find({
      where: baseWhere,
      order: { createdAt: 'DESC' },
      take: windowSize + 200, // over-fetch to account for cancelled
      select: ['outcome'],
    });

    const filtered = events
      .filter((e) => !excludedOutcomes.includes(e.outcome))
      .slice(0, windowSize);

    return this.aggregateCounts(filtered);
  }

  private aggregateCounts(
    events: Pick<BridgeTransactionEvent, 'outcome'>[],
  ): RawCounts {
    const counts: RawCounts = {
      totalAttempts: events.length,
      successfulTransfers: 0,
      failedTransfers: 0,
      timeoutCount: 0,
    };

    for (const event of events) {
      if (event.outcome === TransactionOutcome.SUCCESS)
        counts.successfulTransfers++;
      else if (event.outcome === TransactionOutcome.FAILED)
        counts.failedTransfers++;
      else if (event.outcome === TransactionOutcome.TIMEOUT)
        counts.timeoutCount++;
    }

    return counts;
  }

  // ─── Compute & Cache Reliability ──────────────────────────────────────────

  async getReliability(
    dto: GetReliabilityDto,
  ): Promise<BridgeReliabilityResponseDto> {
    const windowMode = dto.windowMode ?? WindowMode.TRANSACTION_COUNT;
    const windowSize =
      dto.windowSize ??
      (windowMode === WindowMode.TIME_BASED
        ? RELIABILITY_CONSTANTS.DEFAULT_WINDOW_DAYS
        : RELIABILITY_CONSTANTS.DEFAULT_WINDOW_SIZE);

    const counts = await this.getRollingCounts(
      dto.bridgeName,
      dto.sourceChain,
      dto.destinationChain,
      windowMode,
      windowSize,
    );

    const reliabilityPercent =
      this.calculator.computeReliabilityPercent(counts);
    const reliabilityScore = this.calculator.computeReliabilityScore(counts);
    const tier = this.calculator.computeTier(reliabilityPercent);
    const badge = this.calculator.buildBadge(
      reliabilityPercent,
      windowSize,
      windowMode,
    );

    // Upsert cached metric for ranking engine access
    const metric = await this.upsertMetric({
      bridgeName: dto.bridgeName,
      sourceChain: dto.sourceChain.toLowerCase(),
      destinationChain: dto.destinationChain.toLowerCase(),
      ...counts,
      reliabilityPercent,
      reliabilityScore,
      reliabilityTier: tier,
      windowMode,
      windowSize,
    });

    return {
      bridgeName: dto.bridgeName,
      sourceChain: dto.sourceChain.toLowerCase(),
      destinationChain: dto.destinationChain.toLowerCase(),
      totalAttempts: counts.totalAttempts,
      successfulTransfers: counts.successfulTransfers,
      failedTransfers: counts.failedTransfers,
      timeoutCount: counts.timeoutCount,
      reliabilityPercent,
      reliabilityScore,
      badge,
      lastComputedAt: metric.lastComputedAt,
    };
  }

  // ─── Ranking Engine Integration ───────────────────────────────────────────

  async getReliabilityRankingFactor(
    bridgeName: string,
    sourceChain: string,
    destinationChain: string,
    options: {
      threshold?: number;
      ignoreReliability?: boolean;
    } = {},
  ): Promise<ReliabilityRankingFactorDto> {
    const metric = await this.metricRepo.findOne({
      where: {
        bridgeName,
        sourceChain: sourceChain.toLowerCase(),
        destinationChain: destinationChain.toLowerCase(),
      },
    });

    const reliabilityScore = metric?.reliabilityScore ?? 0;
    const threshold =
      options.threshold ?? RELIABILITY_CONSTANTS.MEDIUM_THRESHOLD;
    const penaltyApplied =
      !options.ignoreReliability && reliabilityScore < threshold;

    const adjustedScore = options.ignoreReliability
      ? reliabilityScore
      : reliabilityScore -
        (penaltyApplied ? RELIABILITY_CONSTANTS.PENALTY_BELOW_THRESHOLD : 0);

    return {
      bridgeName,
      sourceChain: sourceChain.toLowerCase(),
      destinationChain: destinationChain.toLowerCase(),
      reliabilityScore,
      penaltyApplied,
      adjustedScore: Math.max(0, adjustedScore),
    };
  }

  /**
   * Bulk fetch reliability factors for all bridges on a route.
   * Used by the Smart Bridge Ranking engine to sort bridges.
   */
  async getBulkReliabilityFactors(
    sourceChain: string,
    destinationChain: string,
    options: { threshold?: number; ignoreReliability?: boolean } = {},
  ): Promise<ReliabilityRankingFactorDto[]> {
    const metrics = await this.metricRepo.find({
      where: {
        sourceChain: sourceChain.toLowerCase(),
        destinationChain: destinationChain.toLowerCase(),
      },
    });

    return metrics.map((m) => {
      const threshold =
        options.threshold ?? RELIABILITY_CONSTANTS.MEDIUM_THRESHOLD;
      const penaltyApplied =
        !options.ignoreReliability && Number(m.reliabilityScore) < threshold;
      return {
        bridgeName: m.bridgeName,
        sourceChain: m.sourceChain,
        destinationChain: m.destinationChain,
        reliabilityScore: Number(m.reliabilityScore),
        penaltyApplied,
        adjustedScore: Math.max(
          0,
          Number(m.reliabilityScore) -
            (penaltyApplied
              ? RELIABILITY_CONSTANTS.PENALTY_BELOW_THRESHOLD
              : 0),
        ),
      };
    });
  }

  // ─── Admin / Maintenance ──────────────────────────────────────────────────

  async getAllMetrics(): Promise<BridgeReliabilityMetric[]> {
    return this.metricRepo.find({ order: { reliabilityScore: 'DESC' } });
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async upsertMetric(data: {
    bridgeName: string;
    sourceChain: string;
    destinationChain: string;
    totalAttempts: number;
    successfulTransfers: number;
    failedTransfers: number;
    timeoutCount: number;
    reliabilityPercent: number;
    reliabilityScore: number;
    reliabilityTier: any;
    windowMode: WindowMode;
    windowSize: number;
  }): Promise<BridgeReliabilityMetric> {
    let metric = await this.metricRepo.findOne({
      where: {
        bridgeName: data.bridgeName,
        sourceChain: data.sourceChain,
        destinationChain: data.destinationChain,
      },
    });

    if (!metric) {
      metric = this.metricRepo.create({
        bridgeName: data.bridgeName,
        sourceChain: data.sourceChain,
        destinationChain: data.destinationChain,
      });
    }

    Object.assign(metric, {
      totalAttempts: data.totalAttempts,
      successfulTransfers: data.successfulTransfers,
      failedTransfers: data.failedTransfers,
      timeoutCount: data.timeoutCount,
      reliabilityPercent: data.reliabilityPercent,
      reliabilityScore: data.reliabilityScore,
      reliabilityTier: data.reliabilityTier,
      windowConfig: { mode: data.windowMode, size: data.windowSize },
    });

    return this.metricRepo.save(metric);
  }

  private async invalidateCachedMetric(
    bridgeName: string,
    sourceChain: string,
    destinationChain: string,
  ): Promise<void> {
    // Simply sets score to stale; actual recompute happens on next getReliability call
    await this.metricRepo.update(
      {
        bridgeName,
        sourceChain: sourceChain.toLowerCase(),
        destinationChain: destinationChain.toLowerCase(),
      },
      { totalAttempts: () => '"totalAttempts"' }, // triggers updatedAt refresh
    );
  }
}
