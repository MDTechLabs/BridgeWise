/**
 * Soroban Route Cost Breakdown Engine (issue #446).
 *
 * Decomposes Stellar / Soroban cross-chain route quotes into structured,
 * per-component USD-cent totals suited for billing reconciliation, audit
 * trails, and UI display. Complementary — but distinct from — the
 * `src/optimization/costs/stellar/soroban-cost-optimizer.ts` module,
 * which ranks routes by weighted cost.
 */

export { SorobanCostBreakdownEngine } from './soroban-cost-breakdown-engine';
export type { SorobanCostBreakdownEngineOptions } from './soroban-cost-breakdown-engine';

export {
  STROOPS_PER_XLM,
  InvalidQuoteError,
} from './types';

export type {
  AssetAmount,
  BreakdownAggregate,
  BridgeFeeComponent,
  BridgeFeeStructure,
  CostDriver,
  NetworkFeeComponent,
  NetworkFeeStructure,
  ProtocolFeeComponent,
  SlippageCostComponent,
  SorobanQuoteBreakdown,
  SorobanRouteQuote,
  TrustlineFeeComponent,
} from './types';
