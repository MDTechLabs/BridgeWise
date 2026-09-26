import {
  TransferRecord,
  AnalyticsReport,
  StageDuration,
  BottleneckReport,
  LifecycleStage,
  LifecycleEvent,
} from './types';

export class StellarTransferLifecycleAnalyzer {
  analyze(transfers: TransferRecord[]): AnalyticsReport {
    const successful = transfers.filter((t) => !t.failed && t.completedAt !== undefined);
    const failed = transfers.filter((t) => t.failed === true);

    const stageDurations = this.computeStageDurations(successful);
    const totalAvgMs =
      successful.length > 0
        ? successful.reduce((sum, t) => sum + this.totalDuration(t), 0) / successful.length
        : 0;

    return {
      totalTransfers: transfers.length,
      successfulTransfers: successful.length,
      failedTransfers: failed.length,
      avgTotalDurationMs: Math.round(totalAvgMs),
      stageDurations,
      bottlenecks: this.identifyBottlenecks(stageDurations, totalAvgMs),
      generatedAt: Date.now(),
    };
  }

  detectBottlenecks(transfers: TransferRecord[]): BottleneckReport[] {
    const report = this.analyze(transfers);
    return report.bottlenecks;
  }

  getStageDurations(transfers: TransferRecord[]): StageDuration[] {
    const successful = transfers.filter((t) => !t.failed && t.completedAt !== undefined);
    return this.computeStageDurations(successful);
  }

  private computeStageDurations(transfers: TransferRecord[]): StageDuration[] {
    const stageMap = new Map<LifecycleStage, number[]>();

    for (const transfer of transfers) {
      const sorted = [...transfer.events].sort((a, b) => a.timestamp - b.timestamp);

      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];
        const durationMs = next.timestamp - current.timestamp;

        const bucket = stageMap.get(current.stage) ?? [];
        bucket.push(durationMs);
        stageMap.set(current.stage, bucket);
      }
    }

    const durations: StageDuration[] = [];
    for (const [stage, values] of stageMap.entries()) {
      if (values.length === 0) continue;
      const sorted = [...values].sort((a, b) => a - b);
      durations.push({
        stage,
        avgMs: Math.round(values.reduce((s, v) => s + v, 0) / values.length),
        minMs: sorted[0]!,
        maxMs: sorted[sorted.length - 1]!,
        count: values.length,
      });
    }

    return durations.sort((a, b) => b.avgMs - a.avgMs);
  }

  private identifyBottlenecks(stages: StageDuration[], totalAvgMs: number): BottleneckReport[] {
    if (totalAvgMs === 0) return [];

    return stages
      .filter((s) => s.avgMs > 0)
      .map((s) => ({
        stage: s.stage,
        avgMs: s.avgMs,
        percentageOfTotal: Math.round((s.avgMs / totalAvgMs) * 100 * 10) / 10,
      }))
      .sort((a, b) => b.percentageOfTotal - a.percentageOfTotal);
  }

  private totalDuration(transfer: TransferRecord): number {
    if (!transfer.completedAt) return 0;
    return transfer.completedAt - transfer.startedAt;
  }
}
