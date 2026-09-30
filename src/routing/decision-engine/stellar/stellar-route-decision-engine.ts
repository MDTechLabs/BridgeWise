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
  RouteRejectionReason,
} from './types';

const DEFAULT_POLICY: Required<StellarDecisionPolicy> = {
  maxSlippage: 5.0,
  maxTime: 60,
  minSuccessRate: 0.8,
  excludeProviders: [],
  minRiskScore: 0,
  minLiquidity: '0',
  requireLiquidityData: true,
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
    const liquidityById = indexBy(signals.liquiditySignals, (s) => s.routeId);

    // 2 — gate the candidates before ranking so we never score a route
    // that is going to be rejected anyway.
    const rejections: StellarDecisionResult['rejections'] = [];
    const survivors: BridgeRoute[] = [];

    for (const route of candidates) {
      const reasons = this.gate(route, policy, riskById, compatById, liquidityById);
      if (reasons.length === 0) {
        survivors.push(route);
      } else {
        rejections.push({
          route,
          reason: reasons[0].message,
          code: reasons[0].code,
          reasons,
        });
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
    liquidityById: Map<string, { availableLiquidity: string; asset?: string }>,
  ): RouteRejectionReason[] {
    const reasons: RouteRejectionReason[] = [];

    if (route.slippage !== undefined && (!Number.isFinite(route.slippage) || route.slippage < 0)) {
      reasons.push({
        code: 'INVALID_SLIPPAGE',
        message: 'slippage must be a finite non-negative percentage',
      });
    } else if (
      typeof policy.maxSlippage === 'number' &&
      typeof route.slippage === 'number' &&
      route.slippage > policy.maxSlippage
    ) {
      reasons.push({
        code: 'SLIPPAGE_EXCEEDED',
        message: `slippage ${route.slippage}% exceeds policy max ${policy.maxSlippage}%`,
      });
    }

    if (!Number.isFinite(route.estimatedTime) || route.estimatedTime < 0) {
      reasons.push({
        code: 'INVALID_ESTIMATED_TIME',
        message: 'estimated time must be a finite non-negative number of minutes',
      });
    } else if (typeof policy.maxTime === 'number' && route.estimatedTime > policy.maxTime) {
      reasons.push({
        code: 'ESTIMATED_TIME_EXCEEDED',
        message: `estimated time ${route.estimatedTime}m exceeds policy max ${policy.maxTime}m`,
      });
    }

    if (!Number.isFinite(route.successRate) || route.successRate < 0 || route.successRate > 1) {
      reasons.push({
        code: 'INVALID_SUCCESS_RATE',
        message: 'success rate must be a finite value between 0 and 1',
      });
    } else if (
      typeof policy.minSuccessRate === 'number' &&
      route.successRate < policy.minSuccessRate
    ) {
      reasons.push({
        code: 'SUCCESS_RATE_TOO_LOW',
        message: `success rate ${route.successRate} below policy min ${policy.minSuccessRate}`,
      });
    }

    if (policy.excludeProviders?.includes(route.provider)) {
      reasons.push({
        code: 'PROVIDER_EXCLUDED',
        message: `provider "${route.provider}" is on the exclude list`,
      });
    }

    const risk = riskById.get(route.id);
    if (risk && (!Number.isFinite(risk.riskScore) || risk.riskScore < 0 || risk.riskScore > 1)) {
      reasons.push({
        code: 'INVALID_RISK_SCORE',
        message: 'risk score must be a finite value between 0 and 1',
      });
    } else if (risk && typeof policy.minRiskScore === 'number') {
      // minRiskScore = 0 means "block only routes at the riskiest end" (score 1),
      // minRiskScore = 0.5 means "block any route whose risk is above 0.5".
      if (risk.riskScore > policy.minRiskScore && policy.minRiskScore > 0) {
        reasons.push({
          code: 'RISK_LIMIT_EXCEEDED',
          message: `risk score ${risk.riskScore} exceeds policy ceiling`,
        });
      }
      // Also support a literal block: if minRiskScore is 1, only allow routes
      // with riskScore === 0.
      if (policy.minRiskScore >= 1 && risk.riskScore > 0) {
        if (reasons[reasons.length - 1]?.code !== 'RISK_LIMIT_EXCEEDED') {
          reasons.push({
            code: 'RISK_LIMIT_EXCEEDED',
            message: `risk score ${risk.riskScore} exceeds policy ceiling`,
          });
        }
      }
    }

    // Liquidity gate — only active when the caller opts in via minLiquidity.
    // A route must demonstrably carry enough available liquidity to absorb
    // the requested transfer, otherwise it is rejected as low-liquidity.
    if (isPositiveAmount(policy.minLiquidity)) {
      const liquidity = liquidityById.get(route.id);
      if (!liquidity) {
        if (policy.requireLiquidityData) {
          reasons.push({
            code: 'LIQUIDITY_UNKNOWN',
            message:
              `route "${route.id}" has no liquidity data but policy requires at ` +
              `least ${policy.minLiquidity} available liquidity`,
          });
        }
      } else if (!isValidNonNegativeAmount(liquidity.availableLiquidity)) {
        reasons.push({
          code: 'INVALID_LIQUIDITY',
          message: 'available liquidity must be a finite non-negative decimal amount',
        });
      } else if (compareDecimalStrings(liquidity.availableLiquidity, policy.minLiquidity) < 0) {
        const asset = liquidity.asset ? ` ${liquidity.asset}` : '';
        reasons.push({
          code: 'INSUFFICIENT_LIQUIDITY',
          message:
            `available liquidity ${liquidity.availableLiquidity}${asset} is below ` +
            `policy minimum ${policy.minLiquidity}${asset}`,
        });
      }
    }

    const compat = compatById.get(route.id);
    if (compat && compat.compatible === false) {
      const missing = compat.missingFeatures?.length
        ? ` (missing: ${compat.missingFeatures.join(', ')})`
        : '';
      reasons.push({
        code: 'PROVIDER_INCOMPATIBLE',
        message: `provider marked incompatible with the requested application${missing}`,
      });
    }

    return reasons;
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
    if (isPositiveAmount(policy.minLiquidity)) {
      const liquidity = signals.liquiditySignals?.find((s) => s.routeId === ranked.id);
      if (
        liquidity &&
        isValidNonNegativeAmount(liquidity.availableLiquidity) &&
        compareDecimalStrings(liquidity.availableLiquidity, policy.minLiquidity) >= 0 &&
        compareDecimalStrings(
          liquidity.availableLiquidity,
          multiplyDecimalStringByRatio(policy.minLiquidity, 2),
        ) < 0
      ) {
        warnings.push(
          `Liquidity is thin (${liquidity.availableLiquidity} available vs ` +
            `${policy.minLiquidity} floor) — larger transfers may fail.`,
        );
      }
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

const AMOUNT_PATTERN = /^\d+(\.\d+)?$/;

/** True when `value` is a well-formed non-negative decimal amount string. */
function isValidNonNegativeAmount(value: string | undefined): value is string {
  return typeof value === 'string' && AMOUNT_PATTERN.test(value.trim());
}

/** True when `value` is a valid amount strictly greater than zero. */
function isPositiveAmount(value: string | undefined): boolean {
  return isValidNonNegativeAmount(value) && compareDecimalStrings(value, '0') > 0;
}

/**
 * Compare two non-negative decimal strings without floating-point loss.
 * Returns -1 when a < b, 0 when equal, 1 when a > b. Inputs are assumed to
 * already be validated by {@link isValidNonNegativeAmount}.
 */
function compareDecimalStrings(a: string, b: string): number {
  const [aInt, aFrac] = splitDecimal(a);
  const [bInt, bFrac] = splitDecimal(b);

  const intCmp = compareDigitStrings(aInt, bInt);
  if (intCmp !== 0) return intCmp;

  const len = Math.max(aFrac.length, bFrac.length);
  const aPad = aFrac.padEnd(len, '0');
  const bPad = bFrac.padEnd(len, '0');
  return compareDigitStrings(aPad, bPad);
}

/** Split a validated amount into [integerDigits, fractionDigits]. */
function splitDecimal(value: string): [string, string] {
  const [intPart, fracPart = ''] = value.trim().split('.');
  return [stripLeadingZeros(intPart), fracPart];
}

function stripLeadingZeros(digits: string): string {
  const stripped = digits.replace(/^0+/, '');
  return stripped.length > 0 ? stripped : '0';
}

/** Compare two equal-semantics digit strings (integers or padded fractions). */
function compareDigitStrings(a: string, b: string): number {
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Multiply a validated amount by a small positive integer ratio, used to
 * derive the "thin liquidity" warning band. Kept integer-only to avoid
 * floating-point drift; fractional inputs are scaled digit-wise.
 */
function multiplyDecimalStringByRatio(value: string, ratio: number): string {
  const [intPart, fracPart] = splitDecimal(value);
  const scale = BigInt(Math.trunc(ratio));
  const combined = BigInt(intPart + fracPart) * scale;
  const combinedStr = combined.toString().padStart(fracPart.length + 1, '0');
  if (fracPart.length === 0) return combinedStr;
  const cut = combinedStr.length - fracPart.length;
  const intResult = stripLeadingZeros(combinedStr.slice(0, cut) || '0');
  const fracResult = combinedStr.slice(cut).replace(/0+$/, '');
  return fracResult ? `${intResult}.${fracResult}` : intResult;
}

export default StellarRouteDecisionEngine;
