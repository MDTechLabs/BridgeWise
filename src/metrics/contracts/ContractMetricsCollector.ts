import {
  SorobanInvocationMetricsTracker,
  SorobanInvocationReport,
  SorobanObservatoryConfig,
} from '../../observability/soroban';
import { ContractAggregatedMetrics } from './contract-metrics.types';

export class ContractMetricsCollector {
  private readonly tracker: SorobanInvocationMetricsTracker;

  constructor(
    tracker?: SorobanInvocationMetricsTracker,
    config?: SorobanObservatoryConfig,
  ) {
    this.tracker = tracker ?? new SorobanInvocationMetricsTracker(config);
  }

  /**
   * Returns the underlying tracker instance.
   */
  public getTracker(): SorobanInvocationMetricsTracker {
    return this.tracker;
  }

  /**
   * Records a contract invocation sample directly.
   */
  public recordInvocation(
    contractId: string,
    latencyMs: number,
    success: boolean = true,
  ): void {
    this.tracker.recordSample({
      contractId,
      latencyMs,
      timestamp: new Date(),
      success,
    });
  }

  /**
   * Measures execution time of a contract action and records the metric.
   */
  public async measure<T>(
    contractId: string,
    action: () => Promise<T>,
  ): Promise<T> {
    return this.tracker.measure(contractId, action);
  }

  /**
   * Returns performance report for a specific contract.
   */
  public getContractReport(contractId: string): SorobanInvocationReport | null {
    return this.tracker.generateReport(contractId);
  }

  /**
   * Returns performance reports for all tracked contracts.
   */
  public getAllContractReports(): SorobanInvocationReport[] {
    return this.tracker.generateAllReports();
  }

  /**
   * Returns aggregate metrics across all tracked contracts.
   */
  public getAggregatedMetrics(): ContractAggregatedMetrics {
    const reports = this.tracker.generateAllReports();
    let totalInvocations = 0;
    let successfulInvocations = 0;
    let failedInvocations = 0;
    let totalLatencyMs = 0;

    for (const report of reports) {
      totalInvocations += report.totalInvocations;
      successfulInvocations += report.successCount;
      failedInvocations += report.failureCount;
      totalLatencyMs += report.averageLatencyMs * report.totalInvocations;
    }

    const globalSuccessRate =
      totalInvocations > 0
        ? Number(((successfulInvocations / totalInvocations) * 100).toFixed(2))
        : 0;

    const averageLatencyMs =
      totalInvocations > 0 ? Math.round(totalLatencyMs / totalInvocations) : 0;

    return {
      totalContracts: reports.length,
      totalInvocations,
      successfulInvocations,
      failedInvocations,
      globalSuccessRate,
      averageLatencyMs,
      reports,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Generates a human-readable JSON report.
   */
  public generateReport(): string {
    return JSON.stringify(this.getAggregatedMetrics(), null, 2);
  }

  /**
   * Clears metrics for a given contract or all contracts.
   */
  public clear(contractId?: string): void {
    this.tracker.clear(contractId);
  }
}
