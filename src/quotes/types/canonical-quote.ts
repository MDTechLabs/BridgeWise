/**
 * Canonical Stellar bridge quote types.
 *
 * Provider adapters normalize proprietary quote responses into this shape
 * before the routing and quote-comparison layers evaluate them.
 */

/** Route metadata embedded in a canonical Stellar bridge quote. */
export interface StellarBridgeQuoteRoute {
  sourceChain: string;
  destinationChain: string;
  sourceAsset: string;
  destinationAsset: string;
  hops: number;
}

/** Fee fields used by quote comparison and routing decisions. */
export interface StellarBridgeQuoteFees {
  bridgeFeeBps?: number;
  bridgeFeeFlatUsdCents?: number;
  networkFeeUsdCents: number;
  totalFeeUsdCents: number;
  feeToken: string;
}

/** Execution estimates attached to a quote. */
export interface StellarBridgeQuoteExecution {
  estimatedTimeSeconds: number;
  successRate: number;
}

/** Amount fields normalized as decimal strings to preserve precision. */
export interface StellarBridgeQuoteOutput {
  inputAmount: string;
  outputAmount: string;
  netOutputAmount: string;
  minOutputAmount: string;
}

/** Provider-normalized quote consumed by Stellar routing and comparison. */
export interface StellarBridgeQuote {
  id: string;
  providerId: string;
  providerName: string;
  route: StellarBridgeQuoteRoute;
  fees: StellarBridgeQuoteFees;
  execution: StellarBridgeQuoteExecution;
  output: StellarBridgeQuoteOutput;
  metadata: Record<string, unknown>;
  quotedAt: number;
  expiresAt?: number;
}
