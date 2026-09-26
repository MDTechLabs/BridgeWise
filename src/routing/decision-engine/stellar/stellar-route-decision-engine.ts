/**
 * File: src/routing/decision-engine/stellar/stellar-route-decision-engine.ts
 *
 * Centralizes Stellar route selection logic.
 *
 * The engine is the single entry point callers should reach for when they
 * need to pick which Stellar bridge route(s) to surface. It accepts a list
 * of raw candidates, applies a default policy, consults the existing
 * `RouteRanker` for multi-criteria scoring, and folds in any optional risk
 * and compatibility signals the caller supplies.
 *
 * Design goals:
 *   - One decision path for Stellar (no more "should I use rankRoutes or
 *     something else?" conversations).
 *   - Every rejected candidate is returned with a reason, so callers/UI
 *     can tell users *why* a route didn't make the cut.
 *   - Pure / dependency-free by default so the engine is trivial to test.
 *   - Signals (risk, compatibility) are additive, not required.
 */

import {
  BridgeRoute,
  RankedRoute,
  RankingCriteria,
  RouteRanker,
  routeRanker as defaultRouteRanker,
} from '../../../services/route-ranker';

import {
  StellarDecisionContext,
  StellarDecisionEntry,
  StellarDecisionPolicy,
  StellarDecisionRankingOptions,
  StellarDecisionResult,
  StellarDecisionSignals,
} from './types';

const DEFAULT_POLICY: Required<StellarDecisionPolicy> = {
  maxSlippage: 5.0,
  maxTime: 60,
  minSuccessRate: 0.8,
  excludeProviders: [],
  minRiskScore: 0,
  maxResults: 3,
};

/**
 * The decision engine is intentionally a class so callers can swap the
 * underlying `RouteRanker` for tests or for alternative ranking schemes
 * (e.g. weighted by liquidity depth).
 */
export class StellarRouteDecisionEngine {
  private readonly ranker: RouteRanker;
  private readonly defaultRanking: RankingCriteria;
  private readonly defaultPolicy: Required<StellarDecisionPolicy>;
  private readonly now: () => number;

  constructor(options: {
    ranker?: RouteRanker;
    policy?: Partial<StellarDecisionPolicy>;
    ranking?: StellarDecisionRankingOptions;
    now?: () => number;
  } = {}) {
    this.ranker = options.ranker ?? defaultRouteRanker;
    this.now = options.now ?? (() => Date.now());
    this.defaultPolicy = { ...DEFAULT_POLICY, ...(options.policy ?? {}) };
    this.defaultRanking = { ...this.ranker.getDefaultCriteria(), ...(options.ranking ?? {}) };
  }

  /**
   * Evaluate route candidates and return a final decision.
   *
   * The pipeline is:
   *   1. Merge caller policy with defaults.
   *   2. Reject routes that violate hard limits (slippage, time, success
   *      rate, excludeProviders, risk, compatibility).
   *   3. Score surviving routes via `RouteRanker`.
   *   4. Map ranked routes to decision entries with custom reasons.
   *   5. Trim the result list to `maxResults`.
   */
  decide(
    candidates: BridgeRoute[],
    context: StellarDecisionContext = {},
    options: {
      policy?: Partial<StellarDecisionPolicy>;
      ranking?: StellarDecisionRankingOptions;
      signals?: StellarDecisionSignals;
    } = {},
  ): StellarDecisionResult {
    const policy = this.mergePolicy(options.policy);
    const ranking = { ...this.defaultRanking, ...(options.ranking ?? {}) };
    const signals = options.signals ?? {};

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return {
        selection: null,
        alternatives: [],
        rejections: [],
        appliedPolicy: policy,
        decidedAt: this.now(),
      };
    }

    const riskById = indexBy(signals.riskSignals, (s) => s.routeId);
    const compatById = indexBy(signals.compatibilitySignals, (s) => s.routeId);

    // 2 — gate the candidates before ranking so we never score a route
    // that is going to be rejected anyway.
    const rejections: StellarDecisionResult['rejections'] = [];
    const survivors: BridgeRoute[] = [];

    for (const route of candidates) {
      const reason = this.gate(route, policy, riskById, compatById);
      if (reason === null) {
        survivors.push(route);
      } else {
        rejections.push({ route, reason });
      }
    }

    if (survivors.length === 0) {
      return {
        selection: null,
        alternatives: [],
        rejections,
        appliedPolicy: policy,
        decidedAt: this.now(),
      };
    }

    // 3 — score survivors.
    const ranked = this.ranker.rankRoutes(survivors, ranking);

    // 4 — convert RankedRoutes to decision entries.
    const entries: StellarDecisionEntry[] = ranked.map((route, index) => {
      const entry = this.toEntry(route, index === 0, policy, context, signals);
      return entry;
    });

    // 5 — trim and split.
    const trimmed = entries.slice(0, policy.maxResults);
    const selection = trimmed.length > 0 ? trimmed[0] : null;
    const alternatives = trimmed.slice(1);

    return {
      selection,
      alternatives,
      rejections,
      appliedPolicy: policy,
      decidedAt: this.now(),
    };
  }

  /** Merged policy used by the engine. */
  getDefaultPolicy(): Required<StellarDecisionPolicy> {
    return { ...this.defaultPolicy };
  }

  /** Merged ranking used for the underlying score. */
  getDefaultRanking(): RankingCriteria {
    return { ...this.defaultRanking };
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private mergePolicy(
    override: Partial<StellarDecisionPolicy> | undefined,
  ): Required<StellarDecisionPolicy> {
    return { ...this.defaultPolicy, ...(override ?? {}) };
  }

  private gate(
    route: BridgeRoute,
    policy: Required<StellarDecisionPolicy>,
    riskById: Map<string, { riskScore: number; reason?: string }>,
    compatById: Map<string, { compatible: boolean; missingFeatures?: string[] }>,
  ): string | null {
    if (
      typeof policy.maxSlippage === 'number' &&
      typeof route.slippage === 'number' &&
      route.slippage > policy.maxSlippage
    ) {
      return `slippage ${route.slippage}% exceeds policy max ${policy.maxSlippage}%`;
    }

    if (typeof policy.maxTime === 'number' && route.estimatedTime > policy.maxTime) {
      return `estimated time ${route.estimatedTime}m exceeds policy max ${policy.maxTime}m`;
    }

    if (
      typeof policy.minSuccessRate === 'number' &&
      route.successRate < policy.minSuccessRate
    ) {
      return `success rate ${route.successRate} below policy min ${policy.minSuccessRate}`;
    }

    if (policy.excludeProviders?.includes(route.provider)) {
      return `provider "${route.provider}" is on the exclude list`;
    }

    const risk = riskById.get(route.id);
    if (risk && typeof policy.minRiskScore === 'number') {
      // minRiskScore = 0 means "block only routes at the riskiest end" (score 1),
      // minRiskScore = 0.5 means "block any route whose risk is above 0.5".
      if (risk.riskScore > policy.minRiskScore && policy.minRiskScore > 0) {
        return `risk score ${risk.riskScore} exceeds policy ceiling`;
      }
      // Also support a literal block: if minRiskScore is 1, only allow routes
      // with riskScore === 0.
      if (policy.minRiskScore >= 1 && risk.riskScore > 0) {
        return `risk score ${risk.riskScore} exceeds policy ceiling`;
      }
    }

    const compat = compatById.get(route.id);
    if (compat && compat.compatible === false) {
      const missing = compat.missingFeatures?.length
        ? ` (missing: ${compat.missingFeatures.join(', ')})`
        : '';
      return `provider marked incompatible with the requested application${missing}`;
    }

    return null;
  }

  private toEntry(
    ranked: RankedRoute,
    isTop: boolean,
    policy: Required<StellarDecisionPolicy>,
    context: StellarDecisionContext,
    signals: StellarDecisionSignals,
  ): StellarDecisionEntry {
    const warnings: string[] = [];

    if (ranked.confidence !== undefined && ranked.confidence < 0.5) {
      warnings.push('Low confidence estimate — verify before submitting.');
    }
    if (typeof ranked.slippage === 'number' && ranked.slippage > 0) {
      warnings.push(`Estimated slippage is ${ranked.slippage}%.`);
    }
    if (ranked.networkMetrics?.availability === 0) {
      warnings.push('Provider is currently reported unavailable.');
    }
    if (signals.compatibilitySignals?.find((s) => s.routeId === ranked.id && !s.compatible)) {
      warnings.push('Compatibility signal marked this provider as incompatible.');
    }

    const reason = isTop
      ? this.buildTopReason(ranked, policy, context)
      : `Alternative ranked #${ranked.rank} with score ${ranked.score.toFixed(3)}.`;

    return {
      ...ranked,
      reason,
      warnings,
    };
  }

  private buildTopReason(
    ranked: RankedRoute,
    policy: Required<StellarDecisionPolicy>,
    context: StellarDecisionContext,
  ): string {
    const network = context.network ?? 'public';
    return [
      `Selected for ${network} network as best overall fit for the active policy.`,
      `score=${ranked.score.toFixed(3)}`,
      `slippagePolicy=${policy.maxSlippage}%`,
      `timePolicy=${policy.maxTime}m`,
    ].join(' ');
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function indexBy<T, K>(items: T[] | undefined, key: (item: T) => K): Map<K, T> {
  const map = new Map<K, T>();
  if (!items) return map;
  for (const item of items) {
    map.set(key(item), item);
  }
  return map;
}

export default StellarRouteDecisionEngine;
