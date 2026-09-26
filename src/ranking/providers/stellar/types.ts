export interface ProviderMetrics {
  providerId: string;
  uptime: number;
  avgLatency: number;
  successRate: number;
  totalVolume: number;
}

export interface RankingWeights {
  uptime: number;
  latency: number;
  successRate: number;
  volume: number;
}

export interface ProviderRanking {
  providerId: string;
  score: number;
  rank: number;
}

export interface RankingFilter {
  minUptime?: number;
  minSuccessRate?: number;
  maxLatency?: number;
}
