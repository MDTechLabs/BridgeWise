// Compatibility wrappers for legacy object usage
export const StellarFees = {
  estimateFees,
  calculateMinAmountOut,
  isValidAmount
};

export const LatencyEstimation = {
  estimateLatency,
  formatEstimate
};
/**
 * Fee calculation and latency estimation utilities for bridge operations
 */

/* =========================================================
   TYPES
========================================================= */

export interface FeeEstimate {
  networkFee: bigint;
  bridgeFee: bigint;
  slippageFee: bigint;
  totalFee: bigint;
  feePercentage: number;
}

export interface LatencyEstimate {
  estimatedSeconds: number;
  confidence: number;
  breakdown: {
    networkLatency: number;
    blockTime: number;
    bridgeProcessing: number;
    confirmationTime: number;
  };
}

/* =========================================================
   STELLAR FEE CONSTANTS
========================================================= */

// 1 XLM = 10,000,000 stroops
export const BASE_OPERATION_FEE = 100n;
export const TYPICAL_TX_SIZE = 2n;

export const STELLAR_TO_EVM_BRIDGE_FEE_BP = 50n; // 0.5%
export const EVM_TO_STELLAR_BRIDGE_FEE_BP = 75n; // 0.75%

export const MIN_STELLAR_AMOUNT = 1n * 10n ** 6n;
export const MIN_EVM_AMOUNT = 1n * 10n ** 6n;

/* =========================================================
   FEE CALCULATIONS
========================================================= */

export function calculateNetworkFee(
  operationCount: bigint = TYPICAL_TX_SIZE,
): bigint {
  return BASE_OPERATION_FEE * operationCount;
}

export function calculateBridgeFee(
  amount: bigint,
  isFromStellar: boolean,
): bigint {
  const feeBp = isFromStellar
    ? STELLAR_TO_EVM_BRIDGE_FEE_BP
    : EVM_TO_STELLAR_BRIDGE_FEE_BP;

  return (amount * feeBp) / 10_000n;
}

export function calculateSlippageFee(
  amount: bigint,
  slippagePercentage: number,
): bigint {
  const slippageBp = BigInt(Math.floor(slippagePercentage * 100));
  return (amount * slippageBp) / 10_000n;
}

export function estimateFees(
  inputAmount: bigint,
  isFromStellar: boolean,
  slippagePercentage = 0.5,
  operationCount: bigint = TYPICAL_TX_SIZE,
): FeeEstimate {
  const networkFee = calculateNetworkFee(operationCount);
  const bridgeFee = calculateBridgeFee(inputAmount, isFromStellar);

  const slippageFee = calculateSlippageFee(
    inputAmount - bridgeFee,
    slippagePercentage,
  );

  const totalFee = networkFee + bridgeFee + slippageFee;

  const feePercentage =
    inputAmount > 0n
      ? Number((totalFee * 10_000n) / inputAmount) / 100
      : 0;

  return {
    networkFee,
    bridgeFee,
    slippageFee,
    totalFee,
    feePercentage: Math.min(100, feePercentage),
  };
}

export function isValidAmount(
  amount: bigint,
  isStellarAmount: boolean,
): boolean {
  return amount >= (isStellarAmount ? MIN_STELLAR_AMOUNT : MIN_EVM_AMOUNT);
}

export function calculateMinAmountOut(
  outputAmount: bigint,
  slippagePercentage: number,
): bigint {
  const slippageBp = BigInt(Math.floor(slippagePercentage * 100));
  const slippageAmount = (outputAmount * slippageBp) / 10_000n;

  return outputAmount - slippageAmount;
}

/* =========================================================
   LATENCY CONSTANTS
========================================================= */

export const STELLAR_NETWORK_LATENCY = 2;
const EVM_NETWORK_LATENCY_L1 = 12;
const EVM_NETWORK_LATENCY_L2 = 2;

const BRIDGE_PROCESSING_BASE = 5;

const CONFIRMATION_TIME_L1 = 60;
const CONFIRMATION_TIME_L2 = 5;

/* =========================================================
   LATENCY HELPERS
========================================================= */

function getNetworkLatency(chain: string): number {
  switch (chain) {
    case 'stellar':
      return STELLAR_NETWORK_LATENCY;

    case 'ethereum':
      return EVM_NETWORK_LATENCY_L1;

    default:
      return EVM_NETWORK_LATENCY_L2;
  }
}

function getConfirmationTime(chain: string): number {
  return chain === 'ethereum'
    ? CONFIRMATION_TIME_L1
    : CONFIRMATION_TIME_L2;
}

/* =========================================================
   LATENCY ESTIMATION
========================================================= */

export function estimateLatency(
  sourceChain: string,
  targetChain: string,
  baseLoad = 0.5,
): LatencyEstimate {
  const loadFactor = 1 + baseLoad * 0.5;

  const networkLatency = Math.ceil(
    (getNetworkLatency(sourceChain) +
      getNetworkLatency(targetChain)) *
      loadFactor,
  );

  const confirmationTime = Math.ceil(
    (getConfirmationTime(sourceChain) +
      getConfirmationTime(targetChain)) *
      loadFactor,
  );

  const bridgeProcessing = Math.ceil(
    BRIDGE_PROCESSING_BASE * loadFactor,
  );

  const estimatedSeconds =
    networkLatency + confirmationTime + bridgeProcessing;

  const confidence = Math.max(
    40,
    95 - Math.floor(baseLoad * 30),
  );

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

export function formatEstimate(
  estimate: LatencyEstimate,
): string {
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