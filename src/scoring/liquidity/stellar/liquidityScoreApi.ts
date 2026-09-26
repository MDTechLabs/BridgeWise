import { LiquidityScorer } from "./liquidityScorer";

export function getLiquidityScores(
  scorer: LiquidityScorer
) {
  return scorer.scoreAll();
}

export function getLiquidityScore(
  scorer: LiquidityScorer,
  assetCode: string
) {
  const asset = scorer
    .getAssets()
    .find(a => a.assetCode === assetCode);

  if (!asset) {
    return null;
  }

  return scorer.scoreAsset(asset);
}