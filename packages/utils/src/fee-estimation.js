"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STELLAR_NETWORK_LATENCY = exports.MIN_EVM_AMOUNT = exports.MIN_STELLAR_AMOUNT = exports.EVM_TO_STELLAR_BRIDGE_FEE_BP = exports.STELLAR_TO_EVM_BRIDGE_FEE_BP = exports.TYPICAL_TX_SIZE = exports.BASE_OPERATION_FEE = exports.LatencyEstimation = exports.StellarFees = void 0;
exports.calculateNetworkFee = calculateNetworkFee;
exports.calculateBridgeFee = calculateBridgeFee;
exports.calculateSlippageFee = calculateSlippageFee;
exports.estimateFees = estimateFees;
exports.isValidAmount = isValidAmount;
exports.calculateMinAmountOut = calculateMinAmountOut;
exports.estimateLatency = estimateLatency;
exports.formatEstimate = formatEstimate;
// Compatibility wrappers for legacy object usage
exports.StellarFees = {
    estimateFees,
    calculateMinAmountOut,
    isValidAmount,
};
exports.LatencyEstimation = {
    estimateLatency,
    formatEstimate,
};
/* =========================================================
   STELLAR FEE CONSTANTS
========================================================= */
// 1 XLM = 10,000,000 stroops
exports.BASE_OPERATION_FEE = 100n;
exports.TYPICAL_TX_SIZE = 2n;
exports.STELLAR_TO_EVM_BRIDGE_FEE_BP = 50n; // 0.5%
exports.EVM_TO_STELLAR_BRIDGE_FEE_BP = 75n; // 0.75%
exports.MIN_STELLAR_AMOUNT = 1n * 10n ** 6n;
exports.MIN_EVM_AMOUNT = 1n * 10n ** 6n;
/* =========================================================
   FEE CALCULATIONS
========================================================= */
function calculateNetworkFee(operationCount = exports.TYPICAL_TX_SIZE) {
    return exports.BASE_OPERATION_FEE * operationCount;
}
function calculateBridgeFee(amount, isFromStellar) {
    const feeBp = isFromStellar
        ? exports.STELLAR_TO_EVM_BRIDGE_FEE_BP
        : exports.EVM_TO_STELLAR_BRIDGE_FEE_BP;
    return (amount * feeBp) / 10000n;
}
function calculateSlippageFee(amount, slippagePercentage) {
    const slippageBp = BigInt(Math.floor(slippagePercentage * 100));
    return (amount * slippageBp) / 10000n;
}
function estimateFees(inputAmount, isFromStellar, slippagePercentage = 0.5, operationCount = exports.TYPICAL_TX_SIZE) {
    const networkFee = calculateNetworkFee(operationCount);
    const bridgeFee = calculateBridgeFee(inputAmount, isFromStellar);
    const slippageFee = calculateSlippageFee(inputAmount - bridgeFee, slippagePercentage);
    const totalFee = networkFee + bridgeFee + slippageFee;
    const feePercentage = inputAmount > 0n ? Number((totalFee * 10000n) / inputAmount) / 100 : 0;
    return {
        networkFee,
        bridgeFee,
        slippageFee,
        totalFee,
        feePercentage: Math.min(100, feePercentage),
    };
}
function isValidAmount(amount, isStellarAmount) {
    return amount >= (isStellarAmount ? exports.MIN_STELLAR_AMOUNT : exports.MIN_EVM_AMOUNT);
}
function calculateMinAmountOut(outputAmount, slippagePercentage) {
    const slippageBp = BigInt(Math.floor(slippagePercentage * 100));
    const slippageAmount = (outputAmount * slippageBp) / 10000n;
    return outputAmount - slippageAmount;
}
/* =========================================================
   LATENCY CONSTANTS
========================================================= */
exports.STELLAR_NETWORK_LATENCY = 2;
const EVM_NETWORK_LATENCY_L1 = 12;
const EVM_NETWORK_LATENCY_L2 = 2;
const BRIDGE_PROCESSING_BASE = 5;
const CONFIRMATION_TIME_L1 = 60;
const CONFIRMATION_TIME_L2 = 5;
/* =========================================================
   LATENCY HELPERS
========================================================= */
function getNetworkLatency(chain) {
    switch (chain) {
        case 'stellar':
            return exports.STELLAR_NETWORK_LATENCY;
        case 'ethereum':
            return EVM_NETWORK_LATENCY_L1;
        default:
            return EVM_NETWORK_LATENCY_L2;
    }
}
function getConfirmationTime(chain) {
    return chain === 'ethereum' ? CONFIRMATION_TIME_L1 : CONFIRMATION_TIME_L2;
}
/* =========================================================
   LATENCY ESTIMATION
========================================================= */
function estimateLatency(sourceChain, targetChain, baseLoad = 0.5) {
    const loadFactor = 1 + baseLoad * 0.5;
    const networkLatency = Math.ceil((getNetworkLatency(sourceChain) + getNetworkLatency(targetChain)) *
        loadFactor);
    const confirmationTime = Math.ceil((getConfirmationTime(sourceChain) + getConfirmationTime(targetChain)) *
        loadFactor);
    const bridgeProcessing = Math.ceil(BRIDGE_PROCESSING_BASE * loadFactor);
    const estimatedSeconds = networkLatency + confirmationTime + bridgeProcessing;
    const confidence = Math.max(40, 95 - Math.floor(baseLoad * 30));
    return {
        estimatedSeconds,
        confidence,
        breakdown: {
            networkLatency,
            blockTime: networkLatency / 2,
            bridgeProcessing,
            confirmationTime,
        },
    };
}
function formatEstimate(estimate) {
    const { estimatedSeconds, confidence } = estimate;
    if (estimatedSeconds < 60) {
        return `${estimatedSeconds}s (${confidence}% confidence)`;
    }
    const minutes = Math.ceil(estimatedSeconds / 60);
    if (minutes < 60) {
        return `~${minutes} min (${confidence}% confidence)`;
    }
    const hours = Math.ceil(minutes / 60);
    return `~${hours}h (${confidence}% confidence)`;
}
//# sourceMappingURL=fee-estimation.js.map