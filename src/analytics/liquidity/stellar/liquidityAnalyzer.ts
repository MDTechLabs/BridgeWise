import { LiquidityResult, RouteLiquidity } from "./types";

export class StellarLiquidityAnalyzer {
  analyze(routes: RouteLiquidity[]): LiquidityResult[] {
    return routes.map((route) => {
      const liquidityScore =
        route.requiredLiquidity === 0
          ? 100
          : Math.min(
              100,
              Math.round(
                (route.availableLiquidity / route.requiredLiquidity) * 100
              )
            );

      return {
        route: route.route,
        liquidityScore,
        hasShortage:
          route.availableLiquidity < route.requiredLiquidity,
        availableLiquidity: route.availableLiquidity,
        requiredLiquidity: route.requiredLiquidity,
      };
    });
  }

  detectShortages(
    routes: RouteLiquidity[]
  ): RouteLiquidity[] {
    return routes.filter(
      (route) =>
        route.availableLiquidity < route.requiredLiquidity
    );
  }
}