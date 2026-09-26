import {
  StellarRoute,
} from "./types";

import { RouteRecommendationInsights } from "./routeRecommendationInsights";

const insightEngine = new RouteRecommendationInsights();

export function attachRecommendationInsights(
  routes: StellarRoute[]
) {
  return routes.map(route => ({
    ...route,
    insight: insightEngine.generate(route),
  }));
}