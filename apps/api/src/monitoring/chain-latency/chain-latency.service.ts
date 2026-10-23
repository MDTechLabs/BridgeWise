import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CHAIN_ID_PATTERN,
  DEFAULT_SERIES_BUCKETS,
  DEFAULT_WINDOW_MS,
  HISTOGRAM_BOUNDS_MS,
  MAX_SAMPLES_PER_CHAIN,
  MAX_SERIES_BUCKETS,
  MAX_TRACKED_CHAINS,
  MAX_WINDOW_MS,
  MIN_WINDOW_MS,
  RETENTION_MS,
  STATUS_THRESHOLDS,
} from './chain-latency.constants';
import {
  ChainLatencyDashboard,
  ChainLatencyStatus,
  ChainLatencySummary,
  LatencyDashboardOverview,
  LatencyHistogramBucket,
  LatencyPercentiles,
  LatencySample,
  LatencyTimeSeriesPoint,
} from './chain-latency.types';

/** Nearest-rank percentile over an ascending-sorted array. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

const round = (n: number) => Math.round(n * 100) / 100;

function computePercentiles(values: number[]): LatencyPercentiles | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: round(sum / sorted.length),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

@Injectable()
export class ChainLatencyService {
  private readonly samples = new Map<string, LatencySample[]>();

  /** Validate and normalise a chain identifier. */
  normalizeChain(chain: string): string {
    const id = String(chain ?? '').trim().toLowerCase();
    if (!CHAIN_ID_PATTERN.test(id)) {
      throw new BadRequestException(`Invalid chain identifier "${chain}"`);
    }
    return id;
  }

  /** Validate a dashboard window, falling back to the default when omitted. */
  resolveWindow(windowMs?: number): number {
    if (windowMs === undefined) return DEFAULT_WINDOW_MS;
    if (!Number.isFinite(windowMs) || windowMs < MIN_WINDOW_MS || windowMs > MAX_WINDOW_MS) {
      throw new BadRequestException(
        `windowMs must be between ${MIN_WINDOW_MS} and ${MAX_WINDOW_MS}`,
      );
    }
    return Math.floor(windowMs);
  }

  /**
   * Record one latency observation for a chain. Invalid latencies (negative,
   * NaN, infinite) are rejected so they cannot skew percentiles.
   */
  record(
    chain: string,
    latencyMs: number,
    options: { success?: boolean; operation?: string; timestamp?: number } = {},
  ): void {
    const id = this.normalizeChain(chain);
    if (!Number.isFinite(latencyMs) || latencyMs < 0) {
      throw new BadRequestException('latencyMs must be a non-negative finite number');
    }
    if (!this.samples.has(id) && this.samples.size >= MAX_TRACKED_CHAINS) {
      throw new BadRequestException(`Cannot track more than ${MAX_TRACKED_CHAINS} chains`);
    }

    const list = this.samples.get(id) ?? [];
    const timestamp = options.timestamp ?? Date.now();
    // Samples arrive roughly in order, so expired ones sit at the head.
    while (list.length && list[0].timestamp < Date.now() - RETENTION_MS) list.shift();
    list.push({
      timestamp,
      latencyMs,
      success: options.success ?? true,
      operation: options.operation?.trim() || 'default',
    });
    if (list.length > MAX_SAMPLES_PER_CHAIN) {
      list.splice(0, list.length - MAX_SAMPLES_PER_CHAIN);
    }
    this.samples.set(id, list);
  }

  /**
   * Time an async operation against a chain. The sample is recorded whether
   * the operation resolves or rejects; rejections are rethrown unchanged.
   */
  async track<T>(chain: string, fn: () => Promise<T>, operation?: string): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.record(chain, Date.now() - start, { success: true, operation });
      return result;
    } catch (error) {
      this.record(chain, Date.now() - start, { success: false, operation });
      throw error;
    }
  }

  getTrackedChains(): string[] {
    return [...this.samples.keys()].sort();
  }

  /** Dashboard overview for every tracked chain, worst status first. */
  getOverview(windowMs?: number): LatencyDashboardOverview {
    const window = this.resolveWindow(windowMs);
    const chains = this.getTrackedChains().map((c) => this.summarize(c, window));
    const rank: Record<ChainLatencyStatus, number> = {
      unhealthy: 0,
      degraded: 1,
      no_data: 2,
      healthy: 3,
    };
    chains.sort((a, b) => rank[a.status] - rank[b.status] || a.chain.localeCompare(b.chain));

    return {
      generatedAt: new Date().toISOString(),
      windowMs: window,
      chains,
      totals: {
        chains: chains.length,
        sampleCount: chains.reduce((acc, c) => acc + c.sampleCount, 0),
        unhealthyChains: chains.filter((c) => c.status === 'unhealthy').length,
        degradedChains: chains.filter((c) => c.status === 'degraded').length,
      },
    };
  }

  /** Detailed dashboard for a single chain. */
  getChainDashboard(
    chain: string,
    windowMs?: number,
    buckets: number = DEFAULT_SERIES_BUCKETS,
  ): ChainLatencyDashboard {
    const id = this.normalizeChain(chain);
    const window = this.resolveWindow(windowMs);
    if (!Number.isInteger(buckets) || buckets < 1 || buckets > MAX_SERIES_BUCKETS) {
      throw new BadRequestException(`buckets must be an integer between 1 and ${MAX_SERIES_BUCKETS}`);
    }

    const inWindow = this.windowSamples(id, window);
    return {
      ...this.summarize(id, window),
      histogram: this.buildHistogram(inWindow),
      timeSeries: this.buildTimeSeries(inWindow, window, buckets),
      byOperation: this.groupByOperation(inWindow),
    };
  }

  /** Drop samples past retention. Returns the number removed. */
  prune(now: number = Date.now()): number {
    let removed = 0;
    for (const [chain, list] of this.samples) {
      const kept = list.filter((s) => s.timestamp >= now - RETENTION_MS);
      removed += list.length - kept.length;
      if (kept.length === 0) this.samples.delete(chain);
      else this.samples.set(chain, kept);
    }
    return removed;
  }

  reset(): void {
    this.samples.clear();
  }

  private windowSamples(chain: string, windowMs: number): LatencySample[] {
    const cutoff = Date.now() - windowMs;
    return (this.samples.get(chain) ?? []).filter((s) => s.timestamp >= cutoff);
  }

  private summarize(chain: string, windowMs: number): ChainLatencySummary {
    const inWindow = this.windowSamples(chain, windowMs);
    const errorCount = inWindow.filter((s) => !s.success).length;
    const errorRate = inWindow.length ? round(errorCount / inWindow.length) : 0;
    const latency = computePercentiles(inWindow.map((s) => s.latencyMs));
    const last = inWindow.length ? inWindow[inWindow.length - 1].timestamp : null;

    return {
      chain,
      status: this.classify(latency, errorRate),
      windowMs,
      sampleCount: inWindow.length,
      errorCount,
      errorRate,
      latency,
      lastSampleAt: last === null ? null : new Date(last).toISOString(),
    };
  }

  private classify(latency: LatencyPercentiles | null, errorRate: number): ChainLatencyStatus {
    if (!latency) return 'no_data';
    const { healthy, degraded } = STATUS_THRESHOLDS;
    if (latency.p95 <= healthy.p95Ms && errorRate <= healthy.errorRate) return 'healthy';
    if (latency.p95 <= degraded.p95Ms && errorRate <= degraded.errorRate) return 'degraded';
    return 'unhealthy';
  }

  private buildHistogram(samples: LatencySample[]): LatencyHistogramBucket[] {
    const counts = new Array<number>(HISTOGRAM_BOUNDS_MS.length + 1).fill(0);
    for (const { latencyMs } of samples) {
      const idx = HISTOGRAM_BOUNDS_MS.findIndex((bound) => latencyMs <= bound);
      counts[idx === -1 ? HISTOGRAM_BOUNDS_MS.length : idx] += 1;
    }
    return counts.map((count, i) => ({
      leMs: i < HISTOGRAM_BOUNDS_MS.length ? HISTOGRAM_BOUNDS_MS[i] : null,
      count,
    }));
  }

  private buildTimeSeries(
    samples: LatencySample[],
    windowMs: number,
    buckets: number,
  ): LatencyTimeSeriesPoint[] {
    const end = Date.now();
    const start = end - windowMs;
    const size = windowMs / buckets;
    const grouped: LatencySample[][] = Array.from({ length: buckets }, () => []);

    for (const s of samples) {
      const idx = Math.min(buckets - 1, Math.floor((s.timestamp - start) / size));
      if (idx >= 0) grouped[idx].push(s);
    }

    return grouped.map((group, i) => {
      const stats = computePercentiles(group.map((s) => s.latencyMs));
      const errors = group.filter((s) => !s.success).length;
      return {
        start: new Date(start + i * size).toISOString(),
        end: new Date(start + (i + 1) * size).toISOString(),
        count: group.length,
        avgMs: stats ? stats.avg : null,
        p95Ms: stats ? stats.p95 : null,
        errorRate: group.length ? round(errors / group.length) : 0,
      };
    });
  }

  private groupByOperation(
    samples: LatencySample[],
  ): Record<string, { count: number; avgMs: number; p95Ms: number }> {
    const byOp = new Map<string, number[]>();
    for (const s of samples) {
      byOp.set(s.operation, [...(byOp.get(s.operation) ?? []), s.latencyMs]);
    }
    const result: Record<string, { count: number; avgMs: number; p95Ms: number }> = {};
    for (const [op, values] of byOp) {
      const stats = computePercentiles(values)!;
      result[op] = { count: values.length, avgMs: stats.avg, p95Ms: stats.p95 };
    }
    return result;
  }
}
