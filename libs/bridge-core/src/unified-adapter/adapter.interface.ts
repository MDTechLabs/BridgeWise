/**
 * Core Bridge Adapter Interface
 *
 * This interface defines the unified API that all bridge adapters must implement.
 * It standardizes:
 * - Route discovery and quoting
 * - Fee normalization
 * - Token mapping across chains
 * - Chain pair support
 * - Metadata and capabilities
 */

import { BridgeRoute, RouteRequest, BridgeProvider, ChainId } from '../types';

/**
 * Normalized fee structure across all bridges
 */
export interface NormalizedFee {
  /** Total fee in token's smallest unit */
  total: string;
  /** Fee percentage (0-100) */
  percentage: number;
  /** Breakdown of fees */
  breakdown?: {
    /** Network/gas fee */
    network?: string;
    /** Bridge protocol fee */
    protocol?: string;
    /** Slippage fee */
    slippage?: string;
  };
  /** Fee token (if different from input token) */
  currency?: string;
  /** Timestamp when fee data was last updated */
  lastUpdated: number;
}

/**
 * Token mapping information for a specific bridge
 */
export interface BridgeTokenMapping {
  /** Source chain token address/symbol */
  sourceToken: string;
  /** Destination chain token address/symbol */
  destinationToken: string;
  /** Token decimals on source chain */
  sourceDecimals: number;
  /** Token decimals on destination chain */
  destinationDecimals: number;
  /** Conversion multiplier accounting for decimal differences */
  conversionMultiplier: string;
  /** Whether bridge supports this token pair */
  isSupported: boolean;
  /** Bridge-specific token ID (if applicable) */
  bridgeTokenId?: string;
  /** Minimum amount that can be bridged */
  minAmount?: string;
  /** Maximum amount that can be bridged */
  maxAmount?: string;
}

/**
 * Bridge adapter configuration
 */
export interface BridgeAdapterConfig {
  /** Unique provider identifier */
  provider: BridgeProvider;
  /** Display name */
  name: string;
  /** Bridge API endpoint(s) */
  endpoints: {
    /** Primary API endpoint */
    primary?: string;
    /** Fallback API endpoint */
    fallback?: string;
    /** RPC endpoint (if applicable) */
    rpc?: string;
  };
  /** Timeout for API calls (in milliseconds) */
  timeout?: number;
  /** Retry configuration */
  retry?: {
    /** Number of retry attempts */
    attempts: number;
    /** Delay between retries (in milliseconds) */
    initialDelayMs: number;
    /** Multiplier for exponential backoff */
    backoffMultiplier?: number;
  };
  /** Rate limiting configuration */
  rateLimit?: {
    /** Requests per second */
    requestsPerSecond: number;
    /** Window in milliseconds */
    windowMs: number;
  };
  /** API authentication (optional) */
  auth?: {
    /** API key */
    apiKey?: string;
    /** Bearer token */
    bearerToken?: string;
    /** Custom auth header */
    customHeader?: {
      name: string;
      value: string;
    };
  };
  /** Additional bridge-specific configuration */
  metadata?: Record<string, unknown>;
}

/**
 * Main Bridge Adapter Interface
 *
 * All bridge integrations must implement this interface to be compatible
 * with the BridgeWise ecosystem.
 */
export interface BridgeAdapter {
  /** Unique provider identifier */
  readonly provider: BridgeProvider;

  /** Get adapter configuration */
  getConfig(): BridgeAdapterConfig;

  /**
   * Check if this adapter supports the given chain pair
   *
   * @param sourceChain Source blockchain identifier
   * @param targetChain Destination blockchain identifier
   * @returns True if the bridge supports this chain pair
   */
  supportsChainPair(sourceChain: ChainId, targetChain: ChainId): boolean;

  /**
   * Check if this adapter supports a specific token pair
   *
   * @param sourceChain Source chain
   * @param targetChain Target chain
   * @param sourceToken Token on source chain (address or symbol)
   * @param destinationToken Token on destination chain (address or symbol)
   * @returns True if the bridge supports this token pair
   */
  supportsTokenPair(
    sourceChain: ChainId,
    targetChain: ChainId,
    sourceToken: string,
    destinationToken: string,
  ): Promise<boolean>;

  /**
   * Get token mapping information for a specific bridge route
   *
   * @param sourceChain Source chain
   * @param targetChain Target chain
   * @param sourceToken Token on source chain
   * @returns Token mapping information
   */
  getTokenMapping(
    sourceChain: ChainId,
    targetChain: ChainId,
    sourceToken: string,
  ): Promise<BridgeTokenMapping | null>;

  /**
   * Fetch available routes for the given request
   *
   * @param request Route request parameters
   * @returns Array of available routes
   */
  fetchRoutes(request: RouteRequest): Promise<BridgeRoute[]>;

  /**
   * Get normalized fee information
   *
   * @param sourceChain Source chain
   * @param targetChain Target chain
   * @param tokenAddress Token address
   * @param amount Amount in smallest unit
   * @returns Normalized fee information
   */
  getNormalizedFee(
    sourceChain: ChainId,
    targetChain: ChainId,
    tokenAddress?: string,
    amount?: string,
  ): Promise<NormalizedFee>;

  /**
   * Get list of supported source chains
   *
   * @returns Array of supported chain IDs
   */
  getSupportedSourceChains(): ChainId[];

  /**
   * Get list of supported destination chains for a given source chain
   *
   * @param sourceChain Source chain identifier
   * @returns Array of supported destination chain IDs
   */
  getSupportedDestinationChains(sourceChain: ChainId): ChainId[];

  /**
   * Get supported tokens on a specific chain
   *
   * @param chain Chain identifier
   * @returns Array of token addresses or symbols
   */
  getSupportedTokens(chain: ChainId): Promise<string[]>;

  /**
   * Get display name for this bridge provider
   *
   * @returns Human-readable provider name
   */
  getName(): string;

  /**
   * Get bridge health/status information
   *
   * @returns Health status data
   */
  getHealth(): Promise<{
    healthy: boolean;
    uptime: number;
    lastChecked: number;
    message?: string;
  }>;

  /**
   * Check if adapter is ready to use
   *
   * @returns True if adapter is initialized and ready
   */
  isReady(): boolean;

  /**
   * Initialize the adapter
   *
   * @returns Promise that resolves when initialization is complete
   */
  initialize?(): Promise<void>;

  /**
   * Cleanup resources
   *
   * @returns Promise that resolves when cleanup is complete
   */
  shutdown?(): Promise<void>;
}
