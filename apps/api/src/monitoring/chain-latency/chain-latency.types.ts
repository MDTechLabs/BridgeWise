export type ChainLatencyStatus = 'healthy' | 'degraded' | 'unhealthy' | 'no_data';

export interface LatencySample {
  timestamp: number;
  latencyMs: number;
  success: boolean;
  operation: string;
}

export interface LatencyPercentiles {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface LatencyHistogramBucket {
  /** Inclusive upper bound in ms; null for the overflow bucket. */
  leMs: number | null;
  count: number;
}

export interface LatencyTimeSeriesPoint {
  start: string;
  end: string;
  count: number;
  avgMs: number | null;
  p95Ms: number | null;
  errorRate: number;
}

export interface ChainLatencySummary {
  chain: string;
  status: ChainLatencyStatus;
  windowMs: number;
  sampleCount: number;
  errorCount: number;
  errorRate: number;
  latency: LatencyPercentiles | null;
  lastSampleAt: string | null;
}

export interface ChainLatencyDashboard extends ChainLatencySummary {
  histogram: LatencyHistogramBucket[];
  timeSeries: LatencyTimeSeriesPoint[];
  byOperation: Record<string, { count: number; avgMs: number; p95Ms: number }>;
}

export interface LatencyDashboardOverview {
  generatedAt: string;
  windowMs: number;
  chains: ChainLatencySummary[];
  totals: {
    chains: number;
    sampleCount: number;
    unhealthyChains: number;
    degradedChains: number;
  };
}
