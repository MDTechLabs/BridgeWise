import {
  LatencySample,
  ProviderLatencyReport,
  ObservatoryConfig,
} from './stellar-latency.types';

export class StellarLatencyObservatoryService {
  private readonly samplesMap = new Map<string, LatencySample[]>();
  private readonly degradedThresholdMs: number;
  private readonly errorRateThresholdPercent: number;
  private readonly sampleWindowSize: number;

  constructor(config?: ObservatoryConfig) {
    this.degradedThresholdMs = config?.latencyDegradedThresholdMs ?? 1500;
    this.errorRateThresholdPercent = config?.errorRateThresholdPercent ?? 10;
    this.sampleWindowSize = config?.sampleWindowSize ?? 50;
  }

  /**
   * Executes a provider action, measures execution duration, and records the sample.
   */
  public async measure<T>(
    providerId: string,
    action: () => Promise<T>,
  ): Promise<T> {
    const startTime = performance.now();
    let success = true;

    try {
      return await action();
    } catch (error) {
      success = false;
      throw error;
    } finally {
      const durationMs = Math.round(performance.now() - startTime);
      this.recordSample({
        providerId,
        latencyMs: durationMs,
        timestamp: new Date(),
        success,
      });
    }
  }

  /**
   * Directly records a pre-measured latency sample.
   */
  public recordSample(sample: LatencySample): void {
    const { providerId } = sample;
    const existingSamples = this.samplesMap.get(providerId) ?? [];

    existingSamples.push(sample);

    // Maintain sliding window size
    if (existingSamples.length > this.sampleWindowSize) {
      existingSamples.shift();
    }

    this.samplesMap.set(providerId, existingSamples);
  }

  /**
   * Generates a performance and health report for a specific provider.
   */
  public generateReport(providerId: string): ProviderLatencyReport | null {
    const samples = this.samplesMap.get(providerId);

    if (!samples || samples.length === 0) {
      return null;
    }

    const sampleCount = samples.length;
    const latencies = samples.map((s) => s.latencyMs).sort((a, b) => a - b);
    const failedCount = samples.filter((s) => !s.success).length;

    const totalLatency = latencies.reduce((acc, curr) => acc + curr, 0);
    const averageLatencyMs = Math.round(totalLatency / sampleCount);
    const minLatencyMs = latencies[0];
    const maxLatencyMs = latencies[latencies.length - 1];

    // Compute P95 Latency
    const p95Index = Math.ceil(0.95 * sampleCount) - 1;
    const p95LatencyMs = latencies[p95Index];

    const errorRate = Number(((failedCount / sampleCount) * 100).toFixed(2));

    // Detect degraded performance
    const isDegraded =
      p95LatencyMs >= this.degradedThresholdMs ||
      errorRate >= this.errorRateThresholdPercent;

    return {
      providerId,
      averageLatencyMs,
      p95LatencyMs,
      minLatencyMs,
      maxLatencyMs,
      sampleCount,
      errorRate,
      isDegraded,
    };
  }

  /**
   * Retrieves reports across all tracked Stellar providers.
   */
  public generateAllReports(): ProviderLatencyReport[] {
    const reports: ProviderLatencyReport[] = [];

    for (const providerId of this.samplesMap.keys()) {
      const report = this.generateReport(providerId);
      if (report) {
        reports.push(report);
      }
    }

    return reports;
  }

  /**
   * Resets recorded metrics for a provider or all providers.
   */
  public clear(providerId?: string): void {
    if (providerId) {
      this.samplesMap.delete(providerId);
    } else {
      this.samplesMap.clear();
    }
  }
}