"use strict";
/**
 * Base Bridge Adapter Implementation
 *
 * Provides common functionality for bridge adapters with sensible defaults
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseBridgeAdapter = void 0;
const validators_1 = require("./validators");
const errors_1 = require("./errors");
/**
 * Abstract base class for bridge adapters
 *
 * Provides common functionality and enforces the BridgeAdapter interface contract
 */
class BaseBridgeAdapter {
    /**
     * Constructor
     *
     * @param config Adapter configuration
     */
    constructor(config) {
        /** Initialization state */
        this._isReady = false;
        (0, validators_1.validateAdapterConfig)(config);
        this.config = config;
    }
    // ============================================================================
    // Concrete implementations with defaults
    // ============================================================================
    getConfig() {
        return this.config;
    }
    async supportsTokenPair(sourceChain, targetChain, sourceToken, destinationToken) {
        await Promise.resolve(); // Added await to satisfy require-await
        // Default implementation: check chain support
        // Subclasses should override for better token-specific checks
        return this.supportsChainPair(sourceChain, targetChain);
    }
    async getTokenMapping(sourceChain, targetChain, sourceToken) {
        // Default implementation: no token mapping
        // Subclasses should override to provide token mappings
        return null;
    }
    async getNormalizedFee(sourceChain, targetChain, tokenAddress, amount) {
        // Default: 0.5% fee
        const fee = {
            total: '0',
            percentage: 0.5,
            lastUpdated: Date.now(),
        };
        return fee;
    }
    getSupportedSourceChains() {
        // Default: empty array
        // Subclasses should override to return supported chains
        return [];
    }
    getSupportedDestinationChains(sourceChain) {
        // Default: empty array
        // Subclasses should override to return chains supported for a given source
        return [];
    }
    async getSupportedTokens(chain) {
        await Promise.resolve(); // Added await to satisfy require-await
        // Default: empty array
        // Subclasses should override to return supported tokens
        return [];
    }
    async getHealth() {
        // Default: assume healthy if ready
        return {
            healthy: this._isReady,
            uptime: this._isReady ? 100 : 0,
            lastChecked: Date.now(),
            message: this._isReady ? 'Adapter is ready' : 'Adapter is not ready',
        };
    }
    isReady() {
        return this._isReady;
    }
    async initialize() {
        // Default: mark as ready
        this._isReady = true;
    }
    async shutdown() {
        // Default: mark as not ready
        this._isReady = false;
    }
    // ============================================================================
    // Protected utility methods
    // ============================================================================
    /**
     * Normalize chain identifier
     *
     * @protected
     */
    normalizeChain(chain) {
        return chain.toLowerCase();
    }
    /**
     * Normalize token address
     *
     * @protected
     */
    normalizeToken(token) {
        // Remove '0x' prefix if present and lowercase
        if (token.startsWith('0x') || token.startsWith('0X')) {
            return token.slice(2).toLowerCase();
        }
        return token.toLowerCase();
    }
    /**
     * Generate a unique route ID
     *
     * @protected
     */
    generateRouteId(sourceChain, targetChain, index = 0) {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 10000);
        return `${this.provider}-${sourceChain}-${targetChain}-${index}-${timestamp}-${random}`;
    }
    /**
     * Calculate fee percentage from input and output amounts
     *
     * @protected
     */
    calculateFeePercentage(inputAmount, outputAmount) {
        try {
            const input = BigInt(inputAmount);
            const output = BigInt(outputAmount);
            if (input === 0n)
                return 0;
            const fee = input - output;
            const feePercentage = Number((fee * 10000n) / input) / 100;
            return Math.max(0, Math.min(100, feePercentage));
        }
        catch (error) {
            return 0;
        }
    }
    /**
     * Calculate output amount given fee percentage
     *
     * @protected
     */
    calculateOutputAmount(inputAmount, feePercentage) {
        try {
            const input = BigInt(inputAmount);
            const fee = (input * BigInt(Math.round(feePercentage * 100))) / 10000n;
            return (input - fee).toString();
        }
        catch (error) {
            return '0';
        }
    }
    /**
     * Convert between token decimals
     *
     * @protected
     */
    convertDecimals(amount, fromDecimals, toDecimals) {
        try {
            const decimalDiff = toDecimals - fromDecimals;
            const bn = BigInt(amount);
            if (decimalDiff > 0) {
                return (bn * BigInt(10) ** BigInt(decimalDiff)).toString();
            }
            else if (decimalDiff < 0) {
                return (bn / BigInt(10) ** BigInt(-decimalDiff)).toString();
            }
            else {
                return amount;
            }
        }
        catch (error) {
            return '0';
        }
    }
    /**
     * Estimate bridge time in seconds
     *
     * @protected
     */
    estimateBridgeTime(sourceChain, targetChain) {
        // Default estimates per bridge type
        // L1 to L1: 10-30 minutes
        // L1 to L2: 2-10 minutes
        // L2 to L2: 2-5 minutes
        // Can be overridden by subclasses for more accurate estimates
        const l1Chains = new Set(['ethereum']);
        const source = l1Chains.has(sourceChain) ? 'l1' : 'l2';
        const target = l1Chains.has(targetChain) ? 'l1' : 'l2';
        if (source === 'l1' && target === 'l1') {
            return 1200; // 20 minutes average
        }
        else if ((source === 'l1' && target === 'l2') ||
            (source === 'l2' && target === 'l1')) {
            return 300; // 5 minutes average
        }
        else {
            return 180; // 3 minutes average for L2->L2
        }
    }
    /**
     * Check if adapter is initialized before operation
     *
     * @protected
     * @throws AdapterError if not ready
     */
    assertReady() {
        if (!this._isReady) {
            throw errors_1.ADAPTER_ERRORS.notReady();
        }
    }
    /**
     * Helper to handle API errors uniformly
     *
     * @protected
     */
    handleApiError(error, context) {
        if (error.response?.status === 429) {
            throw errors_1.ADAPTER_ERRORS.rateLimited(error.response.headers['retry-after']
                ? parseInt(error.response.headers['retry-after'])
                : undefined);
        }
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            throw errors_1.ADAPTER_ERRORS.timeout(context, this.config.timeout || 10000);
        }
        if (error.response?.status) {
            throw errors_1.ADAPTER_ERRORS.apiError(`${context}: ${error.message}`, error.response.status, error.response?.data);
        }
        throw errors_1.ADAPTER_ERRORS.apiError(`${context}: ${error.message || 'Unknown error'}`);
    }
    /**
     * Validate chain pair support
     *
     * @protected
     * @throws AdapterError if chain pair not supported
     */
    validateChainPair(sourceChain, targetChain) {
        if (!this.supportsChainPair(sourceChain, targetChain)) {
            throw errors_1.ADAPTER_ERRORS.unsupportedChainPair(sourceChain, targetChain);
        }
    }
}
exports.BaseBridgeAdapter = BaseBridgeAdapter;
//# sourceMappingURL=base-adapter.js.map