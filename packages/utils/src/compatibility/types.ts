import { ChainId, BridgeProvider } from '../types';

export interface TokenPair {
  sourceChain: ChainId;
  destinationChain: ChainId;
  /** Source token address or symbol */
  sourceToken: string;
  /** Destination token address or symbol */
  destinationToken: string;
  /** Token decimals on source chain */
  sourceDecimals: number;
  /** Token decimals on destination chain */
  destinationDecimals: number;
  /** Bridge provider name */
  bridgeName: BridgeProvider;
  /** Whether this pair is currently supported */
  isSupported?: boolean;
  /** Minimum transferable amount */
  minAmount?: string;
  /** Maximum transferable amount */
  maxAmount?: string;
  /** Liquidity score (0-1, where 1 is highest liquidity) */
  liquidityScore?: number;
  /** Last updated timestamp */
  lastUpdated?: number;
}

/**
 * Token identifier that can be either an address or symbol
 */
export type TokenIdentifier = string;

/**
 * Normalized token representation
 */
export interface NormalizedToken {
  /** Original identifier (address or symbol) */
  original: string;
  /** Normalized address (lowercase for EVM, canonical for Stellar) */
  normalizedAddress: string;
  /** Token symbol */
  symbol: string;
  /** Token decimals */
  decimals: number;
  /** Chain identifier */
  chain: ChainId;
  /** Whether this is a wrapped token */
  isWrapped: boolean;
  /** Original token if this is wrapped */
  underlyingToken?: string;
}

/**
 * Wrapped token mapping
 */
export interface WrappedTokenMapping {
  /** Original/native token address/symbol */
  originalToken: string;
  /** Wrapped token address/symbol */
  wrappedToken: string;
  /** Chain identifier */
  chain: ChainId;
  /** Bridge provider that issued the wrapped token */
  wrapperProvider?: string;
  /** Whether the mapping is active */
  isActive: boolean;
}

/**
 * Validation error for token pairs
 */
export interface TokenPairValidationError {
  /** Error code */
  code: TokenPairErrorCode;
  /** Human-readable error message */
  message: string;
  /** Field that caused the error */
  field: string;
  /** Additional context */
  context?: Record<string, unknown>;
  /** Suggested alternatives if available */
  suggestions?: string[];
}

/**
 * Token pair validation error codes
 */
export enum TokenPairErrorCode {
  // Chain errors
  UNSUPPORTED_SOURCE_CHAIN = 'UNSUPPORTED_SOURCE_CHAIN',
  UNSUPPORTED_DESTINATION_CHAIN = 'UNSUPPORTED_DESTINATION_CHAIN',
  UNSUPPORTED_CHAIN_PAIR = 'UNSUPPORTED_CHAIN_PAIR',

  // Token errors
  UNSUPPORTED_SOURCE_TOKEN = 'UNSUPPORTED_SOURCE_TOKEN',
  UNSUPPORTED_DESTINATION_TOKEN = 'UNSUPPORTED_DESTINATION_TOKEN',
  UNSUPPORTED_TOKEN_PAIR = 'UNSUPPORTED_TOKEN_PAIR',
  TOKEN_NOT_REGISTERED = 'TOKEN_NOT_REGISTERED',

  // Amount errors
  AMOUNT_BELOW_MINIMUM = 'AMOUNT_BELOW_MINIMUM',
  AMOUNT_ABOVE_MAXIMUM = 'AMOUNT_ABOVE_MAXIMUM',
  INSUFFICIENT_LIQUIDITY = 'INSUFFICIENT_LIQUIDITY',

  // Bridge errors
  BRIDGE_NOT_AVAILABLE = 'BRIDGE_NOT_AVAILABLE',
  BRIDGE_PAUSED = 'BRIDGE_PAUSED',
  ROUTE_NOT_SUPPORTED = 'ROUTE_NOT_SUPPORTED',

  // Wrapped token errors
  WRAPPED_TOKEN_MISMATCH = 'WRAPPED_TOKEN_MISMATCH',
  INVALID_WRAPPED_MAPPING = 'INVALID_WRAPPED_MAPPING',

  // General errors
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Token pair validation result
 */
export interface TokenPairValidationResult {
  /** Whether the token pair is valid */
  isValid: boolean;
  /** Validation errors if any */
  errors: TokenPairValidationError[];
  /** Warnings that don't prevent execution */
  warnings: TokenPairValidationError[];
  /** Normalized token pair if valid */
  normalizedPair?: TokenPair;
  /** Alternative routes if this pair is invalid */
  alternatives?: TokenPair[];
  /** Validation metadata */
  metadata?: {
    validationTime: number;
    checkedBridges: BridgeProvider[];
    liquidityScore?: number;
  };
}

/**
 * Route compatibility check request
 */
export interface RouteCompatibilityRequest {
  /** Source chain */
  sourceChain: ChainId;
  /** Destination chain */
  destinationChain: ChainId;
  /** Source token (address or symbol) */
  sourceToken: string;
  /** Destination token (address or symbol) */
  destinationToken: string;
  /** Amount to transfer (in smallest unit) */
  amount: string;
  /** Preferred bridge providers (optional) */
  preferredBridges?: BridgeProvider[];
  /** Whether to include wrapped token alternatives */
  allowWrappedTokens?: boolean;
}

/**
 * Compatible route result
 */
export interface CompatibleRoute {
  /** Token pair information */
  tokenPair: TokenPair;
  /** Bridge provider */
  bridge: BridgeProvider;
  /** Whether the route is currently available */
  isAvailable: boolean;
  /** Estimated output amount */
  estimatedOutput?: string;
  /** Fee estimate */
  estimatedFee?: string;
  /** Liquidity score */
  liquidityScore: number;
  /** Route priority (lower is better) */
  priority: number;
}

/**
 * Token metadata in the compatibility registry
 */
export interface CompatibilityTokenMetadata {
  /** Token symbol */
  symbol: string;
  /** Token name */
  name: string;
  /** Token decimals */
  decimals: number;
  /** Token address per chain */
  addresses: Partial<Record<ChainId, string>>;
  /** Whether this is a stablecoin */
  isStablecoin: boolean;
  /** Whether this is a wrapped token */
  isWrapped: boolean;
  /** Original token if wrapped */
  underlyingSymbol?: string;
  /** Supported bridge providers for this token */
  supportedBridges: BridgeProvider[];
  /** Coingecko ID for price data */
  coingeckoId?: string;
}

/**
 * Chain pair support information
 */
export interface ChainPairSupport {
  /** Source chain */
  sourceChain: ChainId;
  /** Destination chain */
  destinationChain: ChainId;
  /** Supported bridge providers for this pair */
  supportedBridges: BridgeProvider[];
  /** Whether the pair is currently active */
  isActive: boolean;
  /** Average bridge time in seconds */
  averageBridgeTime?: number;
  /** Last updated timestamp */
  lastUpdated: number;
}
