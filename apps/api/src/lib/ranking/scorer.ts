import { NormalizedScores, RankingWeights } from './types';

/**
 * Computes the composite score (0–100) for a single bridge route
 * using the weighted formula:
 *
 *   finalScore =
 *     (costScore        * weights.cost)        +
 *     (speedScore       * weights.speed)       +
 *     (reliabilityScore * weights.reliability) +
 *     (liquidityScore   * weights.liquidity)
 */
export function computeFinalScore(
  scores: NormalizedScores,
  weights: RankingWeights,
): number {
  const raw =
    scores.costScore * weights.cost +
    scores.speedScore * weights.speed +
    scores.reliabilityScore * weights.reliability +
    scores.liquidityScore * weights.liquidity;

  // Round to 2 decimal places, clamp to 0–100
  return Math.min(100, Math.max(0, parseFloat(raw.toFixed(2))));
}
