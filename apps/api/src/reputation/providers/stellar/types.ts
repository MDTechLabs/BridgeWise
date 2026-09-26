export interface ProviderHistoryEntry {
  timestamp: Date;
  responseTimeMs: number;
  success: boolean;
  errorCode?: string;
  transactionVolume: number;
  feeAccuracy: number;     // 0–1: how close quoted fee was to actual
  slippageActual: number;  // actual slippage %
}

export interface ReputationScore {
  providerId: string;
  overall: number;          // 0–100
  reliability: number;      // 0–100 based on success rate
  performance: number;      // 0–100 based on response time
  feeAccuracy: number;      // 0–100
  slippageControl: number;  // 0–100
  calculatedAt: Date;
}

export interface TrendReport {
  providerId: string;
  period: 'daily' | 'weekly' | 'monthly';
  dataPoints: {
    date: Date;
    score: number;
    successRate: number;
    avgResponseTimeMs: number;
  }[];
  trend: 'improving' | 'stable' | 'degrading';
  percentageChange: number;
  generatedAt: Date;
}

export interface ProviderRecord {
  providerId: string;
  history: ProviderHistoryEntry[];
  currentScore: ReputationScore | null;
  lastUpdated: Date;
}