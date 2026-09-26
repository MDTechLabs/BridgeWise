/**
 * Stellar / Soroban route cost optimization (#615).
 *
 * A "cost" here is the all-in USD-equivalent amount the user pays to move
 * funds, including bridge fees, network/gas fees, and the implicit slippage
 * cost. Latency and reliability are intentionally excluded from cost and
 * tracked by the broader ranking layer.
 */

/** A Stellar/Soroban cross-chain route candidate. */
export interface CostRoute {
  /** Stable route identifier. */
  id: string;
  /** Bridge provider name. */
  provider: string;
  /** Source chain (e.g. "stellar"). */
  sourceChain: string;
  /** Destination chain. */
  destinationChain: string;
  /** Bridge provider fee, in USD. */
  bridgeFeeUsd: number;
  /** Network (Soroban) resource fee in native units. */
  networkFeeStroops: number;
  /** Current XLM/USD price used to convert network fee to USD. */
  xlmUsdPrice: number;
  /** Estimated gas cost in USD (e.g. destination chain gas). */
  gasUsd?: number;
  /** Expected slippage in percent (0-100). */
  slippagePercent?: number;
  /** Notional amount being transferred, in USD. */
  amountUsd: number;
}

/**
 * Configurable cost weights. The total cost is the weighted sum of the
 * individual cost components. Defaults: bridge 0.5, network 0.2, gas 0.2,
 * slippage 0.1.
 */
export interface CostWeights {
  bridge?: number;
  network?: number;
  gas?: number;
  slippage?: number;
}

export const DEFAULT_COST_WEIGHTS: Required<CostWeights> = {
  bridge: 0.5,
  network: 0.2,
  gas: 0.2,
  slippage: 0.1,
};

/** Breakdown of every cost component for a single route. */
export interface CostBreakdown {
  bridgeCostUsd: number;
  networkCostUsd: number;
  gasCostUsd: number;
  slippageCostUsd: number;
}

/** Result of evaluating a single route. */
export interface RouteCostEvaluation {
  route: CostRoute;
  breakdown: CostBreakdown;
  /** Weighted total cost in USD. */
  totalCostUsd: number;
  /** Cost as a percent of the transfer amount (0-100). */
  costPercent: number;
}

/** A route plus its computed total cost and rank. */
export interface RankedRoute {
  rank: number;
  route: CostRoute;
  totalCostUsd: number;
  costPercent: number;
  breakdown: CostBreakdown;
}

/** Aggregate stats for a set of evaluated routes. */
export interface CostOptimizationStats {
  routeCount: number;
  cheapestRouteId: string | null;
  mostExpensiveRouteId: string | null;
  averageCostUsd: number;
  medianCostUsd: number;
  minCostUsd: number;
  maxCostUsd: number;
}
