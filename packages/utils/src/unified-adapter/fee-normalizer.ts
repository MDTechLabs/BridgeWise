/**
 * Fee Normalization Utilities
 *
 * Standardizes fee data across different bridge providers
 */

import { NormalizedFee } from './adapter.interface';
import { BridgeRoute } from '../types';

/**
 * Fee source identifier
 */
export type FeeSource = 'network' | 'protocol' | 'slippage' | 'total';

/**
 * Normalized fee data
 */
export interface NormalizedFeeData {
  /** Total fee */
  total: string;
  /** Fee percentage */
  percentage: number;
  /** Network fee */
  networkFee?: string;
  /** Protocol fee */
  protocolFee?: string;
  /** Slippage fee */
  slippageFee?: string;
  /** Timestamp */
  timestamp: number;
}

/**
 * Fee normalization utilities
 */
export class FeeNormalizer {
  /**
   * Normalize fees from a bridge route
   *
   * @param route Bridge route
   * @returns Normalized fee data
   */
  static normalizeRoutesFees(route: BridgeRoute): NormalizedFeeData {
    const fees = route.metadata?.feeBreakdown;

    return {
      total: route.fee,
      percentage: route.feePercentage,
      networkFee: fees?.networkFee,
      protocolFee: fees?.bridgeFee,
      slippageFee: fees?.slippageFee,
      timestamp: Date.now(),
    };
  }

  /**
   * Calculate total fee from components
   *
   * @param components Fee components
   * @returns Total fee as string
   */
  static calculateTotalFee(components: {
    networkFee?: string;
    protocolFee?: string;
    slippageFee?: string;
  }): string {
    let total = 0n;

    if (components.networkFee) {
      total += BigInt(components.networkFee);
    }
    if (components.protocolFee) {
      total += BigInt(components.protocolFee);
    }
    if (components.slippageFee) {
      total += BigInt(components.slippageFee);
    }

    return total.toString();
  }

  /**
   * Calculate fee percentage
   *
   * @param inputAmount Input amount
   * @param fee Fee amount
   * @returns Fee percentage (0-100)
   */
  static calculateFeePercentage(inputAmount: string, fee: string): number {
    try {
      const input = BigInt(inputAmount);
      const feeAmount = BigInt(fee);

      if (input === 0n) return 0;

      const percentage = Number((feeAmount * 10000n) / input) / 100;
      return Math.max(0, Math.min(100, percentage));
    } catch {
      return 0;
    }
  }

  /**
   * Convert fee percentage to amount
   *
   * @param amount Base amount
   * @param percentage Fee percentage
   * @returns Fee amount as string
   */
  static convertPercentageToAmount(amount: string, percentage: number): string {
    try {
      const bn = BigInt(amount);
      const fee = (bn * BigInt(Math.round(percentage * 100))) / 10000n;
      return fee.toString();
    } catch {
      return '0';
    }
  }

  /**
   * Compare fees between routes
   *
   * @param route1 First route
   * @param route2 Second route
   * @returns Negative if route1 has lower fees, positive if route2 has lower fees, 0 if equal
   */
  static compareRoutesFees(route1: BridgeRoute, route2: BridgeRoute): number {
    try {
      const fee1 = BigInt(route1.fee);
      const fee2 = BigInt(route2.fee);

      if (fee1 < fee2) return -1;
      if (fee1 > fee2) return 1;
      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Calculate effective rate (output / input)
   *
   * @param inputAmount Input amount
   * @param outputAmount Output amount
   * @returns Effective rate as a decimal string
   */
  static calculateEffectiveRate(
    inputAmount: string,
    outputAmount: string,
  ): string {
    try {
      const input = BigInt(inputAmount);
      const output = BigInt(outputAmount);

      if (input === 0n) return '0';

      // Calculate rate with 18 decimal places of precision
      const rate = (output * BigInt(10) ** BigInt(18)) / input;
      return rate.toString();
    } catch {
      return '0';
    }
  }

  /**
   * Normalize bridge routes by fees
   *
   * @param routes Routes to normalize
   * @returns Routes sorted by fee (lowest first)
   */
  static normalizeRoutesByFees(routes: BridgeRoute[]): BridgeRoute[] {
    return [...routes].sort((a, b) => this.compareRoutesFees(a, b));
  }

  /**
   * Calculate average fee across routes
   *
   * @param routes Routes to analyze
   * @returns Average fee as string
   */
  static calculateAverageFee(routes: BridgeRoute[]): string {
    if (routes.length === 0) return '0';

    let total = 0n;
    for (const route of routes) {
      total += BigInt(route.fee);
    }

    return (total / BigInt(routes.length)).toString();
  }

  /**
   * Normalize fee data for aggregation
   *
   * @param routes Routes with potentially different fee structures
   * @returns Array of normalized fee data
   */
  static aggregateFeesAcquiredBridges(
    routes: BridgeRoute[],
  ): NormalizedFeeData[] {
    return routes.map((route) => this.normalizeRoutesFees(route));
  }

  /**
   * Calculate fee savings between two routes
   *
   * @param cheaperRoute Route with lower fees
   * @param expensiveRoute Route with higher fees
   * @returns Savings in smallest unit and percentage
   */
  static calculateFeeSavings(
    cheaperRoute: BridgeRoute,
    expensiveRoute: BridgeRoute,
  ): { absoluteSavings: string; percentageSavings: number } {
    try {
      const cheaper = BigInt(cheaperRoute.fee);
      const expensive = BigInt(expensiveRoute.fee);
      const absoluteSavings = expensive - cheaper;

      const percentageSavings =
        Number((absoluteSavings * 10000n) / expensive) / 100;

      return {
        absoluteSavings: absoluteSavings.toString(),
        percentageSavings: Math.max(0, Math.min(100, percentageSavings)),
      };
    } catch {
      return {
        absoluteSavings: '0',
        percentageSavings: 0,
      };
    }
  }

  /**
   * Estimate slippage from routes
   *
   * @param inputAmount Input amount
   * @param outputAmount Output amount
   * @param marketRate Current market rate (optional)
   * @returns Slippage percentage
   */
  static estimateSlippage(
    inputAmount: string,
    outputAmount: string,
    marketRate?: string,
  ): number {
    try {
      const input = BigInt(inputAmount);
      const output = BigInt(outputAmount);

      if (input === 0n) return 0;

      if (marketRate) {
        const rate = BigInt(marketRate);
        const expectedOutput = (input * rate) / BigInt(10) ** BigInt(18);
        const slippage =
          Number(((expectedOutput - output) * 10000n) / expectedOutput) / 100;
        return Math.max(0, slippage);
      }

      // Default: assume 0.5% base slippage if market rate not provided
      return 0.5;
    } catch {
      return 0;
    }
  }

  /**
   * Group routes by fee ranges
   *
   * @param routes Routes to group
   * @param rangeCount Number of fee ranges
   * @returns Map of fee ranges to routes
   */
  static groupRoutesByFeeRange(
    routes: BridgeRoute[],
    rangeCount: number = 5,
  ): Map<string, BridgeRoute[]> {
    if (routes.length === 0) return new Map();

    // Find min and max fees
    let minFee = BigInt(routes[0].fee);
    let maxFee = BigInt(routes[0].fee);

    for (const route of routes) {
      const fee = BigInt(route.fee);
      if (fee < minFee) minFee = fee;
      if (fee > maxFee) maxFee = fee;
    }

    // Calculate range size
    const rangeSize = (maxFee - minFee) / BigInt(rangeCount);

    // Group routes
    const groups = new Map<string, BridgeRoute[]>();

    for (const route of routes) {
      const fee = BigInt(route.fee);
      let rangeIndex: number;

      if (rangeSize === 0n) {
        rangeIndex = 0;
      } else {
        rangeIndex = Math.min(
          rangeCount - 1,
          Number((fee - minFee) / rangeSize),
        );
      }

      const rangeStart = minFee + BigInt(rangeIndex) * rangeSize;
      const rangeEnd = rangeStart + rangeSize;
      const rangeKey = `${rangeStart.toString()}-${rangeEnd.toString()}`;

      if (!groups.has(rangeKey)) {
        groups.set(rangeKey, []);
      }
      groups.get(rangeKey)!.push(route);
    }

    return groups;
  }
}
