export interface NetworkEndpoint {
  /** Stable identifier for the endpoint. */
  id: string;
  url: string;
}

export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNAVAILABLE = 'UNAVAILABLE',
}

export interface EndpointHealth {
  id: string;
  url: string;
  status: HealthStatus;
  latencyMs: number | null;
  checkedAt: string;
  error?: string;
}

/** Probes an endpoint and resolves with its latency in ms, or rejects on failure. */
export type HealthProbe = (endpoint: NetworkEndpoint) => Promise<number>;

export interface NetworkHealthConfig {
  /** Latency (ms) at/above which an endpoint is considered DEGRADED. */
  degradedLatencyMs?: number;
}
