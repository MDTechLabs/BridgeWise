import { RankingWeights } from './types';

/**
 * Load ranking weights from environment variables with fallback defaults.
 * All weights are normalized so they always sum to 1.
 *
 * Env vars:
 *   NEXT_PUBLIC_RANKING_WEIGHT_COST        (default: 0.35)
 *   NEXT_PUBLIC_RANKING_WEIGHT_SPEED       (default: 0.30)
 *   NEXT_PUBLIC_RANKING_WEIGHT_RELIABILITY (default: 0.25)
 *   NEXT_PUBLIC_RANKING_WEIGHT_LIQUIDITY   (default: 0.10)
 */
function parseWeight(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (!raw) return fallback;
  const parsed = parseFloat(raw);
  return isNaN(parsed) ? fallback : parsed;
}

export function getRankingWeights(): RankingWeights {
  const raw = {
    cost: parseWeight('NEXT_PUBLIC_RANKING_WEIGHT_COST', 0.35),
    speed: parseWeight('NEXT_PUBLIC_RANKING_WEIGHT_SPEED', 0.3),
    reliability: parseWeight('NEXT_PUBLIC_RANKING_WEIGHT_RELIABILITY', 0.25),
    liquidity: parseWeight('NEXT_PUBLIC_RANKING_WEIGHT_LIQUIDITY', 0.1),
  };

  // Normalize weights so they always sum to 1
  const total = raw.cost + raw.speed + raw.reliability + raw.liquidity;

  return {
    cost: raw.cost / total,
    speed: raw.speed / total,
    reliability: raw.reliability / total,
    liquidity: raw.liquidity / total,
  };
}
