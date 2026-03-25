"use strict";
/**
 * Validation utilities for adapter configuration and data
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAdapterConfig = validateAdapterConfig;
exports.validateTokenMapping = validateTokenMapping;
exports.validateTokenMetadata = validateTokenMetadata;
exports.isValidChainId = isValidChainId;
exports.validateAmount = validateAmount;
exports.validateFeePercentage = validateFeePercentage;
const errors_1 = require("./errors");
/**
 * Validate bridge adapter configuration
 *
 * @param config Configuration to validate
 * @throws AdapterError if configuration is invalid
 */
function validateAdapterConfig(config) {
    // Check required fields
    if (!config.provider) {
        throw errors_1.ADAPTER_ERRORS.invalidConfig('Missing provider identifier');
    }
    if (!config.name || config.name.trim().length === 0) {
        throw errors_1.ADAPTER_ERRORS.invalidConfig('Missing or empty provider name');
    }
    if (!config.endpoints) {
        throw errors_1.ADAPTER_ERRORS.invalidConfig('Missing endpoints configuration');
    }
    if (!config.endpoints.primary && !config.endpoints.fallback) {
        throw errors_1.ADAPTER_ERRORS.invalidConfig('Must specify at least one endpoint (primary or fallback)');
    }
    // Validate endpoint URLs
    if (config.endpoints.primary) {
        validateUrl(config.endpoints.primary, 'Primary endpoint');
    }
    if (config.endpoints.fallback) {
        validateUrl(config.endpoints.fallback, 'Fallback endpoint');
    }
    if (config.endpoints.rpc) {
        validateUrl(config.endpoints.rpc, 'RPC endpoint');
    }
    // Validate timeout
    if (config.timeout !== undefined && config.timeout < 100) {
        throw errors_1.ADAPTER_ERRORS.invalidConfig('Timeout must be at least 100ms');
    }
    // Validate retry configuration
    if (config.retry) {
        if (config.retry.attempts < 0) {
            throw errors_1.ADAPTER_ERRORS.invalidConfig('Retry attempts must be non-negative');
        }
        if (config.retry.initialDelayMs < 0) {
            throw errors_1.ADAPTER_ERRORS.invalidConfig('Retry initial delay must be non-negative');
        }
        if (config.retry.backoffMultiplier !== undefined &&
            config.retry.backoffMultiplier <= 0) {
            throw errors_1.ADAPTER_ERRORS.invalidConfig('Backoff multiplier must be positive');
        }
    }
    // Validate rate limit configuration
    if (config.rateLimit) {
        if (config.rateLimit.requestsPerSecond <= 0) {
            throw errors_1.ADAPTER_ERRORS.invalidConfig('Requests per second must be positive');
        }
        if (config.rateLimit.windowMs <= 0) {
            throw errors_1.ADAPTER_ERRORS.invalidConfig('Window must be positive');
        }
    }
}
/**
 * Validate a token mapping
 *
 * @param mapping Mapping to validate
 * @throws AdapterError if mapping is invalid
 */
function validateTokenMapping(mapping) {
    // Validate source token
    if (!mapping.sourceToken) {
        throw errors_1.ADAPTER_ERRORS.invalidConfig('Missing source token');
    }
    validateTokenMetadata(mapping.sourceToken, 'Source token');
    // Validate destination token
    if (!mapping.destinationToken) {
        throw errors_1.ADAPTER_ERRORS.invalidConfig('Missing destination token');
    }
    validateTokenMetadata(mapping.destinationToken, 'Destination token');
    // Validate conversion rate
    if (!mapping.conversionRate) {
        throw errors_1.ADAPTER_ERRORS.invalidConfig('Missing conversion rate');
    }
    try {
        const rate = BigInt(mapping.conversionRate);
        if (rate <= 0n) {
            throw new Error('Conversion rate must be positive');
        }
    }
    catch (error) {
        throw errors_1.ADAPTER_ERRORS.invalidConfig(`Invalid conversion rate: ${String(error)}`);
    }
    // Validate amounts
    if (mapping.minAmount) {
        try {
            const min = BigInt(mapping.minAmount);
            if (min < 0n) {
                throw new Error('Minimum amount must be non-negative');
            }
        }
        catch (error) {
            throw errors_1.ADAPTER_ERRORS.invalidConfig(`Invalid min amount: ${String(error)}`);
        }
    }
    if (mapping.maxAmount) {
        try {
            const max = BigInt(mapping.maxAmount);
            if (max < 0n) {
                throw new Error('Maximum amount must be non-negative');
            }
        }
        catch (error) {
            throw errors_1.ADAPTER_ERRORS.invalidConfig(`Invalid max amount: ${String(error)}`);
        }
    }
    // Validate min <= max if both present
    if (mapping.minAmount && mapping.maxAmount) {
        const min = BigInt(mapping.minAmount);
        const max = BigInt(mapping.maxAmount);
        if (min > max) {
            throw errors_1.ADAPTER_ERRORS.invalidConfig('Minimum amount cannot exceed maximum amount');
        }
    }
}
/**
 * Validate token metadata
 *
 * @param token Token metadata to validate
 * @param context Context for error messages
 * @throws AdapterError if metadata is invalid
 */
function validateTokenMetadata(token, context = 'Token') {
    if (!token || typeof token !== 'object') {
        throw errors_1.ADAPTER_ERRORS.invalidConfig(`Missing ${context}`);
    }
    const t = token;
    if (!t.symbol ||
        typeof t.symbol !== 'string' ||
        t.symbol.trim().length === 0) {
        throw errors_1.ADAPTER_ERRORS.invalidConfig(`${context}: Missing or empty symbol`);
    }
    if (!t.name || typeof t.name !== 'string' || t.name.trim().length === 0) {
        throw errors_1.ADAPTER_ERRORS.invalidConfig(`${context}: Missing or empty name`);
    }
    if (typeof t.decimals !== 'number' || t.decimals < 0 || t.decimals > 77) {
        throw errors_1.ADAPTER_ERRORS.invalidConfig(`${context}: Invalid decimals (must be 0-77)`);
    }
    if (!t.address ||
        typeof t.address !== 'string' ||
        t.address.trim().length === 0) {
        throw errors_1.ADAPTER_ERRORS.invalidConfig(`${context}: Missing or empty address`);
    }
    if (!t.chain || !isValidChainId(t.chain)) {
        throw errors_1.ADAPTER_ERRORS.invalidConfig(`${context}: Invalid chain identifier`);
    }
}
/**
 * Validate chain identifier
 *
 * @param chain Chain to validate
 * @returns True if chain is valid
 */
function isValidChainId(chain) {
    if (typeof chain !== 'string')
        return false;
    const validChains = [
        'ethereum',
        'stellar',
        'polygon',
        'arbitrum',
        'optimism',
        'base',
        'gnosis',
        'nova',
        'bsc',
        'avalanche',
    ];
    return validChains.includes(chain);
}
/**
 * Validate URL format
 *
 * @param url URL to validate
 * @param context Context for error messages
 * @throws AdapterError if URL is invalid
 */
function validateUrl(url, context) {
    try {
        new URL(url);
    }
    catch {
        throw errors_1.ADAPTER_ERRORS.invalidConfig(`${context}: Invalid URL format`);
    }
}
/**
 * Validate amount format (must be valid big integer string)
 *
 * @param amount Amount to validate
 * @param context Context for error messages
 * @throws AdapterError if amount is invalid
 */
function validateAmount(amount, context = 'Amount') {
    if (!amount) {
        throw errors_1.ADAPTER_ERRORS.invalidAmount(`${context} is required`);
    }
    try {
        const bn = BigInt(amount);
        if (bn < 0n) {
            throw errors_1.ADAPTER_ERRORS.invalidAmount(`${context} must be non-negative`);
        }
    }
    catch (error) {
        throw errors_1.ADAPTER_ERRORS.invalidAmount(`${context} must be a valid number: ${String(error)}`);
    }
}
/**
 * Validate fee percentage
 *
 * @param fee Fee percentage to validate (0-100)
 * @param context Context for error messages
 * @throws AdapterError if fee is invalid
 */
function validateFeePercentage(fee, context = 'Fee') {
    if (fee < 0 || fee > 100) {
        throw errors_1.ADAPTER_ERRORS.invalidConfig(`${context} must be between 0 and 100`);
    }
}
//# sourceMappingURL=validators.js.map