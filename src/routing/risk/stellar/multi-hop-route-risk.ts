# Multi-Hop Route Risk Scoring Module

```ts
/**
 * Multi-Hop Route Risk Scoring
 *
 * Standalone risk-scoring module for Stellar/Soroban multi-hop routes.
 *
 * This module intentionally has no dependencies on the existing routing
 * implementation. It can therefore be introduced and tested independently
 * before being integrated into route ranking.
 *
 * Risk scores are normalized to [0, 1]:
 *   0 = lowest risk
 *   1 = highest risk
 */

export interface MultiHopRouteHop {
  /** Unique provider identifier for this hop. */
  provider: string;

  /** Available liquidity for this hop. */
  liquidity: number;

  /** Liquidity required to execute this hop. */
  requiredLiquidity: number;

  /** Number of execution operations required by this hop. */
  executionSteps?: number;
}

export interface MultiHopRouteRiskInput {
  /** Ordered hops making up the route. */
  hops: MultiHopRouteHop[];

  /**
   * Historical provider reliability scores.
   *
   * Values must be in [0, 1]:
   *   0 = completely unreliable
   *   1 = highly reliable
   */
  providerReliability: Record<string, number>;

  /**
   * Optional maximum number of hops considered normal.
   *
   * Routes at or below this number receive no additional hop penalty.
   * Defaults to 2.
   */
  preferredMaxHops?: number;

  /**
   * Optional maximum execution steps considered normal.
   *
   * Defaults to 4 steps per route.
   */
  preferredMaxExecutionSteps?: number;
}

export interface MultiHopRouteRiskBreakdown {
  /** Risk introduced by the number of hops. */
  hopRisk: number;

  /** Risk introduced by provider reliability. */
  providerRisk: number;

  /** Risk introduced by liquidity constraints. */
  liquidityRisk: number;

  /** Risk introduced by execution complexity. */
  executionComplexityRisk: number;
}

export interface MultiHopRouteRiskResult {
  /**
   * Overall normalized risk score.
   *
   * 0 = lowest risk
   * 1 = highest risk
   */
  riskScore: number;

  /** Individual normalized risk dimensions. */
  breakdown: MultiHopRouteRiskBreakdown;

  /** Number of hops in the route. */
  hopCount: number;

  /** Total execution steps across all hops. */
  executionSteps: number;

  /** Whether the route has enough liquidity at every hop. */
  liquiditySufficient: boolean;
}

/**
 * Default weights for the risk dimensions.
 *
 * The weights sum to 1.
 */
export const DEFAULT_MULTI_HOP_RISK_WEIGHTS = {
  hop: 0.2,
  provider: 0.3,
  liquidity: 0.3,
  executionComplexity: 0.2,
} as const;

export interface MultiHopRouteRiskWeights {
  hop: number;
  provider: number;
  liquidity: number;
  executionComplexity: number;
}

/**
 * Clamp a value to the normalized [0, 1] range.
 */
function clamp(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

/**
 * Validate and normalize risk weights.
 *
 * If all supplied weights are zero, equal weights are used.
 */
export function normalizeRiskWeights(
  weights: Partial<MultiHopRouteRiskWeights> = {},
): MultiHopRouteRiskWeights {
  const merged = {
    ...DEFAULT_MULTI_HOP_RISK_WEIGHTS,
    ...weights,
  };

  const safe = {
    hop: Math.max(0, Number(merged.hop) || 0),
    provider: Math.max(0, Number(merged.provider) || 0),
    liquidity: Math.max(0, Number(merged.liquidity) || 0),
    executionComplexity: Math.max(
      0,
      Number(merged.executionComplexity) || 0,
    ),
  };

  const total =
    safe.hop +
    safe.provider +
    safe.liquidity +
    safe.executionComplexity;

  if (total === 0) {
    return {
      hop: 0.25,
      provider: 0.25,
      liquidity: 0.25,
      executionComplexity: 0.25,
    };
  }

  return {
    hop: safe.hop / total,
    provider: safe.provider / total,
    liquidity: safe.liquidity / total,
    executionComplexity: safe.executionComplexity / total,
  };
}

/**
 * Calculate risk introduced by the number of hops.
 *
 * A single-hop route has zero hop risk.
 *
 * The preferred maximum is treated as the normal operating range.
 * Beyond that range, risk increases until it reaches 1.
 */
export function calculateHopRisk(
  hopCount: number,
  preferredMaxHops = 2,
): number {
  if (hopCount <= 1) {
    return 0;
  }

  const normalHops = Math.max(1, preferredMaxHops);

  if (hopCount <= normalHops) {
    return 0;
  }

  /*
   * Each additional hop increases risk.
   *
   * Example with preferredMaxHops = 2:
   *   1 hop → 0.00
   *   2 hops → 0.00
   *   3 hops → 0.33
   *   4 hops → 0.67
   *   5+ hops → 1.00
   */
  return clamp((hopCount - normalHops) / normalHops);
}

/**
 * Calculate provider reliability risk.
 *
 * Provider reliability is converted into risk:
 *
 *   reliability 1.0 → risk 0
 *   reliability 0.5 → risk 0.5
 *   reliability 0.0 → risk 1
 *
 * Multiple providers are combined using a cumulative failure model.
 *
 * This means every additional provider creates another potential
 * failure point instead of simply averaging reliability scores.
 */
export function calculateProviderRisk(
  hops: MultiHopRouteHop[],
  providerReliability: Record<string, number>,
): number {
  if (hops.length === 0) {
    return 0;
  }

  let routeReliability = 1;

  for (const hop of hops) {
    const reliability = clamp(
      providerReliability[hop.provider] ?? 0.5,
    );

    routeReliability *= reliability;
  }

  return clamp(1 - routeReliability);
}

/**
 * Calculate liquidity risk for a single hop.
 *
 * Risk is based on how close available liquidity is to the amount
 * required for execution.
 *
 * Examples:
 *
 *   2x required liquidity → 0 risk
 *   1x required liquidity → 0 risk
 *   0.75x required liquidity → 0.25 risk
 *   0 liquidity → 1 risk
 *
 * A route with insufficient liquidity receives maximum liquidity risk.
 */
export function calculateHopLiquidityRisk(
  liquidity: number,
  requiredLiquidity: number,
): number {
  if (!Number.isFinite(liquidity) || liquidity < 0) {
    return 1;
  }

  if (!Number.isFinite(requiredLiquidity) || requiredLiquidity < 0) {
    return 1;
  }

  if (requiredLiquidity === 0) {
    return 0;
  }

  if (liquidity < requiredLiquidity) {
    return 1;
  }

  /*
   * Liquidity above 2x the required amount is considered deep enough
   * that additional liquidity does not materially reduce risk.
   */
  const liquidityRatio = liquidity / requiredLiquidity;

  if (liquidityRatio >= 2) {
    return 0;
  }

  return clamp(2 - liquidityRatio);
}

/**
 * Calculate aggregate liquidity risk across all route hops.
 *
 * The highest-risk hop is given significant weight because one
 * liquidity-constrained hop can prevent the entire route from
 * executing successfully.
 */
export function calculateLiquidityRisk(
  hops: MultiHopRouteHop[],
): number {
  if (hops.length === 0) {
    return 0;
  }

  const risks = hops.map((hop) =>
    calculateHopLiquidityRisk(
      hop.liquidity,
      hop.requiredLiquidity,
    ),
  );

  const averageRisk =
    risks.reduce((sum, risk) => sum + risk, 0) / risks.length;

  const maximumRisk = Math.max(...risks);

  /*
   * Weight the worst hop more heavily than the average.
   */
  return clamp(averageRisk * 0.4 + maximumRisk * 0.6);
}

/**
 * Calculate execution complexity risk.
 *
 * More execution steps mean more opportunities for:
 * - transaction failure
 * - timeout
 * - state changes
 * - slippage
 * - provider errors
 */
export function calculateExecutionComplexityRisk(
  executionSteps: number,
  preferredMaxExecutionSteps = 4,
): number {
  if (executionSteps <= 0) {
    return 0;
  }

  const normalSteps = Math.max(1, preferredMaxExecutionSteps);

  if (executionSteps <= normalSteps) {
    return 0;
  }

  return clamp(
    (executionSteps - normalSteps) / normalSteps,
  );
}

/**
 * Determine whether every hop has sufficient liquidity.
 */
export function hasSufficientRouteLiquidity(
  hops: MultiHopRouteHop[],
): boolean {
  return hops.every(
    (hop) =>
      Number.isFinite(hop.liquidity) &&
      Number.isFinite(hop.requiredLiquidity) &&
      hop.liquidity >= hop.requiredLiquidity,
  );
}

/**
 * Calculate the complete normalized multi-hop route risk score.
 *
 * The resulting score is always in [0, 1].
 *
 * Higher values represent greater execution risk.
 */
export function scoreMultiHopRouteRisk(
  input: MultiHopRouteRiskInput,
  weights: Partial<MultiHopRouteRiskWeights> = {},
): MultiHopRouteRiskResult {
  const hops = input.hops ?? [];

  if (hops.length === 0) {
    return {
      riskScore: 0,
      breakdown: {
        hopRisk: 0,
        providerRisk: 0,
        liquidityRisk: 0,
        executionComplexityRisk: 0,
      },
      hopCount: 0,
      executionSteps: 0,
      liquiditySufficient: true,
    };
  }

  const normalizedWeights = normalizeRiskWeights(weights);

  const hopCount = hops.length;

  const executionSteps = hops.reduce(
    (total, hop) =>
      total +
      Math.max(
        0,
        Number.isFinite(hop.executionSteps)
          ? hop.executionSteps ?? 0
          : 1,
      ),
    0,
  );

  const hopRisk = calculateHopRisk(
    hopCount,
    input.preferredMaxHops,
  );

  const providerRisk = calculateProviderRisk(
    hops,
    input.providerReliability,
  );

  const liquidityRisk = calculateLiquidityRisk(hops);

  const executionComplexityRisk =
    calculateExecutionComplexityRisk(
      executionSteps,
      input.preferredMaxExecutionSteps,
    );

  const riskScore = clamp(
    hopRisk * normalizedWeights.hop +
      providerRisk * normalizedWeights.provider +
      liquidityRisk * normalizedWeights.liquidity +
      executionComplexityRisk *
        normalizedWeights.executionComplexity,
  );

  return {
    riskScore,
    breakdown: {
      hopRisk,
      providerRisk,
      liquidityRisk,
      executionComplexityRisk,
    },
    hopCount,
    executionSteps,
    liquiditySufficient: hasSufficientRouteLiquidity(hops),
  };
}

/**
 * Convert a normalized risk score into a ranking-friendly score.
 *
 * Existing BridgeWise ranking uses higher scores as better in some
 * routing paths. This helper makes that conversion explicit:
 *
 *   risk 0.0 → safety score 1.0
 *   risk 0.5 → safety score 0.5
 *   risk 1.0 → safety score 0.0
 */
export function riskToSafetyScore(riskScore: number): number {
  return clamp(1 - riskScore);
}

/**
 * Create a human-readable risk classification.
 */
export function classifyRouteRisk(
  riskScore: number,
): 'low' | 'medium' | 'high' | 'critical' {
  const score = clamp(riskScore);

  if (score < 0.25) {
    return 'low';
  }

  if (score < 0.5) {
    return 'medium';
  }

  if (score < 0.75) {
    return 'high';
  }

  return 'critical';
}
```
