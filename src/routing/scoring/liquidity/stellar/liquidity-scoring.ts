export interface LiquidityThresholdConfig {
  minCoverage: number;
  warningCoverage: number;
  criticalCoverage: number;
  maxPenalty: number;
}

export interface RouteLiquidityInput {
  availableLiquidity: number;
  requiredLiquidity: number;
  thresholds?: Partial<LiquidityThresholdConfig>;
}

export interface RouteLiquidityScore {
  availableLiquidity: number;
  requiredLiquidity: number;
  coverage: number;
  score: number;
  penalty: number;
  status: 'healthy' | 'warning' | 'critical';
}

export const DEFAULT_LIQUIDITY_THRESHOLDS: Required<LiquidityThresholdConfig> = {
  minCoverage: 1,
  warningCoverage: 0.8,
  criticalCoverage: 0.5,
  maxPenalty: 0.6,
};

export function calculateLiquidityCoverage(
  availableLiquidity: number,
  requiredLiquidity: number,
): number {
  if (
    !Number.isFinite(availableLiquidity) ||
    !Number.isFinite(requiredLiquidity)
  ) {
    return 0;
  }

  if (requiredLiquidity <= 0) {
    return 1;
  }

  return Math.max(0, Math.min(availableLiquidity / requiredLiquidity, 2));
}

export function calculateLiquidityScore(
  input: RouteLiquidityInput,
): RouteLiquidityScore {
  const thresholds = {
    ...DEFAULT_LIQUIDITY_THRESHOLDS,
    ...input.thresholds,
  };

  const availableLiquidity = Number(input.availableLiquidity) || 0;
  const requiredLiquidity = Number(input.requiredLiquidity) || 0;
  const coverage = calculateLiquidityCoverage(
    availableLiquidity,
    requiredLiquidity,
  );

  let penalty = 0;
  let status: RouteLiquidityScore['status'] = 'healthy';

  if (coverage < thresholds.criticalCoverage) {
    status = 'critical';
    penalty = Math.min(
      thresholds.maxPenalty,
      1 - coverage / thresholds.criticalCoverage,
    );
  } else if (coverage < thresholds.warningCoverage) {
    status = 'warning';
    penalty = Math.min(
      thresholds.maxPenalty,
      0.35 +
        (thresholds.warningCoverage - coverage) / thresholds.warningCoverage,
    );
  }

  const score = Math.max(0, 1 - penalty);

  return {
    availableLiquidity,
    requiredLiquidity,
    coverage,
    score,
    penalty,
    status,
  };
}

export function applyLiquidityPenaltyToRouteScore(
  baseScore: number,
  liquidityScore: RouteLiquidityScore,
): number {
  return Math.max(0, baseScore * liquidityScore.score);
}
