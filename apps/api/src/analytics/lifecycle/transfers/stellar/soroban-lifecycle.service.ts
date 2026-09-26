import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { SorobanTransferLifecycleEntity } from './entities/soroban-transfer-lifecycle.entity';
import {
  BottleneckInfo,
  LifecycleAnalyticsQuery,
  LifecycleAnalyticsReport,
  LifecycleStage,
  ORDERED_STAGES,
  RecordLifecycleEventPayload,
  STAGE_LABELS,
  StageStatistics,
  TransferOutcome,
} from './types/lifecycle.types';
import {
  LifecycleAnalyticsQueryDto,
  LifecycleAnalyticsReportDto,
  RecordLifecycleEventDto,
  TransferLifecycleHistoryDto,
} from './dto/lifecycle-analytics.dto';

/** Timeout threshold — transfers with no terminal event after this are TIMEOUT */
const TRANSFER_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * SorobanLifecycleService
 *
 * Tracks individual Soroban transfer lifecycle events, measures per-stage
 * durations, and generates analytics reports that identify bottlenecks.
 *
 * Architecture:
 *  - `recordEvent()` — writes one row per stage transition
 *  - `getAnalyticsReport()` — aggregates all events into a full report
 *  - `getTransferHistory()` — returns the complete event chain for one transfer
 *  - `@OnEvent('soroban.transfer.*')` — integrates with the existing EventEmitter2 bus
 */
@Injectable()
export class SorobanLifecycleService {
  private readonly logger = new Logger(SorobanLifecycleService.name);

  constructor(
    @InjectRepository(SorobanTransferLifecycleEntity)
    private readonly repo: Repository<SorobanTransferLifecycleEntity>,
  ) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Record a single lifecycle stage event for a transfer.
   *
   * Automatically computes `durationFromPreviousMs` by looking up
   * the most recent event for the same `transferId`.
   */
  async recordEvent(payload: RecordLifecycleEventPayload): Promise<SorobanTransferLifecycleEntity> {
    const {
      transferId,
      stage,
      timestamp = new Date(),
      errorMessage,
      metadata,
    } = payload;

    // Determine duration from the previous stage
    const previousEvent = await this.repo.findOne({
      where: { transferId },
      order: { recordedAt: 'DESC' },
    });

    const durationFromPreviousMs = previousEvent
      ? timestamp.getTime() - previousEvent.recordedAt.getTime()
      : null;

    // Determine outcome for terminal stages
    let outcome: TransferOutcome | null = null;
    if (stage === LifecycleStage.SETTLED) {
      outcome = TransferOutcome.SUCCESS;
    } else if (stage === LifecycleStage.FAILED) {
      outcome = errorMessage?.toLowerCase().includes('timeout')
        ? TransferOutcome.TIMEOUT
        : TransferOutcome.FAILED;
    }

    const entity = this.repo.create({
      transferId,
      stage,
      sourceChain: (metadata?.sourceChain as string) ?? previousEvent?.sourceChain ?? null,
      destinationChain: (metadata?.destinationChain as string) ?? previousEvent?.destinationChain ?? null,
      asset: (metadata?.asset as string) ?? previousEvent?.asset ?? null,
      bridgeName: (metadata?.bridgeName as string) ?? previousEvent?.bridgeName ?? null,
      durationFromPreviousMs,
      outcome,
      errorMessage: errorMessage ?? null,
      metadata: metadata ?? null,
      recordedAt: timestamp,
    });

    const saved = await this.repo.save(entity);

    this.logger.debug(
      `Recorded lifecycle event: transferId=${transferId} stage=${stage}` +
        (durationFromPreviousMs !== null ? ` duration=${durationFromPreviousMs}ms` : ''),
    );

    return saved;
  }

  /**
   * Record an event from the HTTP DTO (controller entry point).
   */
  async recordEventFromDto(dto: RecordLifecycleEventDto): Promise<SorobanTransferLifecycleEntity> {
    return this.recordEvent({
      transferId: dto.transferId,
      stage: dto.stage,
      timestamp: dto.timestamp ? new Date(dto.timestamp) : undefined,
      errorMessage: dto.errorMessage,
      metadata: {
        ...(dto.metadata ?? {}),
        ...(dto.sourceChain ? { sourceChain: dto.sourceChain } : {}),
        ...(dto.destinationChain ? { destinationChain: dto.destinationChain } : {}),
        ...(dto.asset ? { asset: dto.asset } : {}),
        ...(dto.bridgeName ? { bridgeName: dto.bridgeName } : {}),
      },
    });
  }

  /**
   * Retrieve the full lifecycle event chain for a single transfer.
   */
  async getTransferHistory(transferId: string): Promise<TransferLifecycleHistoryDto> {
    const events = await this.repo.find({
      where: { transferId },
      order: { recordedAt: 'ASC' },
    });

    if (events.length === 0) {
      throw new NotFoundException(`No lifecycle events found for transfer: ${transferId}`);
    }

    const terminalEvent = events.find(
      (e) => e.stage === LifecycleStage.SETTLED || e.stage === LifecycleStage.FAILED,
    );
    const finalOutcome = terminalEvent?.outcome ?? null;

    const first = events[0];
    const last = events[events.length - 1];
    const totalDurationMs =
      first && last ? last.recordedAt.getTime() - first.recordedAt.getTime() : null;

    return {
      transferId,
      events: events.map((e) => ({
        id: e.id,
        transferId: e.transferId,
        stage: e.stage,
        sourceChain: e.sourceChain,
        destinationChain: e.destinationChain,
        asset: e.asset,
        bridgeName: e.bridgeName,
        durationFromPreviousMs: e.durationFromPreviousMs,
        outcome: e.outcome,
        errorMessage: e.errorMessage,
        metadata: e.metadata,
        recordedAt: e.recordedAt,
      })),
      finalOutcome,
      totalDurationMs,
    };
  }

  /**
   * Generate a full lifecycle analytics report.
   *
   * Loads all relevant events, groups them by transfer, computes per-stage
   * duration statistics, and identifies bottlenecks.
   */
  async getAnalyticsReport(query: LifecycleAnalyticsQueryDto): Promise<LifecycleAnalyticsReportDto> {
    const where = this.buildWhereClause(query);

    // Load all matching events — use a raw query for performance on large sets
    const events = await this.repo.find({
      where,
      order: { transferId: 'ASC', recordedAt: 'ASC' },
    });

    const report = this.computeReport(events, query.failedOnly ?? false);

    return {
      ...report,
      stageStats: report.stageStats,
      bottlenecks: report.bottlenecks,
    };
  }

  // ─── EventEmitter2 Integration ───────────────────────────────────────────────

  @OnEvent('soroban.transfer.initiated')
  async onTransferInitiated(payload: {
    transferId: string;
    sourceChain: string;
    destinationChain: string;
    asset: string;
    bridgeName: string;
  }): Promise<void> {
    await this.recordEvent({
      transferId: payload.transferId,
      stage: LifecycleStage.INITIATED,
      metadata: {
        sourceChain: payload.sourceChain,
        destinationChain: payload.destinationChain,
        asset: payload.asset,
        bridgeName: payload.bridgeName,
      },
    });
  }

  @OnEvent('soroban.transfer.validated')
  async onTransferValidated(payload: { transferId: string }): Promise<void> {
    await this.recordEvent({ transferId: payload.transferId, stage: LifecycleStage.VALIDATED });
  }

  @OnEvent('soroban.transfer.liquidity_reserved')
  async onLiquidityReserved(payload: { transferId: string }): Promise<void> {
    await this.recordEvent({ transferId: payload.transferId, stage: LifecycleStage.LIQUIDITY_RESERVED });
  }

  @OnEvent('soroban.transfer.source_tx_submitted')
  async onSourceTxSubmitted(payload: { transferId: string; txHash?: string }): Promise<void> {
    await this.recordEvent({
      transferId: payload.transferId,
      stage: LifecycleStage.SOURCE_TX_SUBMITTED,
      metadata: payload.txHash ? { txHash: payload.txHash } : undefined,
    });
  }

  @OnEvent('soroban.transfer.source_tx_confirmed')
  async onSourceTxConfirmed(payload: { transferId: string; blockNumber?: number }): Promise<void> {
    await this.recordEvent({
      transferId: payload.transferId,
      stage: LifecycleStage.SOURCE_TX_CONFIRMED,
      metadata: payload.blockNumber ? { blockNumber: payload.blockNumber } : undefined,
    });
  }

  @OnEvent('soroban.transfer.contract_invoked')
  async onContractInvoked(payload: { transferId: string; contractId?: string }): Promise<void> {
    await this.recordEvent({
      transferId: payload.transferId,
      stage: LifecycleStage.SOROBAN_CONTRACT_INVOKED,
      metadata: payload.contractId ? { contractId: payload.contractId } : undefined,
    });
  }

  @OnEvent('soroban.transfer.contract_confirmed')
  async onContractConfirmed(payload: { transferId: string }): Promise<void> {
    await this.recordEvent({ transferId: payload.transferId, stage: LifecycleStage.SOROBAN_CONTRACT_CONFIRMED });
  }

  @OnEvent('soroban.transfer.destination_tx_submitted')
  async onDestinationTxSubmitted(payload: { transferId: string; txHash?: string }): Promise<void> {
    await this.recordEvent({
      transferId: payload.transferId,
      stage: LifecycleStage.DESTINATION_TX_SUBMITTED,
      metadata: payload.txHash ? { txHash: payload.txHash } : undefined,
    });
  }

  @OnEvent('soroban.transfer.destination_tx_confirmed')
  async onDestinationTxConfirmed(payload: { transferId: string }): Promise<void> {
    await this.recordEvent({ transferId: payload.transferId, stage: LifecycleStage.DESTINATION_TX_CONFIRMED });
  }

  @OnEvent('soroban.transfer.settled')
  async onTransferSettled(payload: { transferId: string }): Promise<void> {
    await this.recordEvent({ transferId: payload.transferId, stage: LifecycleStage.SETTLED });
  }

  @OnEvent('soroban.transfer.failed')
  async onTransferFailed(payload: { transferId: string; reason?: string }): Promise<void> {
    await this.recordEvent({
      transferId: payload.transferId,
      stage: LifecycleStage.FAILED,
      errorMessage: payload.reason,
    });
  }

  // ─── Analysis Engine ─────────────────────────────────────────────────────────

  /**
   * Core computation: group events by transfer → derive statistics.
   */
  private computeReport(
    events: SorobanTransferLifecycleEntity[],
    failedOnly: boolean,
  ): LifecycleAnalyticsReport {
    // Group events by transferId
    const byTransfer = new Map<string, SorobanTransferLifecycleEntity[]>();
    for (const ev of events) {
      const list = byTransfer.get(ev.transferId) ?? [];
      list.push(ev);
      byTransfer.set(ev.transferId, list);
    }

    let successfulTransfers = 0;
    let failedTransfers = 0;
    let timedOutTransfers = 0;
    const totalDurations: number[] = [];

    // Per-stage accumulators: stage → list of duration samples
    const stageDurations = new Map<LifecycleStage, number[]>();
    const stageFailCounts = new Map<LifecycleStage, number>();
    const stageReachCounts = new Map<LifecycleStage, number>();

    for (const stage of ORDERED_STAGES) {
      stageDurations.set(stage, []);
      stageFailCounts.set(stage, 0);
      stageReachCounts.set(stage, 0);
    }
    // FAILED is a terminal stage — track separately
    stageDurations.set(LifecycleStage.FAILED, []);
    stageFailCounts.set(LifecycleStage.FAILED, 0);
    stageReachCounts.set(LifecycleStage.FAILED, 0);

    for (const [, transferEvents] of byTransfer) {
      const sorted = [...transferEvents].sort(
        (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
      );

      const terminalEvent = sorted.find(
        (e) => e.stage === LifecycleStage.SETTLED || e.stage === LifecycleStage.FAILED,
      );

      const isSuccess = terminalEvent?.outcome === TransferOutcome.SUCCESS;
      const isTimeout = terminalEvent?.outcome === TransferOutcome.TIMEOUT ||
        (!terminalEvent &&
          Date.now() - sorted[0].recordedAt.getTime() > TRANSFER_TIMEOUT_MS);
      const isFailed = terminalEvent?.outcome === TransferOutcome.FAILED;

      if (failedOnly && isSuccess) continue;

      if (isSuccess) successfulTransfers++;
      else if (isTimeout) timedOutTransfers++;
      else if (isFailed || !terminalEvent) failedTransfers++;

      // Total duration for successful transfers
      if (isSuccess && sorted.length > 0) {
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        totalDurations.push(last.recordedAt.getTime() - first.recordedAt.getTime());
      }

      // Per-stage stats
      const failedAt = terminalEvent?.stage === LifecycleStage.FAILED
        ? this.getFailedAtStage(sorted)
        : null;

      for (const ev of sorted) {
        const s = ev.stage;
        stageReachCounts.set(s, (stageReachCounts.get(s) ?? 0) + 1);

        if (ev.durationFromPreviousMs !== null) {
          const durations = stageDurations.get(s) ?? [];
          durations.push(Number(ev.durationFromPreviousMs));
          stageDurations.set(s, durations);
        }

        if (failedAt === s) {
          stageFailCounts.set(s, (stageFailCounts.get(s) ?? 0) + 1);
        }
      }
    }

    const totalTransfers = byTransfer.size;

    // Build per-stage stats
    const allStages = [...ORDERED_STAGES, LifecycleStage.FAILED];
    const stageStats: StageStatistics[] = allStages
      .filter((s) => (stageReachCounts.get(s) ?? 0) > 0)
      .map((stage) => {
        const durations = stageDurations.get(stage) ?? [];
        const reachCount = stageReachCounts.get(stage) ?? 0;
        const failCount = stageFailCounts.get(stage) ?? 0;

        return {
          stage,
          label: STAGE_LABELS[stage],
          reachCount,
          failCount,
          stageFailureRate: reachCount > 0 ? failCount / reachCount : 0,
          avgDurationMs: this.average(durations),
          medianDurationMs: this.percentile(durations, 50),
          p95DurationMs: this.percentile(durations, 95),
          minDurationMs: durations.length > 0 ? Math.min(...durations) : 0,
          maxDurationMs: durations.length > 0 ? Math.max(...durations) : 0,
        };
      });

    const avgTotal = this.average(totalDurations);
    const bottlenecks = this.identifyBottlenecks(stageStats, avgTotal);

    return {
      totalTransfers,
      successfulTransfers,
      failedTransfers,
      timedOutTransfers,
      overallSuccessRate:
        totalTransfers > 0 ? (successfulTransfers / totalTransfers) * 100 : 0,
      avgTotalDurationMs: avgTotal,
      medianTotalDurationMs: this.percentile(totalDurations, 50),
      p95TotalDurationMs: this.percentile(totalDurations, 95),
      stageStats,
      bottlenecks,
      generatedAt: new Date(),
    };
  }

  /**
   * Identifies which stage a failed transfer stalled at —
   * the last non-FAILED stage reached before FAILED.
   */
  private getFailedAtStage(
    sortedEvents: SorobanTransferLifecycleEntity[],
  ): LifecycleStage | null {
    const failIdx = sortedEvents.findIndex((e) => e.stage === LifecycleStage.FAILED);
    if (failIdx <= 0) return LifecycleStage.INITIATED;
    return sortedEvents[failIdx - 1].stage;
  }

  /**
   * Rank stages by their contribution to total transfer time and failure rate.
   * Returns top bottlenecks sorted by severity desc.
   */
  private identifyBottlenecks(
    stageStats: StageStatistics[],
    avgTotalMs: number,
  ): BottleneckInfo[] {
    const totalMs = avgTotalMs || 1;

    const bottlenecks: BottleneckInfo[] = stageStats
      .filter((s) => s.stage !== LifecycleStage.FAILED && s.avgDurationMs > 0)
      .map((s) => {
        const percentOfTotal = (s.avgDurationMs / totalMs) * 100;

        // Severity based on time share and failure rate
        let severity: BottleneckInfo['severity'] = 'low';
        const combined = percentOfTotal + s.stageFailureRate * 100;
        if (combined >= 50 || s.stageFailureRate >= 0.3) severity = 'critical';
        else if (combined >= 30 || s.stageFailureRate >= 0.15) severity = 'high';
        else if (combined >= 15 || s.stageFailureRate >= 0.05) severity = 'medium';

        return {
          stage: s.stage,
          label: s.label,
          avgDurationMs: s.avgDurationMs,
          percentOfTotalTime: Math.round(percentOfTotal * 10) / 10,
          failCount: s.failCount,
          severity,
        };
      })
      .sort((a, b) => {
        const order = { critical: 4, high: 3, medium: 2, low: 1 };
        return order[b.severity] - order[a.severity] || b.percentOfTotalTime - a.percentOfTotalTime;
      });

    return bottlenecks;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private buildWhereClause(
    query: LifecycleAnalyticsQueryDto,
  ): FindOptionsWhere<SorobanTransferLifecycleEntity> {
    const where: FindOptionsWhere<SorobanTransferLifecycleEntity> = {};

    if (query.sourceChain) where.sourceChain = query.sourceChain;
    if (query.destinationChain) where.destinationChain = query.destinationChain;
    if (query.asset) where.asset = query.asset;
    if (query.bridgeName) where.bridgeName = query.bridgeName;
    if (query.startDate && query.endDate) {
      where.recordedAt = Between(new Date(query.startDate), new Date(query.endDate));
    }

    return where;
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }
}
