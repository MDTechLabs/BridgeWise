export interface BridgeRouteInput {
  id: string;
  bridgeName: string;
  feeCostUSD: number;
  estimatedTimeSeconds: number;
  reliabilityScore: number; // 0–100, sourced from benchmark data
  failureRate: number; // 0–1 (e.g. 0.05 = 5% failure rate)
  liquidityUSD: number;
  outputAmount: string;
  inputAmount: string;
  [key: string]: unknown;
}

export interface NormalizedScores {
  costScore: number;
  speedScore: number;
  reliabilityScore: number;
  liquidityScore: number;
}

export interface RankingWeights {
  cost: number;
  speed: number;
  reliability: number;
  liquidity: number;
}

export interface RankedBridgeRoute extends BridgeRouteInput {
  scores: NormalizedScores;
  finalScore: number;
  rank: number;
}
