/**
 * Represents a computed cost estimate for a transfer along a given route.
 * All fee values are expressed in the specified currency (default: XLM),
 * rounded to 8 decimal places to align with typical Stellar-network precision.
 */
export interface CostEstimate {
  routeId: string;
  baseFee: number;
  networkFee: number;
  totalFee: number;
  currency: string;
  estimatedAt: Date;
}

/**
 * Describes current network conditions used to adjust fee calculations.
 * `networkMultiplier` scales the base fee to account for congestion.
 */
export interface RouteConditions {
  congestionLevel: 'low' | 'medium' | 'high';
  networkMultiplier: number;
}

/**
 * Estimates the total cost of transferring `amount` along a given route,
 * factoring in current network conditions.
 *
 * Fee model:
 *   - baseFee is a flat 0.1% of the transfer amount.
 *   - networkFee scales the baseFee by the route's congestion multiplier
 *     (e.g. 1.5x under medium congestion, 2.5x under high congestion).
 *   - totalFee is the sum of baseFee and networkFee.
 *
 * @param routeId - Identifier of the route being priced.
 * @param amount - The amount being transferred (in the same unit as the resulting fees).
 * @param conditions - Current network conditions, including the congestion multiplier.
 * @returns A CostEstimate with fees rounded to 8 decimal places and a timestamp of calculation.
 */
export function estimateTransferCost(
  routeId: string,
  amount: number,
  conditions: RouteConditions,
): CostEstimate {
  // Flat base fee: 0.1% of the transfer amount.
  const baseFee = amount * 0.001;

  // Additional fee layered on top of the base fee, scaled by network congestion.
  const networkFee = baseFee * conditions.networkMultiplier;

  return {
    routeId,
    // toFixed(8) + parseFloat avoids floating-point noise while keeping
    // precision appropriate for Stellar-style (XLM) amounts.
    baseFee: parseFloat(baseFee.toFixed(8)),
    networkFee: parseFloat(networkFee.toFixed(8)),
    totalFee: parseFloat((baseFee + networkFee).toFixed(8)),
    currency: 'XLM',
    estimatedAt: new Date(),
  };
}

/**
 * Maps a qualitative congestion level to concrete route conditions,
 * including the multiplier used to scale network fees.
 *
 * Multiplier table:
 *   - low:    1.0x (no surcharge)
 *   - medium: 1.5x
 *   - high:   2.5x
 *
 * @param congestionLevel - Current network congestion level.
 * @returns RouteConditions containing the congestion level and its corresponding multiplier.
 */
export function getNetworkConditions(
  congestionLevel: 'low' | 'medium' | 'high',
): RouteConditions {
  const multipliers = { low: 1.0, medium: 1.5, high: 2.5 };
  return { congestionLevel, networkMultiplier: multipliers[congestionLevel] };
}
