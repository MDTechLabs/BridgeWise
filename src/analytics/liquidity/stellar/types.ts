export interface RouteLiquidity {
  route: string;
  availableLiquidity: number;
  requiredLiquidity: number;
}

export interface LiquidityResult {
  route: string;
  liquidityScore: number;
  hasShortage: boolean;
  availableLiquidity: number;
  requiredLiquidity: number;
}