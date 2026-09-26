import { RankedRoute } from '../../../../src/services/route-ranker';
import { BenchmarkDataset } from './dataset-generator';

export interface EvaluationResult {
  scenario: string;
  isAccurate: boolean;
  expectedBestRouteId: string;
  actualBestRouteId: string | null;
  scoreDistribution: Record<string, number>;
}

export class Evaluator {
  static evaluate(dataset: BenchmarkDataset, rankedRoutes: RankedRoute[]): EvaluationResult {
    const actualBestRouteId = rankedRoutes.length > 0 ? rankedRoutes[0].id : null;
    const isAccurate = actualBestRouteId === dataset.expectedBestRouteId;

    const scoreDistribution = rankedRoutes.reduce((acc, route) => {
      acc[route.id] = route.score;
      return acc;
    }, {} as Record<string, number>);

    return {
      scenario: dataset.scenario,
      isAccurate,
      expectedBestRouteId: dataset.expectedBestRouteId,
      actualBestRouteId,
      scoreDistribution,
    };
  }
}
