export interface RouteRecommendation {
  id: string;
  sourceChain: string;
  targetChain: string;
  assetCode: string;
  recommendedRoute: string[];
  estimatedFee: string;
  estimatedTimeSeconds: number;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number; // percentage 0 - 100
  totalRequests: number;
}

export interface CacheOptions {
  ttlMs?: number; // Time-to-live in milliseconds
}