export interface RouteQuote {
  id: string;
  provider: string;
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  inputAmount: string;
  outputAmount: string;
  outputTokenDecimals: number; // e.g., 18 for EVM, 6 for Soroban/Stellar
  gasFee: {
    amount: string;
    decimals: number;
    exchangeRateToUsd?: number; // USD per gas token unit
  };
  estimatedTimeSeconds: number;
  availableLiquidity?: string;
  status: 'success' | 'failed' | 'no_liquidity';
}

export type SortCriteria = 'highest_output' | 'lowest_gas' | 'shortest_time';

export class RouteSorter {
  /**
   * Normalize token raw amount string to a base floating number accounting for decimals.
   */
  static normalizeAmount(amountStr: string, decimals: number): number {
    const parsed = parseFloat(amountStr);
    if (isNaN(parsed) || parsed < 0) return 0;
    // If input is already formatted (e.g. "100.5"), use parsed directly.
    // If it's represented as base units (e.g. big int string), scale accordingly.
    if (amountStr.includes('.')) {
      return parsed;
    }
    return parsed / Math.pow(10, decimals);
  }

  /**
   * Calculate normalized gas fee in USD.
   */
  static calculateGasFeeUsd(gasFee: RouteQuote['gasFee']): number {
    const rawFee = this.normalizeAmount(gasFee.amount, gasFee.decimals);
    const rate = gasFee.exchangeRateToUsd ?? 1.0;
    return rawFee * rate;
  }

  /**
   * Sort routes by given criteria, safely filtering or ranking failed/zero-liquidity quotes last.
   */
  static sortRoutes(routes: RouteQuote[], criteria: SortCriteria = 'highest_output'): RouteQuote[] {
    const validRoutes: RouteQuote[] = [];
    const invalidRoutes: RouteQuote[] = [];

    for (const route of routes) {
      const liquidity = route.availableLiquidity ? parseFloat(route.availableLiquidity) : Infinity;
      if (route.status !== 'success' || liquidity <= 0) {
        invalidRoutes.push(route);
      } else {
        validRoutes.push(route);
      }
    }

    validRoutes.sort((a, b) => {
      if (criteria === 'highest_output') {
        const outA = this.normalizeAmount(a.outputAmount, a.outputTokenDecimals);
        const outB = this.normalizeAmount(b.outputAmount, b.outputTokenDecimals);
        return outB - outA;
      }

      if (criteria === 'lowest_gas') {
        const gasA = this.calculateGasFeeUsd(a.gasFee);
        const gasB = this.calculateGasFeeUsd(b.gasFee);
        return gasA - gasB;
      }

      if (criteria === 'shortest_time') {
        return a.estimatedTimeSeconds - b.estimatedTimeSeconds;
      }

      return 0;
    });

    return [...validRoutes, ...invalidRoutes];
  }
}
