export interface LatencySample {
  providerId: string;
  latencyMs: number;
  timestamp: Date;
  success: boolean;
}

export interface ProviderLatencyReport {
  providerId: string;
  averageLatencyMs: number;
  p95LatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  sampleCount: number;
  errorRate: number; // percentage 0 - 100
  isDegraded: boolean;
}

export interface ObservatoryConfig {
  latencyDegradedThresholdMs?: number; // e.g. 1500ms
  errorRateThresholdPercent?: number; // e.g. 10%
  sampleWindowSize?: number; // e.g. 50 samples
}