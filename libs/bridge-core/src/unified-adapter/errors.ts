/**
 * Unified Adapter Error Definitions
 *
 * Standardized error handling for bridge adapters
 */

/**
 * Standardized adapter error codes
 */
export enum AdapterErrorCode {
  // Configuration errors
  INVALID_CONFIG = 'INVALID_CONFIG',
  MISSING_ENDPOINT = 'MISSING_ENDPOINT',
  INVALID_AUTH = 'INVALID_AUTH',

  // Chain/token errors
  UNSUPPORTED_CHAIN_PAIR = 'UNSUPPORTED_CHAIN_PAIR',
  UNSUPPORTED_TOKEN = 'UNSUPPORTED_TOKEN',
  INVALID_CHAIN = 'INVALID_CHAIN',
  INVALID_TOKEN = 'INVALID_TOKEN',

  // Request errors
  INVALID_REQUEST = 'INVALID_REQUEST',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  INSUFFICIENT_LIQUIDITY = 'INSUFFICIENT_LIQUIDITY',
  AMOUNT_OUT_OF_RANGE = 'AMOUNT_OUT_OF_RANGE',

  // API errors
  API_ERROR = 'API_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',

  // Token mapping errors
  TOKEN_MAPPING_NOT_FOUND = 'TOKEN_MAPPING_NOT_FOUND',
  INVALID_TOKEN_MAPPING = 'INVALID_TOKEN_MAPPING',

  // Fee estimation errors
  FEE_ESTIMATION_FAILED = 'FEE_ESTIMATION_FAILED',

  // General errors
  NOT_INITIALIZED = 'NOT_INITIALIZED',
  NOT_READY = 'NOT_READY',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Standard error information
 */
export interface ErrorInfo {
  code: AdapterErrorCode;
  message: string;
  details?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Adapter-specific error class
 */
export class AdapterError extends Error implements ErrorInfo {
  code: AdapterErrorCode;
  details?: Record<string, unknown>;
  timestamp: number;

  constructor(
    code: AdapterErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    this.details = details;
    this.timestamp = Date.now();

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, AdapterError.prototype);
  }

  toJSON(): ErrorInfo {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Error mapping for standardizing errors from different bridges
 */
export const ADAPTER_ERRORS = {
  invalidConfig: (message: string, details?: Record<string, unknown>) =>
    new AdapterError(AdapterErrorCode.INVALID_CONFIG, message, details),

  unsupportedChainPair: (source: string, target: string) =>
    new AdapterError(
      AdapterErrorCode.UNSUPPORTED_CHAIN_PAIR,
      `Chain pair ${source} -> ${target} not supported`,
      { source, target },
    ),

  unsupportedToken: (token: string, chain: string) =>
    new AdapterError(
      AdapterErrorCode.UNSUPPORTED_TOKEN,
      `Token ${token} not supported on chain ${chain}`,
      { token, chain },
    ),

  invalidAmount: (message: string, amount?: string) =>
    new AdapterError(
      AdapterErrorCode.INVALID_AMOUNT,
      message,
      amount ? { amount } : undefined,
    ),

  insufficientLiquidity: (token: string, amount: string) =>
    new AdapterError(
      AdapterErrorCode.INSUFFICIENT_LIQUIDITY,
      `Insufficient liquidity for ${token}: ${amount}`,
      { token, amount },
    ),

  apiError: (message: string, statusCode?: number, response?: unknown) =>
    new AdapterError(
      AdapterErrorCode.API_ERROR,
      message,
      statusCode ? { statusCode, response } : { response },
    ),

  networkError: (message: string) =>
    new AdapterError(AdapterErrorCode.NETWORK_ERROR, message),

  timeout: (operation: string, timeoutMs: number) =>
    new AdapterError(
      AdapterErrorCode.TIMEOUT,
      `${operation} timed out after ${timeoutMs}ms`,
      { operation, timeoutMs },
    ),

  rateLimited: (retryAfter?: number) =>
    new AdapterError(
      AdapterErrorCode.RATE_LIMITED,
      'Rate limit exceeded',
      retryAfter ? { retryAfter } : undefined,
    ),

  tokenMappingNotFound: (source: string, destination: string, token: string) =>
    new AdapterError(
      AdapterErrorCode.TOKEN_MAPPING_NOT_FOUND,
      `Token mapping not found: ${token} ${source} -> ${destination}`,
      { source, destination, token },
    ),

  feeEstimationFailed: (reason: string) =>
    new AdapterError(
      AdapterErrorCode.FEE_ESTIMATION_FAILED,
      `Fee estimation failed: ${reason}`,
    ),

  notInitialized: () =>
    new AdapterError(
      AdapterErrorCode.NOT_INITIALIZED,
      'Adapter not initialized. Call initialize() first.',
    ),

  notReady: () =>
    new AdapterError(
      AdapterErrorCode.NOT_READY,
      'Adapter not ready. Check configuration or connection.',
    ),

  internalError: (message: string, originalError?: unknown) =>
    new AdapterError(
      AdapterErrorCode.INTERNAL_ERROR,
      message,
      originalError ? { originalError: String(originalError) } : undefined,
    ),
};
