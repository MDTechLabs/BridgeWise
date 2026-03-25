"use strict";
/**
 * Unified Adapter Error Definitions
 *
 * Standardized error handling for bridge adapters
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADAPTER_ERRORS = exports.AdapterError = exports.AdapterErrorCode = void 0;
/**
 * Standardized adapter error codes
 */
var AdapterErrorCode;
(function (AdapterErrorCode) {
    // Configuration errors
    AdapterErrorCode["INVALID_CONFIG"] = "INVALID_CONFIG";
    AdapterErrorCode["MISSING_ENDPOINT"] = "MISSING_ENDPOINT";
    AdapterErrorCode["INVALID_AUTH"] = "INVALID_AUTH";
    // Chain/token errors
    AdapterErrorCode["UNSUPPORTED_CHAIN_PAIR"] = "UNSUPPORTED_CHAIN_PAIR";
    AdapterErrorCode["UNSUPPORTED_TOKEN"] = "UNSUPPORTED_TOKEN";
    AdapterErrorCode["INVALID_CHAIN"] = "INVALID_CHAIN";
    AdapterErrorCode["INVALID_TOKEN"] = "INVALID_TOKEN";
    // Request errors
    AdapterErrorCode["INVALID_REQUEST"] = "INVALID_REQUEST";
    AdapterErrorCode["INVALID_AMOUNT"] = "INVALID_AMOUNT";
    AdapterErrorCode["INSUFFICIENT_LIQUIDITY"] = "INSUFFICIENT_LIQUIDITY";
    AdapterErrorCode["AMOUNT_OUT_OF_RANGE"] = "AMOUNT_OUT_OF_RANGE";
    // API errors
    AdapterErrorCode["API_ERROR"] = "API_ERROR";
    AdapterErrorCode["NETWORK_ERROR"] = "NETWORK_ERROR";
    AdapterErrorCode["TIMEOUT"] = "TIMEOUT";
    AdapterErrorCode["RATE_LIMITED"] = "RATE_LIMITED";
    // Token mapping errors
    AdapterErrorCode["TOKEN_MAPPING_NOT_FOUND"] = "TOKEN_MAPPING_NOT_FOUND";
    AdapterErrorCode["INVALID_TOKEN_MAPPING"] = "INVALID_TOKEN_MAPPING";
    // Fee estimation errors
    AdapterErrorCode["FEE_ESTIMATION_FAILED"] = "FEE_ESTIMATION_FAILED";
    // General errors
    AdapterErrorCode["NOT_INITIALIZED"] = "NOT_INITIALIZED";
    AdapterErrorCode["NOT_READY"] = "NOT_READY";
    AdapterErrorCode["INTERNAL_ERROR"] = "INTERNAL_ERROR";
})(AdapterErrorCode || (exports.AdapterErrorCode = AdapterErrorCode = {}));
/**
 * Adapter-specific error class
 */
class AdapterError extends Error {
    constructor(code, message, details) {
        super(message);
        this.name = 'AdapterError';
        this.code = code;
        this.details = details;
        this.timestamp = Date.now();
        // Maintain proper prototype chain for instanceof checks
        Object.setPrototypeOf(this, AdapterError.prototype);
    }
    toJSON() {
        return {
            code: this.code,
            message: this.message,
            details: this.details,
            timestamp: this.timestamp,
        };
    }
}
exports.AdapterError = AdapterError;
/**
 * Error mapping for standardizing errors from different bridges
 */
exports.ADAPTER_ERRORS = {
    invalidConfig: (message, details) => new AdapterError(AdapterErrorCode.INVALID_CONFIG, message, details),
    unsupportedChainPair: (source, target) => new AdapterError(AdapterErrorCode.UNSUPPORTED_CHAIN_PAIR, `Chain pair ${source} -> ${target} not supported`, { source, target }),
    unsupportedToken: (token, chain) => new AdapterError(AdapterErrorCode.UNSUPPORTED_TOKEN, `Token ${token} not supported on chain ${chain}`, { token, chain }),
    invalidAmount: (message, amount) => new AdapterError(AdapterErrorCode.INVALID_AMOUNT, message, amount ? { amount } : undefined),
    insufficientLiquidity: (token, amount) => new AdapterError(AdapterErrorCode.INSUFFICIENT_LIQUIDITY, `Insufficient liquidity for ${token}: ${amount}`, { token, amount }),
    apiError: (message, statusCode, response) => new AdapterError(AdapterErrorCode.API_ERROR, message, statusCode ? { statusCode, response } : { response }),
    networkError: (message) => new AdapterError(AdapterErrorCode.NETWORK_ERROR, message),
    timeout: (operation, timeoutMs) => new AdapterError(AdapterErrorCode.TIMEOUT, `${operation} timed out after ${timeoutMs}ms`, { operation, timeoutMs }),
    rateLimited: (retryAfter) => new AdapterError(AdapterErrorCode.RATE_LIMITED, 'Rate limit exceeded', retryAfter ? { retryAfter } : undefined),
    tokenMappingNotFound: (source, destination, token) => new AdapterError(AdapterErrorCode.TOKEN_MAPPING_NOT_FOUND, `Token mapping not found: ${token} ${source} -> ${destination}`, { source, destination, token }),
    feeEstimationFailed: (reason) => new AdapterError(AdapterErrorCode.FEE_ESTIMATION_FAILED, `Fee estimation failed: ${reason}`),
    notInitialized: () => new AdapterError(AdapterErrorCode.NOT_INITIALIZED, 'Adapter not initialized. Call initialize() first.'),
    notReady: () => new AdapterError(AdapterErrorCode.NOT_READY, 'Adapter not ready. Check configuration or connection.'),
    internalError: (message, originalError) => new AdapterError(AdapterErrorCode.INTERNAL_ERROR, message, originalError
        ? { originalError: JSON.stringify(originalError) }
        : undefined),
};
//# sourceMappingURL=errors.js.map