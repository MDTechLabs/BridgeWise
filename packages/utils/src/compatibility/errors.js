"use strict";
/**
 * Compatibility Engine Error Handling
 *
 * Provides structured error handling and user-friendly error messages
 * for token pair validation failures.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompatibilityError = exports.CompatibilityErrorHandler = void 0;
const types_1 = require("./types");
/**
 * Error message templates for each error code
 */
const ERROR_MESSAGES = {
    [types_1.TokenPairErrorCode.UNSUPPORTED_SOURCE_CHAIN]: 'The source chain is not supported by this bridge',
    [types_1.TokenPairErrorCode.UNSUPPORTED_DESTINATION_CHAIN]: 'The destination chain is not supported by this bridge',
    [types_1.TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR]: 'This bridge does not support transfers between the selected chains',
    [types_1.TokenPairErrorCode.UNSUPPORTED_SOURCE_TOKEN]: 'The source token is not supported on this chain',
    [types_1.TokenPairErrorCode.UNSUPPORTED_DESTINATION_TOKEN]: 'The destination token is not supported on this chain',
    [types_1.TokenPairErrorCode.UNSUPPORTED_TOKEN_PAIR]: 'This token pair is not supported by the selected bridge',
    [types_1.TokenPairErrorCode.TOKEN_NOT_REGISTERED]: 'Token information is not available in our registry',
    [types_1.TokenPairErrorCode.AMOUNT_BELOW_MINIMUM]: 'The transfer amount is below the minimum required',
    [types_1.TokenPairErrorCode.AMOUNT_ABOVE_MAXIMUM]: 'The transfer amount exceeds the maximum allowed',
    [types_1.TokenPairErrorCode.INSUFFICIENT_LIQUIDITY]: 'Insufficient liquidity for this route at the moment',
    [types_1.TokenPairErrorCode.BRIDGE_NOT_AVAILABLE]: 'This bridge is currently unavailable',
    [types_1.TokenPairErrorCode.BRIDGE_PAUSED]: 'This bridge is temporarily paused for maintenance',
    [types_1.TokenPairErrorCode.ROUTE_NOT_SUPPORTED]: 'This route is not currently supported',
    [types_1.TokenPairErrorCode.WRAPPED_TOKEN_MISMATCH]: 'Wrapped token configuration is invalid',
    [types_1.TokenPairErrorCode.INVALID_WRAPPED_MAPPING]: 'Wrapped token mapping is not properly configured',
    [types_1.TokenPairErrorCode.VALIDATION_FAILED]: 'Route validation failed',
    [types_1.TokenPairErrorCode.UNKNOWN_ERROR]: 'An unexpected error occurred',
};
/**
 * Error handler for token pair validation
 */
class CompatibilityErrorHandler {
    /**
     * Convert validation error to user-friendly format
     */
    static toUserFriendlyError(error) {
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
    static getErrorTitle(code) {
        const titles = {
            [types_1.TokenPairErrorCode.UNSUPPORTED_SOURCE_CHAIN]: 'Unsupported Source Chain',
            [types_1.TokenPairErrorCode.UNSUPPORTED_DESTINATION_CHAIN]: 'Unsupported Destination Chain',
            [types_1.TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR]: 'Route Not Available',
            [types_1.TokenPairErrorCode.UNSUPPORTED_SOURCE_TOKEN]: 'Unsupported Source Token',
            [types_1.TokenPairErrorCode.UNSUPPORTED_DESTINATION_TOKEN]: 'Unsupported Destination Token',
            [types_1.TokenPairErrorCode.UNSUPPORTED_TOKEN_PAIR]: 'Token Pair Not Supported',
            [types_1.TokenPairErrorCode.TOKEN_NOT_REGISTERED]: 'Token Not Found',
            [types_1.TokenPairErrorCode.AMOUNT_BELOW_MINIMUM]: 'Amount Too Small',
            [types_1.TokenPairErrorCode.AMOUNT_ABOVE_MAXIMUM]: 'Amount Too Large',
            [types_1.TokenPairErrorCode.INSUFFICIENT_LIQUIDITY]: 'Low Liquidity',
            [types_1.TokenPairErrorCode.BRIDGE_NOT_AVAILABLE]: 'Bridge Unavailable',
            [types_1.TokenPairErrorCode.BRIDGE_PAUSED]: 'Bridge Paused',
            [types_1.TokenPairErrorCode.ROUTE_NOT_SUPPORTED]: 'Route Not Supported',
            [types_1.TokenPairErrorCode.WRAPPED_TOKEN_MISMATCH]: 'Wrapped Token Error',
            [types_1.TokenPairErrorCode.INVALID_WRAPPED_MAPPING]: 'Invalid Token Mapping',
            [types_1.TokenPairErrorCode.VALIDATION_FAILED]: 'Validation Failed',
            [types_1.TokenPairErrorCode.UNKNOWN_ERROR]: 'Unknown Error',
        };
        return titles[code] || 'Error';
    }
    /**
     * Get error severity
     */
    static getErrorSeverity(code) {
        const warningCodes = [
            types_1.TokenPairErrorCode.INSUFFICIENT_LIQUIDITY,
            types_1.TokenPairErrorCode.INVALID_WRAPPED_MAPPING,
        ];
        const infoCodes = [types_1.TokenPairErrorCode.BRIDGE_PAUSED];
        if (warningCodes.includes(code))
            return 'warning';
        if (infoCodes.includes(code))
            return 'info';
        return 'error';
    }
    /**
     * Get default suggestions for error codes
     */
    static getDefaultSuggestions(code) {
        const suggestions = {
            [types_1.TokenPairErrorCode.UNSUPPORTED_SOURCE_CHAIN]: [
                'Check if the source chain is supported by any bridge',
                'Consider using a different source chain',
            ],
            [types_1.TokenPairErrorCode.UNSUPPORTED_DESTINATION_CHAIN]: [
                'Check if the destination chain is supported by any bridge',
                'Consider using a different destination chain',
            ],
            [types_1.TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR]: [
                'Try a different bridge provider',
                'Consider using an intermediate chain',
                'Check supported routes in the documentation',
            ],
            [types_1.TokenPairErrorCode.UNSUPPORTED_SOURCE_TOKEN]: [
                'Check supported tokens for this chain',
                'Consider using a different token',
                'Check if the token address is correct',
            ],
            [types_1.TokenPairErrorCode.UNSUPPORTED_DESTINATION_TOKEN]: [
                'Check supported tokens for this chain',
                'Consider using a different token',
                'Check if the token address is correct',
            ],
            [types_1.TokenPairErrorCode.UNSUPPORTED_TOKEN_PAIR]: [
                'Try a different bridge provider',
                'Consider using wrapped tokens if available',
                'Check supported token pairs in the documentation',
            ],
            [types_1.TokenPairErrorCode.TOKEN_NOT_REGISTERED]: [
                'Verify the token address is correct',
                'Contact support to add this token',
            ],
            [types_1.TokenPairErrorCode.AMOUNT_BELOW_MINIMUM]: [
                'Increase the transfer amount',
                'Check the minimum amount requirement for this route',
            ],
            [types_1.TokenPairErrorCode.AMOUNT_ABOVE_MAXIMUM]: [
                'Decrease the transfer amount',
                'Split into multiple smaller transfers',
                'Check the maximum amount limit for this route',
            ],
            [types_1.TokenPairErrorCode.INSUFFICIENT_LIQUIDITY]: [
                'Try again later when liquidity improves',
                'Consider using a different route',
                'Try a smaller amount',
            ],
            [types_1.TokenPairErrorCode.BRIDGE_NOT_AVAILABLE]: [
                'Try a different bridge provider',
                'Check the bridge status page',
                'Try again later',
            ],
            [types_1.TokenPairErrorCode.BRIDGE_PAUSED]: [
                'Wait for the bridge to resume operations',
                'Try a different bridge provider',
                'Check the bridge status page for updates',
            ],
            [types_1.TokenPairErrorCode.ROUTE_NOT_SUPPORTED]: [
                'Try a different route',
                'Check supported routes in the documentation',
                'Contact support for assistance',
            ],
            [types_1.TokenPairErrorCode.WRAPPED_TOKEN_MISMATCH]: [
                'Verify the wrapped token contract address',
                'Use the native token instead if possible',
                'Check wrapped token documentation',
            ],
            [types_1.TokenPairErrorCode.INVALID_WRAPPED_MAPPING]: [
                'Contact support to report this issue',
                'Use a different token pair',
            ],
            [types_1.TokenPairErrorCode.VALIDATION_FAILED]: [
                'Check all input parameters',
                'Try again with different values',
                'Contact support if the issue persists',
            ],
            [types_1.TokenPairErrorCode.UNKNOWN_ERROR]: [
                'Try again later',
                'Contact support if the issue persists',
            ],
        };
        return suggestions[code] || ['Contact support for assistance'];
    }
    /**
     * Format validation errors for API response
     */
    static formatErrorsForApi(errors) {
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
    static createError(code, field, message, context, suggestions) {
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
    static isRecoverableError(code) {
        const recoverableCodes = [
            types_1.TokenPairErrorCode.INSUFFICIENT_LIQUIDITY,
            types_1.TokenPairErrorCode.BRIDGE_PAUSED,
            types_1.TokenPairErrorCode.AMOUNT_BELOW_MINIMUM,
            types_1.TokenPairErrorCode.AMOUNT_ABOVE_MAXIMUM,
        ];
        return recoverableCodes.includes(code);
    }
    /**
     * Get fallback bridge recommendation
     */
    static getFallbackBridge(sourceChain, destinationChain, failedBridge) {
        // Define fallback priorities
        const fallbacks = {
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
    static buildErrorReport(errors, context) {
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
    static buildSummary(context, errors) {
        const bridgeName = context.bridge || 'the selected bridge';
        const errorCodes = errors.map((e) => e.code);
        if (errorCodes.includes(types_1.TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR)) {
            return `The route from ${context.sourceChain} to ${context.destinationChain} is not supported by ${bridgeName}.`;
        }
        if (errorCodes.includes(types_1.TokenPairErrorCode.UNSUPPORTED_TOKEN_PAIR)) {
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
    static buildRecommendations(context, errors) {
        const recommendations = [];
        const errorCodes = new Set(errors.map((e) => e.code));
        // Add bridge fallback recommendation
        if (context.bridge &&
            errorCodes.has(types_1.TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR)) {
            const fallback = this.getFallbackBridge(context.sourceChain, context.destinationChain, context.bridge);
            if (fallback) {
                recommendations.push(`Try using ${fallback} instead of ${context.bridge}.`);
            }
        }
        // Add wrapped token recommendation
        if (errorCodes.has(types_1.TokenPairErrorCode.UNSUPPORTED_TOKEN_PAIR)) {
            recommendations.push('Check if wrapped token versions are available for this route.');
        }
        // Add generic recommendations
        recommendations.push('Verify all token contract addresses are correct.', 'Check the documentation for supported routes and tokens.');
        return recommendations;
    }
}
exports.CompatibilityErrorHandler = CompatibilityErrorHandler;
/**
 * Compatibility error class for throwing
 */
class CompatibilityError extends Error {
    constructor(code, field, message, suggestions, context) {
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
    toValidationError() {
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
    toUserFriendly() {
        return CompatibilityErrorHandler.toUserFriendlyError(this.toValidationError());
    }
}
exports.CompatibilityError = CompatibilityError;
//# sourceMappingURL=errors.js.map