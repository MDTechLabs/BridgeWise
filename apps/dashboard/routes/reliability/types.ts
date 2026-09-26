export interface RouteReliabilityMetric {
  routeId: string;
  sourceChain: string;
  destinationChain: string;
  asset: string;
  successRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  totalTransfers: number;
  failureCount: number;
  lastUpdated: string;
}

export interface ReliabilityTrend {
  routeId: string;
  date: string;
  successRate: number;
  avgLatencyMs: number;
  transferCount: number;
}

export interface RouteFilter {
  sourceChain?: string;
  destinationChain?: string;
  asset?: string;
  minSuccessRate?: number;
}

export interface DashboardState {
  metrics: RouteReliabilityMetric[];
  trends: ReliabilityTrend[];
  filter: RouteFilter;
  loading: boolean;
  lastRefreshedAt: string;
}
