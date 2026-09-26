import { StellarLiquidityAnalyzer } from "./liquidityAnalyzer";

describe("StellarLiquidityAnalyzer", () => {
  const analyzer = new StellarLiquidityAnalyzer();

  it("calculates liquidity score", () => {
    const result = analyzer.analyze([
      {
        route: "USDC-XLM",
        availableLiquidity: 500,
        requiredLiquidity: 1000,
      },
    ]);

    expect(result[0].liquidityScore).toBe(50);
  });

  it("detects shortages", () => {
    const result = analyzer.detectShortages([
      {
        route: "USDC-XLM",
        availableLiquidity: 500,
        requiredLiquidity: 1000,
      },
      {
        route: "XLM-EURC",
        availableLiquidity: 2000,
        requiredLiquidity: 1000,
      },
    ]);

    expect(result).toHaveLength(1);
  });
});