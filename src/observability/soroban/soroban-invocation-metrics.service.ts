import {
  SorobanInvocationSample,
  SorobanInvocationReport,
  SorobanObservatoryConfig,
} from './soroban-invocation-metrics.types';

export class SorobanInvocationMetricsTracker {
  private readonly samplesMap = new Map<string, SorobanInvocationSample[]>();
  private readonly degradedThresholdMs: number;
  private readonly errorRateThresholdPercent: number;
  private readonly sampleWindowSize: number;

  constructor(config?: SorobanObservatoryConfig) {
    this.degradedThresholdMs = config?.latencyDegradedThresholdMs ?? 1500;
    this.errorRateThresholdPercent = config?.errorRateThresholdPercent ?? 10;
    this.sampleWindowSize = config?.sampleWindowSize ?? 50;
  }

  /**
   * Executes a contract action, measures execution duration, and records the sample.
   */
  public async measure<T>(
    contractId: string,
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
        contractId,
        latencyMs: durationMs,
        timestamp: new Date(),
        success,
      });
    }
  }

  /**
   * Directly records a pre-measured contract invocation sample.
   */
  public recordSample(sample: SorobanInvocationSample): void {
    const { contractId } = sample;
    const existingSamples = this.samplesMap.get(contractId) ?? [];

    existingSamples.push(sample);

    // Maintain sliding window size
    if (existingSamples.length > this.sampleWindowSize) {
      existingSamples.shift();
    }

    this.samplesMap.set(contractId, existingSamples);
  }

  /**
   * Generates a performance and health report for a specific contract.
   */
  public generateReport(contractId: string): SorobanInvocationReport | null {
    const samples = this.samplesMap.get(contractId);

    if (!samples || samples.length === 0) {
      return null;
    }

    const sampleCount = samples.length;
    const totalInvocations = sampleCount;
    const latencies = samples.map((s) => s.latencyMs).sort((a, b) => a - b);
    const failureCount = samples.filter((s) => !s.success).length;
    const successCount = samples.filter((s) => s.success).length;

    const totalLatency = latencies.reduce((acc, curr) => acc + curr, 0);
    const averageLatencyMs = Math.round(totalLatency / sampleCount);
    const minLatencyMs = latencies[0];
    const maxLatencyMs = latencies[latencies.length - 1];

    // Compute P95 Latency
    const p95Index = Math.ceil(0.95 * sampleCount) - 1;
    const p95LatencyMs = latencies[p95Index];

    const errorRate = Number(((failureCount / sampleCount) * 100).toFixed(2));

    // Detect degraded performance
    const isDegraded =
      p95LatencyMs >= this.degradedThresholdMs ||
      errorRate >= this.errorRateThresholdPercent;

    return {
      contractId,
      totalInvocations,
      sampleCount,
      successCount,
      failureCount,
      averageLatencyMs,
      p95LatencyMs,
      minLatencyMs,
      maxLatencyMs,
      errorRate,
      isDegraded,
    };
  }

  /**
   * Retrieves reports across all tracked Soroban contracts.
   */
  public generateAllReports(): SorobanInvocationReport[] {
    const reports: SorobanInvocationReport[] = [];

    for (const contractId of Array.from(this.samplesMap.keys())) {
      const report = this.generateReport(contractId);
      if (report) {
        reports.push(report);
      }
    }

    return reports;
  }

  /**
   * Resets recorded metrics for a contract or all contracts.
   */
  public clear(contractId?: string): void {
    if (contractId) {
      this.samplesMap.delete(contractId);
    } else {
      this.samplesMap.clear();
    }
  }
}
