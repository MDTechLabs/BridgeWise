export interface GasPrice {
  chainId: string;
  baseFee: string;
  priorityFee: string;
  maxFee: string;
  estimatedSeconds: number;
  timestamp: number;
}

export interface TokenPrice {
  tokenSymbol: string;
  tokenAddress: string;
  chainId: string;
  usdPrice: string;
  usdPrice24hChange: string;
  timestamp: number;
}

export interface CrossChainPriceMatrix {
  sourceChainId: string;
  destinationChainId: string;
  sourceGasPrice: GasPrice;
  destinationGasPrice: GasPrice;
  exchangeRate: string;
  timestamp: number;
}

export interface ChainConfig {
  chainId: string;
  chainType: 'evm' | 'soroban' | 'solana';
  rpcUrl: string;
  nativeCurrency: string;
  gasPriceEndpoint?: string;
  priceFeedEndpoint?: string;
}

export interface PriceAggregatorConfig {
  chains: ChainConfig[];
  cacheTtlMs: number;
  fallbackPrice: string;
  maxRetries: number;
  retryDelayMs: number;
}

export interface CachedPrice<T> {
  data: T;
  cachedAt: number;
  expiresAt: number;
}
