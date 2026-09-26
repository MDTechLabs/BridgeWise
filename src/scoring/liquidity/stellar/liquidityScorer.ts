import {
  AssetLiquidity,
  LiquidityScore,
} from "./types";

export class LiquidityScorer {
  private assets: AssetLiquidity[] = [];

  addAsset(asset: AssetLiquidity) {
    this.assets.push(asset);
  }

  getAssets() {
    return [...this.assets];
  }

  clear() {
    this.assets = [];
  }

  scoreAsset(asset: AssetLiquidity): LiquidityScore {
    const maxLiquidity = Math.max(
      ...this.assets.map(a => a.liquidity),
      asset.liquidity,
      1
    );

    const score = Number(
      ((asset.liquidity / maxLiquidity) * 100).toFixed(2)
    );

    let rating: LiquidityScore["rating"];

    if (score >= 85) {
      rating = "Excellent";
    } else if (score >= 70) {
      rating = "High";
    } else if (score >= 40) {
      rating = "Medium";
    } else {
      rating = "Low";
    }

    return {
      assetCode: asset.assetCode,
      liquidity: asset.liquidity,
      score,
      rating,
    };
  }

  scoreAll(): LiquidityScore[] {
    return this.assets.map(asset =>
      this.scoreAsset(asset)
    );
  }
}