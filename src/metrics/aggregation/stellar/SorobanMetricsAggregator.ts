// src/metrics/aggregation/stellar/SorobanMetricsAggregator.ts

export interface SorobanProviderMetrics {
  providerId: string;
  totalTransfers: number;
  successfulTransfers: number;
  failedTransfers: number;
  totalVolumeUsd: number;
  averageLatencyMs: number;
  averageFeeUsd: number;
  timestamp: Date;
}

export interface NormalizedSorobanMetrics {
  id: string;
  provider: string;
  successRate: number;
  volumeUsd: number;
  latencyMs: number;
  feeUsd: number;
  recordedAt: string;
}

export interface AggregateStatistics {
  totalProviders: number;
  totalTransfers: number;
  globalSuccessRate: number;
  totalVolumeUsd: number;
  averageLatencyMs: number;
  averageFeeUsd: number;
  lastUpdated: string;
}

export class SorobanMetricsAggregator {
  private metricsStore: Map<string, SorobanProviderMetrics[]> = new Map();

  /**
   * Collects metrics from a Soroban bridge provider
   * @param metrics The metrics to collect from the provider
   */
  public collectProviderMetrics(metrics: SorobanProviderMetrics): void {
    if (!this.metricsStore.has(metrics.providerId)) {
      this.metricsStore.set(metrics.providerId, []);
    }
    this.metricsStore.get(metrics.providerId)!.push(metrics);
  }

  /**
   * Normalizes the collected data formats for a given provider
   * @param providerId The ID of the provider
   * @returns An array of normalized metrics
   */
  public normalizeDataFormats(providerId: string): NormalizedSorobanMetrics[] {
    const rawMetrics = this.metricsStore.get(providerId) || [];
    return rawMetrics.map((metric, index) => ({
      id: `${metric.providerId}-${metric.timestamp.getTime()}-${index}`,
      provider: metric.providerId,
      successRate: metric.totalTransfers > 0 
        ? (metric.successfulTransfers / metric.totalTransfers) * 100 
        : 0,
      volumeUsd: metric.totalVolumeUsd,
      latencyMs: metric.averageLatencyMs,
      feeUsd: metric.averageFeeUsd,
      recordedAt: metric.timestamp.toISOString(),
    }));
  }

  /**
   * Generates aggregate statistics across all Soroban bridge providers
   * @returns The generated aggregate statistics
   */
  public generateAggregateStatistics(): AggregateStatistics {
    let totalTransfers = 0;
    let successfulTransfers = 0;
    let totalVolumeUsd = 0;
    let totalLatencyMs = 0;
    let totalFeeUsd = 0;
    let metricsCount = 0;

    for (const [_, metricsArray] of this.metricsStore.entries()) {
      for (const metric of metricsArray) {
        totalTransfers += metric.totalTransfers;
        successfulTransfers += metric.successfulTransfers;
        totalVolumeUsd += metric.totalVolumeUsd;
        totalLatencyMs += metric.averageLatencyMs;
        totalFeeUsd += metric.averageFeeUsd;
        metricsCount++;
      }
    }

    const globalSuccessRate = totalTransfers > 0 
      ? (successfulTransfers / totalTransfers) * 100 
      : 0;

    const averageLatencyMs = metricsCount > 0 
      ? totalLatencyMs / metricsCount 
      : 0;
      
    const averageFeeUsd = metricsCount > 0 
      ? totalFeeUsd / metricsCount 
      : 0;

    return {
      totalProviders: this.metricsStore.size,
      totalTransfers,
      globalSuccessRate,
      totalVolumeUsd,
      averageLatencyMs,
      averageFeeUsd,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Clear all collected metrics
   */
  public clearMetrics(): void {
    this.metricsStore.clear();
  }
}
