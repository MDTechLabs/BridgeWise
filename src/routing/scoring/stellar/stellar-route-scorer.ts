/**
 * File: src/routing/scoring/stellar/stellar-route-scorer.ts
 *
 * Stellar-specific route scoring entry point.
 *
 * The scorer remains generic over the concrete Stellar route type.
 * Callers provide a metric extractor so this module does not need
 * to depend on a particular route representation.
 */

import type { RoutingScoredEntry, RoutingScoringWeights } from '../types';
import {
  scoreRoutes,
  type RoutingMetricsExtractor,
} from '../composite/composite-scorer';

/**
 * Score and rank Stellar routes using the composite routing scorer.
 *
 * The route type is intentionally generic because different Stellar
 * routing layers may represent a route differently.
 */
export function scoreStellarRoutes<T>(
  routes: readonly T[],
  getMetrics: RoutingMetricsExtractor<T>,
  weights?: RoutingScoringWeights,
): RoutingScoredEntry<T>[] {
  return scoreRoutes(routes, getMetrics, weights);
}
