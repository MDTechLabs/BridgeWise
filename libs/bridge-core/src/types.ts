/**
 * Mapper: BridgeRoute → NormalizedRoute
 */
export function toNormalizedRoute(route: BridgeRoute): NormalizedRoute {
  return {
    id: route.id,
    sourceChain: route.sourceChain,
    destinationChain: route.targetChain,
    tokenIn: (route.metadata?.tokenIn as string) || 'native',
    tokenOut: (route.metadata?.tokenOut as string) || 'native',
    totalFees: route.fee,
    estimatedTime: route.estimatedTime,
    hops: route.hops || [],
    adapter: route.provider,
    metadata: {
      ...route.metadata,
      inputAmount: route.inputAmount,
      outputAmount: route.outputAmount,
      fee: route.fee,
      feePercentage: route.feePercentage,
      reliability: route.reliability,
      minAmountOut: route.minAmountOut,
      maxAmountOut: route.maxAmountOut,
      deadline: route.deadline,
      transactionData: route.transactionData,
    },
  };
}
/**
 * Supported chain identifiers
 */
export type ChainId =
  | 'ethereum'
  | 'stellar'
  | 'polygon'
  | 'arbitrum'
  | 'optimism'
  | 'base'
  | 'gnosis'
  | 'nova'
  | 'bsc'
  | 'avalanche';

/**
 * Bridge provider identifiers
 */
export type BridgeProvider = 'stellar' | 'layerzero' | 'hop';

/**
 * Fee breakdown components
 */
export interface FeeBreakdown {
  /** Network fee (in smallest unit) */
  networkFee: string;
  /** Bridge protocol fee (in smallest unit) */
  bridgeFee: string;
  /** Slippage fee (in smallest unit) */
  slippageFee?: string;
}

/**
 * Hop in a multi-hop route
 */
export interface RouteHop {
  /** Source chain for this hop */
  sourceChain: ChainId;
  /** Destination chain for this hop */
  destinationChain: ChainId;
  /** Input token address or symbol */
  tokenIn: string;
  /** Output token address or symbol */
  tokenOut: string;
  /** Fee for this hop (in smallest unit) */
  fee: string;
  /** Estimated time for this hop (in seconds) */
  estimatedTime: number;
  /** Bridge adapter used for this hop */
  adapter: BridgeProvider;
  /** Additional hop metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Unified bridge route response
 */
export interface BridgeRoute {
  /** Unique identifier for this route */
  id: string;
  /** Bridge provider name */
  provider: BridgeProvider;
  /** Source chain identifier */
  sourceChain: ChainId;
  /** Target chain identifier */
  targetChain: ChainId;
  /** Input amount (in smallest unit, e.g., wei) */
  inputAmount: string;
  /** Output amount after fees (in smallest unit) */
  outputAmount: string;
  /** Total fees charged (in smallest unit) */
  fee: string;
  /** Fee percentage (0-100) */
  feePercentage: number;
  /** Estimated time to complete bridge (in seconds) */
  estimatedTime: number;
  /** Reliability score (0-1, where 1 is most reliable) */
  reliability: number;
  /** Minimum amount out (for slippage protection) */
  minAmountOut: string;
  /** Maximum amount out */
  maxAmountOut: string;
  /** Transaction deadline timestamp (Unix epoch in seconds) */
  deadline?: number;
  /** Bridge-specific transaction data */
  transactionData?: {
    /** Contract address to interact with */
    contractAddress?: string;
    /** Encoded calldata */
    calldata?: string;
    /** Value to send with transaction */
    value?: string;
    /** Gas estimate */
    gasEstimate?: string;
  };
  /** Additional metadata */
  metadata?: {
    /** Route description */
    description?: string;
    /** Risk level (1-5, 1 being safest) */
    riskLevel?: number;
    /** Fee breakdown */
    feeBreakdown?: FeeBreakdown;
    /** Bridge-specific data */
    [key: string]: unknown;
  };
  /** Hops for multi-hop routes */
  hops?: RouteHop[];
}

/**
 * Normalized route schema for aggregation
 */
export interface NormalizedRoute {
  /** Unique identifier for this route */
  id: string;
  /** Source chain identifier */
  sourceChain: ChainId;
  /** Destination chain identifier */
  destinationChain: ChainId;
  /** Input token address or symbol */
  tokenIn: string;
  /** Output token address or symbol */
  tokenOut: string;
  /** Total fees charged (in smallest unit) */
  totalFees: string;
  /** Estimated time to complete bridge (in seconds) */
  estimatedTime: number;
  /** Array of hops in the route */
  hops: RouteHop[];
  /** Primary adapter/source identifier */
  adapter: BridgeProvider;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Request parameters for route discovery
 */
export interface RouteRequest {
  /** Source chain identifier */
  sourceChain: ChainId;
  /** Target chain identifier */
  targetChain: ChainId;
  /** Amount to bridge (in smallest unit, e.g., wei) */
  assetAmount: string;
  /** Optional: Token contract address on source chain */
  tokenAddress?: string;
  /** Optional: Slippage tolerance (0-100, default: 0.5) */
  slippageTolerance?: number;
  /** Optional: Recipient address */
  recipientAddress?: string;
}

/**
 * Aggregated routes response
 */
export interface AggregatedRoutes {
  /** Array of available routes, sorted by best option first */
  routes: NormalizedRoute[];
  /** Timestamp when routes were fetched */
  timestamp: number;
  /** Total number of providers queried */
  providersQueried: number;
  /** Number of successful responses */
  providersResponded: number;
}

/**
 * Error response from a bridge provider
 */
export interface BridgeError {
  provider: BridgeProvider;
  error: string;
  code?: string;
}

/**
 * API request for bridge provider
 */
export interface ApiRequest {
  provider: {
    name: BridgeProvider;
  };
  [key: string]: unknown;
}

/**
 * API response from bridge provider
 */
export interface ApiResponse {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Fee and slippage benchmark data
 */
export interface FeeSlippageBenchmark {
  /** Bridge name */
  bridgeName: BridgeProvider;
  /** Source chain identifier */
  sourceChain: ChainId;
  /** Destination chain identifier */
  destinationChain: ChainId;
  /** Token symbol or address */
  token: string;
  /** Average fee in token units */
  avgFee: number;
  /** Average slippage percentage */
  avgSlippagePercent: number;
  /** Timestamp of benchmark record */
  timestamp: Date;
  /** Minimum fee observed */
  minFee?: number;
  /** Maximum fee observed */
  maxFee?: number;
  /** Minimum slippage observed */
  minSlippagePercent?: number;
  /** Maximum slippage observed */
  maxSlippagePercent?: number;
  /** Sample size used for calculation */
  sampleSize?: number;
}
