export interface BridgeRoute {
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  token: string;
  fee: number;
  slippage: number;
  estimatedTime: number;
  reliabilityScore: number;
  historicalSuccessRate?: number;
}

export interface RecommendationInput {
  sourceChain: string;
  destinationChain: string;
  token: string;
  amount: number;
  account: string;
  networkContext?: Record<string, any>;
  routes: BridgeRoute[];
}

export interface RecommendationResult {
  rankedRoutes: Array<{ route: BridgeRoute; score: number; breakdown: Record<string, any> }>;
  errors?: string[];
}

export function recommendBridgeRoutes(input: RecommendationInput): RecommendationResult {
  const errors: string[] = [];
  if (!input.routes || input.routes.length === 0) {
    errors.push('No bridge routes available');
    return { rankedRoutes: [], errors };
  }

  // Fallback: rank by fee if metrics missing
  const hasMetrics = input.routes.some(r => r.reliabilityScore !== undefined && r.historicalSuccessRate !== undefined);

  const rankedRoutes = input.routes.map(route => {
    // Score calculation
    let score = 0;
    const breakdown: Record<string, any> = {};

    // Dynamic fee (lower is better)
    score += 100 - route.fee * 10;
    breakdown.fee = route.fee;

    // Slippage (lower is better)
    score += 100 - route.slippage * 10;
    breakdown.slippage = route.slippage;

    // Estimated time (lower is better)
    score += 100 - route.estimatedTime;
    breakdown.estimatedTime = route.estimatedTime;

    // Reliability (higher is better)
    if (route.reliabilityScore !== undefined) {
      score += route.reliabilityScore * 100;
      breakdown.reliabilityScore = route.reliabilityScore;
    }

    // Historical success rate (higher is better)
    if (route.historicalSuccessRate !== undefined) {
      score += route.historicalSuccessRate * 100;
      breakdown.historicalSuccessRate = route.historicalSuccessRate;
    }

    breakdown.score = score;
    return { route, score, breakdown };
  });

  // Sort by score descending
  rankedRoutes.sort((a, b) => b.score - a.score);

  return { rankedRoutes, errors };
}
