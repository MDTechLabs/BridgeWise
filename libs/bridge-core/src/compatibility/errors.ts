/**
 * Compatibility Engine Error Handling
 *
 * Provides structured error handling and user-friendly error messages
 * for token pair validation failures.
 */

import { TokenPairErrorCode, TokenPairValidationError } from './types';
import { ChainId, BridgeProvider } from '../types';

/**
 * Error message templates for each error code
 */
const ERROR_MESSAGES: Record<TokenPairErrorCode, string> = {
  [TokenPairErrorCode.UNSUPPORTED_SOURCE_CHAIN]:
    'The source chain is not supported by this bridge',
  [TokenPairErrorCode.UNSUPPORTED_DESTINATION_CHAIN]:
    'The destination chain is not supported by this bridge',
  [TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR]:
    'This bridge does not support transfers between the selected chains',
  [TokenPairErrorCode.UNSUPPORTED_SOURCE_TOKEN]:
    'The source token is not supported on this chain',
  [TokenPairErrorCode.UNSUPPORTED_DESTINATION_TOKEN]:
    'The destination token is not supported on this chain',
  [TokenPairErrorCode.UNSUPPORTED_TOKEN_PAIR]:
    'This token pair is not supported by the selected bridge',
  [TokenPairErrorCode.TOKEN_NOT_REGISTERED]:
    'Token information is not available in our registry',
  [TokenPairErrorCode.AMOUNT_BELOW_MINIMUM]:
    'The transfer amount is below the minimum required',
  [TokenPairErrorCode.AMOUNT_ABOVE_MAXIMUM]:
    'The transfer amount exceeds the maximum allowed',
  [TokenPairErrorCode.INSUFFICIENT_LIQUIDITY]:
    'Insufficient liquidity for this route at the moment',
  [TokenPairErrorCode.BRIDGE_NOT_AVAILABLE]:
    'This bridge is currently unavailable',
  [TokenPairErrorCode.BRIDGE_PAUSED]:
    'This bridge is temporarily paused for maintenance',
  [TokenPairErrorCode.ROUTE_NOT_SUPPORTED]:
    'This route is not currently supported',
  [TokenPairErrorCode.WRAPPED_TOKEN_MISMATCH]:
    'Wrapped token configuration is invalid',
  [TokenPairErrorCode.INVALID_WRAPPED_MAPPING]:
    'Wrapped token mapping is not properly configured',
  [TokenPairErrorCode.VALIDATION_FAILED]: 'Route validation failed',
  [TokenPairErrorCode.UNKNOWN_ERROR]: 'An unexpected error occurred',
};

/**
 * User-friendly error message with suggestions
 */
export interface UserFriendlyError {
  /** Error title */
  title: string;
  /** Detailed message */
  message: string;
  /** Suggested actions */
  suggestions: string[];
  /** Error severity */
  severity: 'error' | 'warning' | 'info';
  /** Error code */
  code: TokenPairErrorCode;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Error handler for token pair validation
 */
export class CompatibilityErrorHandler {
  /**
   * Convert validation error to user-friendly format
   */
  static toUserFriendlyError(
    error: TokenPairValidationError,
  ): UserFriendlyError {
    const baseMessage = ERROR_MESSAGES[error.code] || error.message;

    return {
      title: this.getErrorTitle(error.code),
      message: error.message || baseMessage,
      suggestions: error.suggestions || this.getDefaultSuggestions(error.code),
      severity: this.getErrorSeverity(error.code),
      code: error.code,
      context: error.context,
    };
  }

  /**
   * Get error title based on code
   */
  private static getErrorTitle(code: TokenPairErrorCode): string {
    const titles: Record<TokenPairErrorCode, string> = {
      [TokenPairErrorCode.UNSUPPORTED_SOURCE_CHAIN]: 'Unsupported Source Chain',
      [TokenPairErrorCode.UNSUPPORTED_DESTINATION_CHAIN]:
        'Unsupported Destination Chain',
      [TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR]: 'Route Not Available',
      [TokenPairErrorCode.UNSUPPORTED_SOURCE_TOKEN]: 'Unsupported Source Token',
      [TokenPairErrorCode.UNSUPPORTED_DESTINATION_TOKEN]:
        'Unsupported Destination Token',
      [TokenPairErrorCode.UNSUPPORTED_TOKEN_PAIR]: 'Token Pair Not Supported',
      [TokenPairErrorCode.TOKEN_NOT_REGISTERED]: 'Token Not Found',
      [TokenPairErrorCode.AMOUNT_BELOW_MINIMUM]: 'Amount Too Small',
      [TokenPairErrorCode.AMOUNT_ABOVE_MAXIMUM]: 'Amount Too Large',
      [TokenPairErrorCode.INSUFFICIENT_LIQUIDITY]: 'Low Liquidity',
      [TokenPairErrorCode.BRIDGE_NOT_AVAILABLE]: 'Bridge Unavailable',
      [TokenPairErrorCode.BRIDGE_PAUSED]: 'Bridge Paused',
      [TokenPairErrorCode.ROUTE_NOT_SUPPORTED]: 'Route Not Supported',
      [TokenPairErrorCode.WRAPPED_TOKEN_MISMATCH]: 'Wrapped Token Error',
      [TokenPairErrorCode.INVALID_WRAPPED_MAPPING]: 'Invalid Token Mapping',
      [TokenPairErrorCode.VALIDATION_FAILED]: 'Validation Failed',
      [TokenPairErrorCode.UNKNOWN_ERROR]: 'Unknown Error',
    };

    return titles[code] || 'Error';
  }

  /**
   * Get error severity
   */
  private static getErrorSeverity(
    code: TokenPairErrorCode,
  ): 'error' | 'warning' | 'info' {
    const warningCodes = [
      TokenPairErrorCode.INSUFFICIENT_LIQUIDITY,
      TokenPairErrorCode.INVALID_WRAPPED_MAPPING,
    ];

    const infoCodes = [TokenPairErrorCode.BRIDGE_PAUSED];

    if (warningCodes.includes(code)) return 'warning';
    if (infoCodes.includes(code)) return 'info';
    return 'error';
  }

  /**
   * Get default suggestions for error codes
   */
  private static getDefaultSuggestions(code: TokenPairErrorCode): string[] {
    const suggestions: Record<TokenPairErrorCode, string[]> = {
      [TokenPairErrorCode.UNSUPPORTED_SOURCE_CHAIN]: [
        'Check if the source chain is supported by any bridge',
        'Consider using a different source chain',
      ],
      [TokenPairErrorCode.UNSUPPORTED_DESTINATION_CHAIN]: [
        'Check if the destination chain is supported by any bridge',
        'Consider using a different destination chain',
      ],
      [TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR]: [
        'Try a different bridge provider',
        'Consider using an intermediate chain',
        'Check supported routes in the documentation',
      ],
      [TokenPairErrorCode.UNSUPPORTED_SOURCE_TOKEN]: [
        'Check supported tokens for this chain',
        'Consider using a different token',
        'Check if the token address is correct',
      ],
      [TokenPairErrorCode.UNSUPPORTED_DESTINATION_TOKEN]: [
        'Check supported tokens for this chain',
        'Consider using a different token',
        'Check if the token address is correct',
      ],
      [TokenPairErrorCode.UNSUPPORTED_TOKEN_PAIR]: [
        'Try a different bridge provider',
        'Consider using wrapped tokens if available',
        'Check supported token pairs in the documentation',
      ],
      [TokenPairErrorCode.TOKEN_NOT_REGISTERED]: [
        'Verify the token address is correct',
        'Contact support to add this token',
      ],
      [TokenPairErrorCode.AMOUNT_BELOW_MINIMUM]: [
        'Increase the transfer amount',
        'Check the minimum amount requirement for this route',
      ],
      [TokenPairErrorCode.AMOUNT_ABOVE_MAXIMUM]: [
        'Decrease the transfer amount',
        'Split into multiple smaller transfers',
        'Check the maximum amount limit for this route',
      ],
      [TokenPairErrorCode.INSUFFICIENT_LIQUIDITY]: [
        'Try again later when liquidity improves',
        'Consider using a different route',
        'Try a smaller amount',
      ],
      [TokenPairErrorCode.BRIDGE_NOT_AVAILABLE]: [
        'Try a different bridge provider',
        'Check the bridge status page',
        'Try again later',
      ],
      [TokenPairErrorCode.BRIDGE_PAUSED]: [
        'Wait for the bridge to resume operations',
        'Try a different bridge provider',
        'Check the bridge status page for updates',
      ],
      [TokenPairErrorCode.ROUTE_NOT_SUPPORTED]: [
        'Try a different route',
        'Check supported routes in the documentation',
        'Contact support for assistance',
      ],
      [TokenPairErrorCode.WRAPPED_TOKEN_MISMATCH]: [
        'Verify the wrapped token contract address',
        'Use the native token instead if possible',
        'Check wrapped token documentation',
      ],
      [TokenPairErrorCode.INVALID_WRAPPED_MAPPING]: [
        'Contact support to report this issue',
        'Use a different token pair',
      ],
      [TokenPairErrorCode.VALIDATION_FAILED]: [
        'Check all input parameters',
        'Try again with different values',
        'Contact support if the issue persists',
      ],
      [TokenPairErrorCode.UNKNOWN_ERROR]: [
        'Try again later',
        'Contact support if the issue persists',
      ],
    };

    return suggestions[code] || ['Contact support for assistance'];
  }

  /**
   * Format validation errors for API response
   */
  static formatErrorsForApi(errors: TokenPairValidationError[]): Array<{
    code: string;
    message: string;
    field: string;
    suggestions: string[];
  }> {
    return errors.map((error) => ({
      code: error.code,
      message: error.message,
      field: error.field,
      suggestions: error.suggestions || this.getDefaultSuggestions(error.code),
    }));
  }

  /**
   * Create a validation error
   */
  static createError(
    code: TokenPairErrorCode,
    field: string,
    message?: string,
    context?: Record<string, unknown>,
    suggestions?: string[],
  ): TokenPairValidationError {
    return {
      code,
      message: message || ERROR_MESSAGES[code],
      field,
      context,
      suggestions: suggestions || this.getDefaultSuggestions(code),
    };
  }

  /**
   * Check if error is recoverable
   */
  static isRecoverableError(code: TokenPairErrorCode): boolean {
    const recoverableCodes = [
      TokenPairErrorCode.INSUFFICIENT_LIQUIDITY,
      TokenPairErrorCode.BRIDGE_PAUSED,
      TokenPairErrorCode.AMOUNT_BELOW_MINIMUM,
      TokenPairErrorCode.AMOUNT_ABOVE_MAXIMUM,
    ];

    return recoverableCodes.includes(code);
  }

  /**
   * Get fallback bridge recommendation
   */
  static getFallbackBridge(
    sourceChain: ChainId,
    destinationChain: ChainId,
    failedBridge: BridgeProvider,
  ): BridgeProvider | null {
    // Define fallback priorities
    const fallbacks: Record<BridgeProvider, BridgeProvider[]> = {
      hop: ['layerzero'],
      layerzero: ['hop'],
      stellar: ['layerzero'],
    };

    const alternatives = fallbacks[failedBridge] || [];
    // In a real implementation, check which alternatives support the chain pair
    return alternatives[0] || null;
  }

  /**
   * Build comprehensive error report
   */
  static buildErrorReport(
    errors: TokenPairValidationError[],
    context: {
      sourceChain: ChainId;
      destinationChain: ChainId;
      sourceToken: string;
      destinationToken: string;
      bridge?: BridgeProvider;
    },
  ): {
    isValid: false;
    summary: string;
    errors: UserFriendlyError[];
    recommendations: string[];
  } {
    const userFriendlyErrors = errors.map((e) => this.toUserFriendlyError(e));

    // Build summary
    const summary = this.buildSummary(context, errors);

    // Build recommendations
    const recommendations = this.buildRecommendations(context, errors);

    return {
      isValid: false,
      summary,
      errors: userFriendlyErrors,
      recommendations,
    };
  }

  /**
   * Build error summary
   */
  private static buildSummary(
    context: {
      sourceChain: ChainId;
      destinationChain: ChainId;
      sourceToken: string;
      destinationToken: string;
      bridge?: BridgeProvider;
    },
    errors: TokenPairValidationError[],
  ): string {
    const bridgeName = context.bridge || 'the selected bridge';
    const errorCodes = errors.map((e) => e.code);

    if (errorCodes.includes(TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR)) {
      return `The route from ${context.sourceChain} to ${context.destinationChain} is not supported by ${bridgeName}.`;
    }

    if (errorCodes.includes(TokenPairErrorCode.UNSUPPORTED_TOKEN_PAIR)) {
      return `The token pair ${context.sourceToken} → ${context.destinationToken} is not supported by ${bridgeName}.`;
    }

    if (errorCodes.some((code) => code.includes('BRIDGE'))) {
      return `${bridgeName} is currently unavailable for this route.`;
    }

    return `Route validation failed with ${errors.length} error(s).`;
  }

  /**
   * Build recommendations based on errors
   */
  private static buildRecommendations(
    context: {
      sourceChain: ChainId;
      destinationChain: ChainId;
      sourceToken: string;
      destinationToken: string;
      bridge?: BridgeProvider;
    },
    errors: TokenPairValidationError[],
  ): string[] {
    const recommendations: string[] = [];
    const errorCodes = new Set(errors.map((e) => e.code));

    // Add bridge fallback recommendation
    if (
      context.bridge &&
      errorCodes.has(TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR)
    ) {
      const fallback = this.getFallbackBridge(
        context.sourceChain,
        context.destinationChain,
        context.bridge,
      );
      if (fallback) {
        recommendations.push(
          `Try using ${fallback} instead of ${context.bridge}.`,
        );
      }
    }

    // Add wrapped token recommendation
    if (errorCodes.has(TokenPairErrorCode.UNSUPPORTED_TOKEN_PAIR)) {
      recommendations.push(
        'Check if wrapped token versions are available for this route.',
      );
    }

    // Add generic recommendations
    recommendations.push(
      'Verify all token contract addresses are correct.',
      'Check the documentation for supported routes and tokens.',
    );

    return recommendations;
  }
}

/**
 * Compatibility error class for throwing
 */
export class CompatibilityError extends Error {
  public readonly code: TokenPairErrorCode;
  public readonly field: string;
  public readonly suggestions: string[];
  public readonly context?: Record<string, unknown>;

  constructor(
    code: TokenPairErrorCode,
    field: string,
    message?: string,
    suggestions?: string[],
    context?: Record<string, unknown>,
  ) {
    super(message || ERROR_MESSAGES[code]);
    this.name = 'CompatibilityError';
    this.code = code;
    this.field = field;
    this.suggestions =
      suggestions || CompatibilityErrorHandler['getDefaultSuggestions'](code);
    this.context = context;
  }

  /**
   * Convert to validation error format
   */
  toValidationError(): TokenPairValidationError {
    return {
      code: this.code,
      message: this.message,
      field: this.field,
      suggestions: this.suggestions,
      context: this.context,
    };
  }

  /**
   * Convert to user-friendly format
   */
  toUserFriendly(): UserFriendlyError {
    return CompatibilityErrorHandler.toUserFriendlyError(
      this.toValidationError(),
    );
  }
}
