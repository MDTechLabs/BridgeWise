export interface SlippageCalculationParams {
  transactionSizeUsd: number;
  poolDepthUsd: number;
  volatilityIndex?: number; // 0-1 normalized index (e.g. 0.05 for low, 0.5 for high)
  liquidityThresholdUsd?: number; // Circuit breaker threshold (default: $10,000)
}

export interface SlippageCalculationResult {
  recommendedSlippagePercent: number; // bounded between 0.1% and 3.0%
  circuitBreakerTriggered: boolean;
  reason?: string;
}

export class SlippageCalculator {
  private defaultLiquidityThreshold = 10000;

  /**
   * Calculate dynamic slippage based on transaction size, pool depth, and volatility.
   */
  public calculateSlippage(params: SlippageCalculationParams): SlippageCalculationResult {
    const threshold = params.liquidityThresholdUsd ?? this.defaultLiquidityThreshold;

    // Check circuit breaker condition
    if (params.poolDepthUsd < threshold) {
      return {
        recommendedSlippagePercent: 3.0,
        circuitBreakerTriggered: true,
        reason: `Pool depth ($${params.poolDepthUsd}) is below liquidity threshold ($${threshold}). Emergency circuit breaker triggered.`,
      };
    }

    // Base slippage is 0.5%
    let calculatedSlippage = 0.5;

    // 1. Transaction size ratio relative to pool depth
    const impactRatio = params.transactionSizeUsd / params.poolDepthUsd;
    calculatedSlippage += impactRatio * 10; // add slippage for market impact

    // 2. Adjust for market volatility if provided
    if (params.volatilityIndex) {
      calculatedSlippage += params.volatilityIndex * 2.0;
    }

    // 3. Enforce strict dynamic bounds: [0.1%, 3.0%]
    const boundedSlippage = Math.min(Math.max(calculatedSlippage, 0.1), 3.0);

    // Round to 2 decimal places
    const recommendedSlippagePercent = Math.round(boundedSlippage * 100) / 100;

    return {
      recommendedSlippagePercent,
      circuitBreakerTriggered: false,
    };
  }
}
