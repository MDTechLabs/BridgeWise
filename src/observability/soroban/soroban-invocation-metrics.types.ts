export interface SorobanInvocationSample {
  contractId: string;
  latencyMs: number;
  timestamp: Date;
  success: boolean;
}

export interface SorobanInvocationReport {
  contractId: string;
  totalInvocations: number;
  sampleCount: number;
  successCount: number;
  failureCount: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  errorRate: number; // percentage 0 - 100
  isDegraded: boolean;
}

export interface SorobanObservatoryConfig {
  latencyDegradedThresholdMs?: number; // e.g. 1500ms
  errorRateThresholdPercent?: number; // e.g. 10%
  sampleWindowSize?: number; // e.g. 50 samples
}
