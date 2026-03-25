/**
 * Token Registry Interface
 *
 * Manages token mappings and metadata across different chains and bridges
 */

import { ChainId, BridgeProvider } from '../types';

/**
 * Token metadata
 */
export interface TokenMetadata {
  /** Token symbol (e.g., "USDC", "ETH") */
  symbol: string;
  /** Token name */
  name: string;
  /** Token decimals */
  decimals: number;
  /** Token address/ID on this chain */
  address: string;
  /** Chain identifier */
  chain: ChainId;
  /** Token logo URL */
  logoUrl?: string;
  /** Coingecko ID for price data */
  coingeckoId?: string;
}

/**
 * Cross-chain token mapping
 */
export interface TokenMapping {
  /** Source token metadata */
  sourceToken: TokenMetadata;
  /** Destination token metadata */
  destinationToken: TokenMetadata;
  /** Bridge provider handling this mapping */
  provider: BridgeProvider;
  /** Is this mapping active/supported */
  isActive: boolean;
  /** Conversion rate (accounting for decimals) */
  conversionRate: string;
  /** Minimum amount that can be transferred */
  minAmount: string;
  /** Maximum amount that can be transferred */
  maxAmount: string;
  /** Bridge-specific token ID/reference */
  bridgeTokenId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Token Registry Interface
 *
 * Provides methods to manage and query token mappings across chains
 */
export interface ITokenRegistry {
  /**
   * Register a token for a specific chain
   *
   * @param token Token metadata
   * @returns Promise that resolves when token is registered
   */
  registerToken(token: TokenMetadata): Promise<void>;

  /**
   * Register a mapping between tokens on different chains
   *
   * @param mapping Token mapping information
   * @returns Promise that resolves when mapping is registered
   */
  registerMapping(mapping: TokenMapping): Promise<void>;

  /**
   * Get token metadata for a specific chain
   *
   * @param chain Chain identifier
   * @param tokenAddress Token address or symbol
   * @returns Token metadata or null if not found
   */
  getToken(chain: ChainId, tokenAddress: string): Promise<TokenMetadata | null>;

  /**
   * Get mapping between tokens on two chains
   *
   * @param sourceChain Source chain
   * @param targetChain Destination chain
   * @param sourceToken Source token address or symbol
   * @param provider Bridge provider (optional, if not provided returns any mapping)
   * @returns Token mapping or null if not found
   */
  getMapping(
    sourceChain: ChainId,
    targetChain: ChainId,
    sourceToken: string,
    provider?: BridgeProvider,
  ): Promise<TokenMapping | null>;

  /**
   * Get all mappings for a bridge between two chains
   *
   * @param sourceChain Source chain
   * @param targetChain Destination chain
   * @param provider Bridge provider
   * @returns Array of token mappings
   */
  getMappingsForBridge(
    sourceChain: ChainId,
    targetChain: ChainId,
    provider: BridgeProvider,
  ): Promise<TokenMapping[]>;

  /**
   * Get all tokens supported on a chain
   *
   * @param chain Chain identifier
   * @returns Array of token metadata
   */
  getTokensOnChain(chain: ChainId): Promise<TokenMetadata[]>;

  /**
   * Resolve a token symbol to its addresses across chains
   *
   * @param symbol Token symbol (e.g., "USDC")
   * @param chains Optional array of chains to search
   * @returns Map of chain IDs to token addresses
   */
  resolveTokenSymbol(
    symbol: string,
    chains?: ChainId[],
  ): Promise<Record<ChainId, string>>;

  /**
   * Check if a token pair is bridgeable
   *
   * @param sourceChain Source chain
   * @param targetChain Destination chain
   * @param sourceToken Source token
   * @param provider Bridge provider (optional)
   * @returns True if token pair can be bridged
   */
  isBridgeable(
    sourceChain: ChainId,
    targetChain: ChainId,
    sourceToken: string,
    provider?: BridgeProvider,
  ): Promise<boolean>;

  /**
   * Update token mapping
   *
   * @param sourceChain Source chain
   * @param targetChain Destination chain
   * @param sourceToken Source token
   * @param provider Bridge provider
   * @param updates Partial mapping updates
   * @returns Promise that resolves when update is complete
   */
  updateMapping(
    sourceChain: ChainId,
    targetChain: ChainId,
    sourceToken: string,
    provider: BridgeProvider,
    updates: Partial<TokenMapping>,
  ): Promise<void>;

  /**
   * Batch register multiple tokens
   *
   * @param tokens Array of token metadata
   * @returns Promise that resolves when all tokens are registered
   */
  registerTokensBatch(tokens: TokenMetadata[]): Promise<void>;

  /**
   * Batch register multiple mappings
   *
   * @param mappings Array of token mappings
   * @returns Promise that resolves when all mappings are registered
   */
  registerMappingsBatch(mappings: TokenMapping[]): Promise<void>;
}
