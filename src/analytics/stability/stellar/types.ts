export interface RoutePerformanceRecord {
  routeId: string;
  latency: number;      // milliseconds
  success: boolean;
  timestamp: number;
}

export interface RouteStabilityResult {
  routeId: string;
  totalSamples: number;
  averageLatency: number;
  latencyVariance: number;
  successRate: number;
  stabilityScore: number;
}