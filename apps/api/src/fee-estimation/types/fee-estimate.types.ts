/**
 * Dynamic Fee Estimation Types
 */

/**
 * Fee estimate interface
 */
export interface FeeEstimate {
  id: string;
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  token: string | null;
  amount: number | null;
  totalFee: number;
  gasFee: number;
  bridgeFee: number;
  liquidityFee: number;
  protocolFee: number;
  gasPriceGwei: number | null;
  gasLimit: number | null;
  networkCongestion: number | null;
  feeToken: string;
  feeTokenPriceUsd: number | null;
  totalFeeUsd: number | null;
  isFallback: boolean;
  fallbackReason: string | null;
  estimatedDurationSeconds: number | null;
  lastUpdated: Date;
  expiresAt: Date;
  cacheTtlSeconds: number;
}

/**
 * Fee breakdown components
 */
export interface FeeBreakdown {
  gasFee: number;
  bridgeFee: number;
  liquidityFee: number;
  protocolFee: number;
}

/**
 * Gas price information
 */
export interface GasPriceInfo {
  chain: string;
  gasPriceGwei: number;
  baseFeeGwei?: number;
  priorityFeeGwei?: number;
  congestionLevel: number;
  recommendedGasLimit: number;
  lastUpdated: Date;
  expiresAt: Date;
}

/**
 * Network congestion status
 */
export interface NetworkCongestion {
  chain: string;
  congestionLevel: number;
  status: 'low' | 'moderate' | 'high' | 'severe';
  averageGasPriceGwei: number;
  pendingTransactions: number;
  averageBlockTimeSeconds: number;
  lastUpdated: Date;
}

/**
 * Bridge fee configuration
 */
export interface BridgeFeeConfig {
  bridgeName: string;
  baseFee: number;
  percentageFee: number;
  minFee: number;
  maxFee: number;
  supportsDynamicFees: boolean;
  feeToken: string;
}

/**
 * Options for useFeeEstimate hook
 */
export interface UseFeeEstimateOptions {
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  token?: string;
  amount?: number;
  includeUsd?: boolean;
  refreshInterval?: number;
  enabled?: boolean;
}

/**
 * Result from useFeeEstimate hook
 */
export interface UseFeeEstimateResult {
  estimate: FeeEstimate | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  isStale: boolean;
}

/**
 * Options for useFeeComparison hook
 */
export interface UseFeeComparisonOptions {
  sourceChain: string;
  destinationChain: string;
  token?: string;
  amount?: number;
  bridges?: string[];
  enabled?: boolean;
}

/**
 * Result from useFeeComparison hook
 */
export interface UseFeeComparisonResult {
  comparisons: FeeComparison[];
  cheapest: FeeComparison | null;
  fastest: FeeComparison | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Fee comparison item
 */
export interface FeeComparison {
  bridgeName: string;
  totalFee: number;
  totalFeeUsd?: number;
  breakdown: FeeBreakdown;
  isFallback: boolean;
  rank: number;
  savingsPercent: number;
}

/**
 * Options for useGasPrice hook
 */
export interface UseGasPriceOptions {
  chain: string;
  refreshInterval?: number;
  enabled?: boolean;
}

/**
 * Result from useGasPrice hook
 */
export interface UseGasPriceResult {
  gasPrice: GasPriceInfo | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Fee estimation strategy
 */
export type FeeEstimationStrategy = 'conservative' | 'average' | 'aggressive';

/**
 * Fee estimate request
 */
export interface FeeEstimateRequest {
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  token?: string;
  amount?: number;
  strategy?: FeeEstimationStrategy;
}

/**
 * Fee cache entry
 */
export interface FeeCacheEntry {
  estimate: FeeEstimate;
  timestamp: number;
  ttl: number;
}

/**
 * Fee estimation error
 */
export interface FeeEstimationError {
  code: string;
  message: string;
  bridgeName?: string;
  chain?: string;
  fallbackUsed: boolean;
}

/**
 * Liquidity pool information for fee calculation
 */
export interface LiquidityPoolInfo {
  poolAddress: string;
  tokenA: string;
  tokenB: string;
  reserveA: number;
  reserveB: number;
  totalLiquidity: number;
  feeTier: number;
  priceImpact: number;
}
