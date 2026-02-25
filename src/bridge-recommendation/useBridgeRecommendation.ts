import { useState, useEffect } from 'react';
import { recommendBridgeRoutes, RecommendationInput, RecommendationResult } from './bridge-recommendation.engine';

export function useBridgeRecommendation(input: RecommendationInput) {
  const [result, setResult] = useState<RecommendationResult>({ rankedRoutes: [], errors: [] });

  useEffect(() => {
    if (input.routes && input.routes.length > 0) {
      setResult(recommendBridgeRoutes(input));
    } else {
      setResult({ rankedRoutes: [], errors: ['No bridge routes available'] });
    }
  }, [input]);

  return result;
}
