"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseBridgeAdapter = void 0;
/**
 * Base class providing common functionality for bridge adapters
 */
class BaseBridgeAdapter {
    /**
     * Normalize a chain identifier to the adapter's expected format
     */
    normalizeChain(chain) {
        return chain.toLowerCase();
    }
    /**
     * Generate a unique route ID
     */
    generateRouteId(provider, sourceChain, targetChain, index) {
        return `${provider}-${sourceChain}-${targetChain}-${index}-${Date.now()}`;
    }
    /**
     * Calculate fee percentage from input and output amounts
     */
    calculateFeePercentage(inputAmount, outputAmount) {
        const input = BigInt(inputAmount);
        const output = BigInt(outputAmount);
        if (input === 0n)
            return 0;
        const fee = input - output;
        const feePercentage = Number((fee * 10000n) / input) / 100;
        return Math.max(0, Math.min(100, feePercentage));
    }
}
exports.BaseBridgeAdapter = BaseBridgeAdapter;
//# sourceMappingURL=base.js.map