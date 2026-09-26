import {
  StellarRoute,
  RecommendationInsight,
} from "./types";

export class RouteRecommendationInsights {
  generate(route: StellarRoute): RecommendationInsight {
    const reasons: string[] = [];

    if (route.fee < 0.5) {
      reasons.push("low transaction fee");
    }

    if (route.estimatedTime < 10) {
      reasons.push("fast settlement");
    }

    if (route.liquidity > 80) {
      reasons.push("high liquidity");
    }

    if (route.reliability >= 95) {
      reasons.push("excellent historical reliability");
    }

    if (reasons.length === 0) {
      reasons.push("balanced overall performance");
    }

    return {
      routeId: route.routeId,
      rankingScore: route.rankingScore,
      explanation:
        `Recommended because of ${reasons.join(", ")}.`,
      rankingFactors: {
        fee: route.fee,
        estimatedTime: route.estimatedTime,
        liquidity: route.liquidity,
        reliability: route.reliability,
      },
    };
  }

  generateForRoutes(
    routes: StellarRoute[]
  ): RecommendationInsight[] {
    return routes.map(route => this.generate(route));
  }
}