export interface StellarRoute {
  routeId: string;
  sourceAsset: string;
  destinationAsset: string;
  estimatedTime: number; // seconds
  fee: number;
  liquidity: number;
  reliability: number; // 0 - 100
  rankingScore: number;
}

export interface RecommendationInsight {
  routeId: string;
  rankingScore: number;
  explanation: string;
  rankingFactors: {
    fee: number;
    estimatedTime: number;
    liquidity: number;
    reliability: number;
  };
}