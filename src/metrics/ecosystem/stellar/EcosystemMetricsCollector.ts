// src/metrics/ecosystem/stellar/EcosystemMetricsCollector.ts

/**
 * Collects ecosystem‑wide bridge statistics for the Stellar network.
 * Tracks overall transfer counts, success/failure rates, latency and fee
 * aggregates, as well as per‑provider breakdowns.
 * The collector is deliberately lightweight and in‑memory; it can be
 * periodically flushed to a persistence layer or exported via the existing
 * metrics exporter.
 */
export interface TransferMetrics {
  total: number;
  success: number;
  failure: number;
  latencyMsSum: number;
  feeUsdSum: number;
}

export interface ProviderMetrics {
  provider: string;
  total: number;
  success: number;
  failure: number;
  avgLatencyMs: number;
  avgFeeUsd: number;
}

export class EcosystemMetricsCollector {
  private transferMetrics: TransferMetrics = {
    total: 0,
    success: 0,
    failure: 0,
    latencyMsSum: 0,
    feeUsdSum: 0,
  };

  private providerMetrics: Map<
    string,
    {
      total: number;
      success: number;
      failure: number;
      latencyMsSum: number;
      feeUsdSum: number;
    }
  > = new Map();

  /**
   * Record a single transfer.
   * @param provider The provider / route identifier.
   * @param success Whether the transfer succeeded.
   * @param latencyMs Observed latency in milliseconds.
   * @param feeUsd Fee paid for the transfer, expressed in USD.
   */
  recordTransfer(
    provider: string,
    success: boolean,
    latencyMs: number,
    feeUsd: number,
  ): void {
    // Update global counters
    this.transferMetrics.total++;
    this.transferMetrics.latencyMsSum += latencyMs;
    this.transferMetrics.feeUsdSum += feeUsd;
    if (success) {
      this.transferMetrics.success++;
    } else {
      this.transferMetrics.failure++;
    }

    // Update per‑provider counters
    const current = this.providerMetrics.get(provider) ?? {
      total: 0,
      success: 0,
      failure: 0,
      latencyMsSum: 0,
      feeUsdSum: 0,
    };
    current.total++;
    current.latencyMsSum += latencyMs;
    current.feeUsdSum += feeUsd;
    if (success) {
      current.success++;
    } else {
      current.failure++;
    }
    this.providerMetrics.set(provider, current);
  }

  /** Return a snapshot of aggregate transfer metrics. */
  getTransferMetrics(): TransferMetrics {
    return { ...this.transferMetrics };
  }

  /** Return a snapshot of per‑provider metrics. */
  getProviderMetrics(): ProviderMetrics[] {
    return Array.from(this.providerMetrics.entries()).map(
      ([provider, data]) => ({
        provider,
        total: data.total,
        success: data.success,
        failure: data.failure,
        avgLatencyMs: data.total ? data.latencyMsSum / data.total : 0,
        avgFeeUsd: data.total ? data.feeUsdSum / data.total : 0,
      })
    );
  }

  /**
   * Generate a human‑readable report. The default format is JSON, but the
   * method can be extended to produce CSV, Markdown, etc.
   */
  generateReport(): string {
    const report = {
      transferMetrics: this.getTransferMetrics(),
      providerMetrics: this.getProviderMetrics(),
    };
    return JSON.stringify(report, null, 2);
  }
}
