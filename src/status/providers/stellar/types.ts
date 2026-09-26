export type ProviderState = "operational" | "degraded" | "down";

export interface RawProviderStatus {
  providerId: string;
  state: string;
  latency?: number;
  errorRate?: number;
}

export interface NormalizedProviderStatus {
  providerId: string;
  state: ProviderState;
  latency: number;
  errorRate: number;
}

export interface HealthSummary {
  total: number;
  operational: number;
  degraded: number;
  down: number;
  healthScore: number;
}
