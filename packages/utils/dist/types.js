"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toNormalizedRoute = toNormalizedRoute;
/**
 * Mapper: BridgeRoute → NormalizedRoute
 */
function toNormalizedRoute(route) {
    return {
        id: route.id,
        sourceChain: route.sourceChain,
        destinationChain: route.targetChain,
        tokenIn: route.metadata?.tokenIn || 'native',
        tokenOut: route.metadata?.tokenOut || 'native',
        totalFees: route.fee,
        estimatedTime: route.estimatedTime,
        hops: route.hops || [],
        adapter: route.provider,
        metadata: {
            ...route.metadata,
            inputAmount: route.inputAmount,
            outputAmount: route.outputAmount,
            fee: route.fee,
            feePercentage: route.feePercentage,
            reliability: route.reliability,
            minAmountOut: route.minAmountOut,
            maxAmountOut: route.maxAmountOut,
            deadline: route.deadline,
            transactionData: route.transactionData,
        },
    };
}
