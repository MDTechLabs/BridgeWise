import { useMemo } from "react";

export interface SlippageRoute {
  inputAmount: string;
  outputAmount: string;
  expectedOutput: string;
  liquidityUSD?: number;
}

export interface SlippageResult {
  slippagePercent: number;
  minimumReceived: string;
  isHighSlippage: boolean;
  isLowLiquidity: boolean;
  hasWarning: boolean;
}

export const SLIPPAGE_WARNING_THRESHOLD = 1; // 1%
export const LOW_LIQUIDITY_THRESHOLD_USD = 10_000; // $10,000

export function useSlippage(
  route: SlippageRoute | null | undefined,
  transferAmount: string,
  warningThreshold: number = SLIPPAGE_WARNING_THRESHOLD,
  lowLiquidityThreshold: number = LOW_LIQUIDITY_THRESHOLD_USD
): SlippageResult {
  return useMemo(() => {
    const defaultResult: SlippageResult = {
      slippagePercent: 0,
      minimumReceived: "0",
      isHighSlippage: false,
      isLowLiquidity: false,
      hasWarning: false,
    };

    if (!route || !transferAmount || Number(transferAmount) <= 0) {
      return defaultResult;
    }

    const expected = parseFloat(route.expectedOutput);
    const actual = parseFloat(route.outputAmount);

    if (isNaN(expected) || isNaN(actual) || expected <= 0) {
      return defaultResult;
    }

    const slippagePercent = ((expected - actual) / expected) * 100;
    const minimumReceived = actual.toFixed(6);

    const isHighSlippage = slippagePercent > warningThreshold;
    const isLowLiquidity =
      route.liquidityUSD !== undefined &&
      route.liquidityUSD < lowLiquidityThreshold;

    return {
      slippagePercent: Math.max(0, slippagePercent),
      minimumReceived,
      isHighSlippage,
      isLowLiquidity,
      hasWarning: isHighSlippage || isLowLiquidity,
    };
  }, [route, transferAmount, warningThreshold, lowLiquidityThreshold]);
}
