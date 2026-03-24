/**
 * Normalizes a set of values to a 0–100 scale.
 * Lower is better for cost/time (inverted), higher is better for reliability/liquidity.
 */

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Min-max normalization — higher raw value → higher score.
 */
function normalizeAscending(value: number, min: number, max: number): number {
  if (max === min) return 100;
  return clamp(((value - min) / (max - min)) * 100, 0, 100);
}

/**
 * Min-max normalization — lower raw value → higher score (inverted).
 */
function normalizeDescending(value: number, min: number, max: number): number {
  if (max === min) return 100;
  return clamp(((max - value) / (max - min)) * 100, 0, 100);
}

export function normalizeCostScores(feeCosts: number[]): number[] {
  const min = Math.min(...feeCosts);
  const max = Math.max(...feeCosts);
  return feeCosts.map((fee) => normalizeDescending(fee, min, max));
}

export function normalizeSpeedScores(timesSeconds: number[]): number[] {
  const min = Math.min(...timesSeconds);
  const max = Math.max(...timesSeconds);
  return timesSeconds.map((t) => normalizeDescending(t, min, max));
}

/**
 * Reliability = reliabilityScore (0–100) penalized by failure rate.
 * Combined = reliabilityScore * (1 - failureRate), then re-normalized.
 */
export function normalizeReliabilityScores(
  reliabilityScores: number[],
  failureRates: number[],
): number[] {
  const combined = reliabilityScores.map(
    (score, i) => score * (1 - clamp(failureRates[i], 0, 1)),
  );
  const min = Math.min(...combined);
  const max = Math.max(...combined);
  return combined.map((v) => normalizeAscending(v, min, max));
}

export function normalizeLiquidityScores(liquidityValues: number[]): number[] {
  const min = Math.min(...liquidityValues);
  const max = Math.max(...liquidityValues);
  return liquidityValues.map((v) => normalizeAscending(v, min, max));
}
