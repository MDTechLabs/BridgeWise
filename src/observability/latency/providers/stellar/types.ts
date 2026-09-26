export type LatencyBucket = 'p50' | 'p75' | 'p90' | 'p95' | 'p99';

export interface LatencySample {
  timestamp: Date;
  providerId: string;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
}

export interface LatencyPercentiles {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  mean: number;
}

export interface ProviderLatencyMetrics {
  providerId: string;
  sampleCount: number;
  successCount: number;
  failureCount: number;
  percentiles: LatencyPercentiles;
  trend: 'improving' | 'stable' | 'degraded';
  degradationAlerts: DegradationAlert[];
  windowStartTime: Date;
  windowEndTime: Date;
}

export interface DegradationAlert {
  providerId: string;
  detectedAt: Date;
  currentP95Ms: number;
  baselineP95Ms: number;
  deviationPercent: number;
  severity: 'warning' | 'critical';
}

export interface LatencyObservatoryConfig {
  windowSizeMs?: number;
  degradationThresholdPercent?: number;
  criticalThresholdPercent?: number;
  minSamplesForAlert?: number;
  onDegradation?: (alert: DegradationAlert) => void;
}

export interface LatencyReport {
  reportId: string;
  generatedAt: Date;
  windowMs: number;
  providers: ProviderLatencyMetrics[];
  worstProvider: string | null;
  bestProvider: string | null;
}
