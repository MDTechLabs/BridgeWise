export interface NormalizedQuote {
  id: string;
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  sourceToken: string;
  destinationToken: string;
  inputAmount: string;
  outputAmount: string;
  fee: {
    amount: string;
    currency: string;
    breakdown?: {
      network: string;
      bridge: string;
      gas: string;
    };
  };
  slippage: number;
  estimatedTime: number; // in seconds
  liquidity: {
    available: string;
    total: string;
    percentage: number;
  };
  route: string[];
  reliability: number; // 0-100
  timestamp: number;
  expiresAt: number;
}

export interface QuoteRefreshConfig {
  intervalMs?: number; // default 15 seconds
  autoRefresh?: boolean; // enable/disable auto-refresh
  maxRetries?: number; // maximum retry attempts
  retryDelayMs?: number; // delay between retries
  onRefresh?: (quotes: NormalizedQuote[]) => void;
  onError?: (error: Error) => void;
  onRefreshStart?: () => void;
  onRefreshEnd?: () => void;
}

export interface RefreshState {
  isRefreshing: boolean;
  lastRefreshed: Date | null;
  error: Error | null;
  retryCount: number;
  quotes: NormalizedQuote[];
}

export interface RefreshTrigger {
  type: 'interval' | 'manual' | 'parameter-change';
  timestamp: number;
  params?: Record<string, any>;
}