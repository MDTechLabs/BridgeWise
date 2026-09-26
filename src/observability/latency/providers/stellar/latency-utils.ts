import type { LatencySample, LatencyPercentiles } from './types';

export function computePercentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const idx = (p / 100) * (sortedValues.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] * (1 - (idx % 1)) + sortedValues[hi] * (idx % 1);
}

export function computePercentiles(samples: LatencySample[]): LatencyPercentiles {
  const latencies = samples
    .filter((s) => s.success)
    .map((s) => s.latencyMs)
    .sort((a, b) => a - b);

  if (latencies.length === 0) {
    return { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0 };
  }

  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  return {
    p50: computePercentile(latencies, 50),
    p75: computePercentile(latencies, 75),
    p90: computePercentile(latencies, 90),
    p95: computePercentile(latencies, 95),
    p99: computePercentile(latencies, 99),
    min: latencies[0],
    max: latencies[latencies.length - 1],
    mean,
  };
}

export function detectTrend(
  recent: LatencySample[],
  older: LatencySample[],
): 'improving' | 'stable' | 'degraded' {
  const recentMean = meanLatency(recent);
  const olderMean = meanLatency(older);
  if (olderMean === 0) return 'stable';
  const change = (recentMean - olderMean) / olderMean;
  if (change < -0.05) return 'improving';
  if (change > 0.1) return 'degraded';
  return 'stable';
}

function meanLatency(samples: LatencySample[]): number {
  const valid = samples.filter((s) => s.success);
  if (valid.length === 0) return 0;
  return valid.reduce((a, b) => a + b.latencyMs, 0) / valid.length;
}

export function generateReportId(): string {
  return `lat-rpt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
