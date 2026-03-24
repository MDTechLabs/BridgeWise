import {
  BridgeRouteInput,
  NormalizedScores,
  RankedBridgeRoute,
  RankingWeights,
} from './types';
import {
  normalizeCostScores,
  normalizeLiquidityScores,
  normalizeReliabilityScores,
  normalizeSpeedScores,
} from './normalizers';
import { computeFinalScore } from './scorer';
import { getRankingWeights } from './weights';

/**
 * Core ranking engine.
 *
 * Takes a list of raw bridge routes, normalizes all scoring factors
 * across the full set, applies the weighted formula, and returns
 * the routes sorted by finalScore descending with rank assigned.
 *
 * @param routes   - Raw bridge route data from the aggregation engine
 * @param weights  - Optional weight overrides (uses env vars if omitted)
 * @returns        - Sorted, ranked routes with composite scores
 */
export function rankBridges(
  routes: BridgeRouteInput[],
  weights?: RankingWeights,
): RankedBridgeRoute[] {
  if (!routes.length) return [];

  const resolvedWeights = weights ?? getRankingWeights();

  // Extract raw arrays for batch normalization
  const feeCosts = routes.map((r) => r.feeCostUSD);
  const times = routes.map((r) => r.estimatedTimeSeconds);
  const reliabilities = routes.map((r) => r.reliabilityScore);
  const failureRates = routes.map((r) => r.failureRate);
  const liquidities = routes.map((r) => r.liquidityUSD);

  // Normalize all factors across the full route set
  const costScores = normalizeCostScores(feeCosts);
  const speedScores = normalizeSpeedScores(times);
  const reliabilityScores = normalizeReliabilityScores(
    reliabilities,
    failureRates,
  );
  const liquidityScores = normalizeLiquidityScores(liquidities);

  // Build scored routes
  const scored: RankedBridgeRoute[] = routes.map((route, i) => {
    const scores: NormalizedScores = {
      costScore: costScores[i],
      speedScore: speedScores[i],
      reliabilityScore: reliabilityScores[i],
      liquidityScore: liquidityScores[i],
    };

    return {
      ...route,
      scores,
      finalScore: computeFinalScore(scores, resolvedWeights),
      rank: 0, // assigned after sort
    };
  });

  // Sort descending by finalScore
  scored.sort((a, b) => b.finalScore - a.finalScore);

  // Assign rank (1-based)
  scored.forEach((route, i) => {
    route.rank = i + 1;
  });

  return scored;
}
