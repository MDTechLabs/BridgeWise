/**
 * File: src/routing/decision-engine/stellar/index.ts
 *
 * Module barrel for the Stellar Route Decision Engine.
 *
 * Re-exports the runtime class and every public type so consumers can
 * import everything they need from a single path:
 *
 *   import { StellarRouteDecisionEngine } from '@/routing/decision-engine/stellar';
 */

export { StellarRouteDecisionEngine } from './stellar-route-decision-engine';
export { default } from './stellar-route-decision-engine';
export type {
  StellarDecisionContext,
  StellarDecisionEntry,
  StellarDecisionPolicy,
  StellarDecisionRankingOptions,
  StellarDecisionResult,
  StellarDecisionSignals,
  StellarRouteCompatibilitySignal,
  StellarRouteRiskSignal,
} from './types';
