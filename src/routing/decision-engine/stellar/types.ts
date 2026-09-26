/**
 * File: src/routing/decision-engine/stellar/types.ts
 *
 * Type definitions used by the Stellar Route Decision Engine.
 *
 * The engine is the single source of truth for which Stellar bridge routes
 * are presented to clients. It takes a list of raw candidates, applies
 * ranking/risk/compatibility gates, and returns a final selection together
 * with a reasoning trail that callers can surface in UIs/logs.
 */

import type { BridgeRoute, RankingCriteria, RankedRoute } from '../../../services/route-ranker';

/** Public policy that callers can supply to influence route selection. */
export interface StellarDecisionPolicy {
  /** Maximum acceptable slippage percentage, applied before ranking. */
  maxSlippage?: number;
  /** Maximum acceptable estimated time in minutes. */
  maxTime?: number;
  /** Minimum acceptable historical success rate (0-1). */
  minSuccessRate?: number;
  /** Providers that should never be returned (compliance, regional, etc). */
  excludeProviders?: string[];
  /** Minimum acceptable risk score (0 = riskiest, 1 = safest). */
  minRiskScore?: number;
  /** How many ranked routes the caller wants to see in the final result. */
  maxResults?: number;
}

/** Caller context (e.g. wallet tier, network, asset class). */
export interface StellarDecisionContext {
  /** Initiator wallet/address. */
  walletAddress?: string;
  /** Stellar network (PUBLIC/TESTNET/FUTURENET). */
  network?: string;
  /** Free-form tags used for logging & analytics. */
  tags?: Record<string, string>;
}

/** Single output entry returned by the engine. */
export interface StellarDecisionEntry extends RankedRoute {
  /** Reason this entry survived every gate. */
  reason: string;
  /** Any warnings the engine wants to surface alongside the route. */
  warnings: string[];
}

/** Aggregated decision returned to the caller. */
export interface StellarDecisionResult {
  /** Selected route (rank 1), or null when nothing survived. */
  selection: StellarDecisionEntry | null;
  /** All alternatives that survived, ordered by rank. */
  alternatives: StellarDecisionEntry[];
  /** Routes that were filtered out and the reason each one was rejected. */
  rejections: Array<{ route: BridgeRoute; reason: string }>;
  /** The policy that was actually applied after defaults were merged. */
  appliedPolicy: Required<StellarDecisionPolicy>;
  /** Snapshot of when this decision was produced. */
  decidedAt: number;
}

/** Optional knobs forwarded to the underlying RouteRanker. */
export interface StellarDecisionRankingOptions
  extends Partial<RankingCriteria> {}

/** Risk signal fed into the decision (typically produced by a risk engine). */
export interface StellarRouteRiskSignal {
  /** Stable route id matching the candidate BridgeRoute.id. */
  routeId: string;
  /** Risk score in [0, 1] where 1 = highest risk. */
  riskScore: number;
  /** Optional human-readable reason for the risk score. */
  reason?: string;
}

/** Compatibility signal fed into the decision (provider × feature). */
export interface StellarRouteCompatibilitySignal {
  routeId: string;
  /** True when the (application, provider) pair is known to be compatible. */
  compatible: boolean;
  /** Free-form missing features surfaced when not compatible. */
  missingFeatures?: string[];
}

/** Engine dependencies that callers can supply to enrich the decision. */
export interface StellarDecisionSignals {
  riskSignals?: StellarRouteRiskSignal[];
  compatibilitySignals?: StellarRouteCompatibilitySignal[];
}
