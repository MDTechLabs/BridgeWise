export interface AssetLiquidity {
  assetCode: string;
  assetIssuer?: string;
  liquidity: number; // Total bridge liquidity
}

export interface LiquidityScore {
  assetCode: string;
  liquidity: number;
  score: number;
  rating: "Excellent" | "High" | "Medium" | "Low";
}