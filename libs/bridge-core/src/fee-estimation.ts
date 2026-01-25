/**
 * Fee calculation and estimation utilities for bridge operations
 */

export interface FeeEstimate {
  /** Network/operation fee (e.g., Stellar base fee) */
  networkFee: bigint;
  /** Bridge protocol fee */
  bridgeFee: bigint;
  /** Slippage fee */
  slippageFee: bigint;
  /** Total fees */
  totalFee: bigint;
  /** Fee percentage of input amount */
  feePercentage: number;
}

export interface LatencyEstimate {
  /** Estimated time in seconds */
  estimatedSeconds: number;
  /** Confidence level (0-100) */
  confidence: number;
  /** Detailed breakdown of latency components */
  breakdown: {
    networkLatency: number;
    blockTime: number;
    bridgeProcessing: number;
    confirmationTime: number;
  };
}

/**
 * Stellar-specific fee constants and calculations
 */
export namespace StellarFees {
  // Base fee per operation in stroops (1 XLM = 10,000,000 stroops)
  export const BASE_OPERATION_FEE = 100n; // stroops

  // Typical transaction size in operations
  export const TYPICAL_TX_SIZE = 2n; // 2 operations for a bridge tx

  // Bridge protocol fees (in basis points, 1 bp = 0.01%)
  export const STELLAR_TO_EVM_BRIDGE_FEE_BP = 50n; // 0.5%
  export const EVM_TO_STELLAR_BRIDGE_FEE_BP = 75n; // 0.75%

  // Minimum amounts to avoid dust issues
  export const MIN_STELLAR_AMOUNT = 1n * 10n ** 6n; // 1 XLM in stroops
  export const MIN_EVM_AMOUNT = 1n * 10n ** 6n; // 1 USDC/USDT in smallest units

  /**
   * Calculate network fee for Stellar transactions
   */
  export function calculateNetworkFee(operationCount: bigint = TYPICAL_TX_SIZE): bigint {
    return BASE_OPERATION_FEE * operationCount;
  }

  /**
   * Calculate bridge protocol fee based on direction and amount
   */
  export function calculateBridgeFee(amount: bigint, isFromStellar: boolean): bigint {
    const feeBp = isFromStellar ? STELLAR_TO_EVM_BRIDGE_FEE_BP : EVM_TO_STELLAR_BRIDGE_FEE_BP;
    return (amount * feeBp) / 10000n;
  }

  /**
   * Calculate slippage fee
   */
  export function calculateSlippageFee(amount: bigint, slippagePercentage: number): bigint {
    const slippageBp = BigInt(Math.floor(slippagePercentage * 100));
    return (amount * slippageBp) / 10000n;
  }

  /**
   * Full fee estimation for a bridge transaction
   */
  export function estimateFees(
    inputAmount: bigint,
    isFromStellar: boolean,
    slippagePercentage: number = 0.5,
    operationCount: bigint = TYPICAL_TX_SIZE
  ): FeeEstimate {
    const networkFee = calculateNetworkFee(operationCount);
    const bridgeFee = calculateBridgeFee(inputAmount, isFromStellar);
    const slippageFee = calculateSlippageFee(inputAmount - bridgeFee, slippagePercentage);
    const totalFee = networkFee + bridgeFee + slippageFee;

    const feePercentage = inputAmount > 0n
      ? Number((totalFee * 10000n) / inputAmount) / 100
      : 0;

    return {
      networkFee,
      bridgeFee,
      slippageFee,
      totalFee,
      feePercentage: Math.min(100, feePercentage),
    };
  }

  /**
   * Validate amount is not dust
   */
  export function isValidAmount(amount: bigint, isStellarAmount: boolean): boolean {
    const minAmount = isStellarAmount ? MIN_STELLAR_AMOUNT : MIN_EVM_AMOUNT;
    return amount >= minAmount;
  }

  /**
   * Calculate minimum output amount with slippage
   */
  export function calculateMinAmountOut(
    outputAmount: bigint,
    slippagePercentage: number
  ): bigint {
    const slippageBp = BigInt(Math.floor(slippagePercentage * 100));
    const slippageAmount = (outputAmount * slippageBp) / 10000n;
    return outputAmount - slippageAmount;
  }
}

/**
 * Latency estimation for bridge operations
 */
export namespace LatencyEstimation {
  // Baseline latencies in seconds
  const STELLAR_NETWORK_LATENCY = 2; // Stellar close time
  const EVM_NETWORK_LATENCY_L1 = 12; // Ethereum block time
  const EVM_NETWORK_LATENCY_L2 = 2; // Optimistic L2 block time

  // Bridge processing times
  const BRIDGE_PROCESSING_BASE = 5; // Base processing time
  const CONFIRMATION_TIME_L1 = 60; // 5 blocks for finality
  const CONFIRMATION_TIME_L2 = 5; // 1-2 blocks for L2

  /**
   * Get base network latency for a chain
   */
  function getNetworkLatency(chain: string): number {
    if (chain === 'stellar') return STELLAR_NETWORK_LATENCY;
    if (chain === 'ethereum') return EVM_NETWORK_LATENCY_L1;
    // Assume L2 for other EVM chains
    return EVM_NETWORK_LATENCY_L2;
  }

  /**
   * Get confirmation time requirement for a chain
   */
  function getConfirmationTime(chain: string): number {
    if (chain === 'ethereum') return CONFIRMATION_TIME_L1;
    return CONFIRMATION_TIME_L2;
  }

  /**
   * Estimate latency for a bridge route
   */
  export function estimateLatency(
    sourceChain: string,
    targetChain: string,
    baseLoad: number = 0.5 // 0-1 scale, network congestion
  ): LatencyEstimate {
    const sourceLatency = getNetworkLatency(sourceChain);
    const targetLatency = getNetworkLatency(targetChain);
    const sourceConfirmation = getConfirmationTime(sourceChain);
    const targetConfirmation = getConfirmationTime(targetChain);

    // Adjust for network load
    const loadFactor = 1 + baseLoad * 0.5; // Up to 50% additional latency under load

    const networkLatency = Math.ceil((sourceLatency + targetLatency) * loadFactor);
    const confirmationTime = Math.ceil((sourceConfirmation + targetConfirmation) * loadFactor);
    const bridgeProcessing = Math.ceil(BRIDGE_PROCESSING_BASE * loadFactor);

    const estimatedSeconds = networkLatency + confirmationTime + bridgeProcessing;
    const confidence = Math.max(40, 95 - Math.floor(baseLoad * 30)); // Confidence decreases with load

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

  /**
   * Get human-readable time estimate string
   */
  export function formatEstimate(estimate: LatencyEstimate): string {
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
}
