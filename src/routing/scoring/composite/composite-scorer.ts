/**
 * File: src/routing/scoring/composite/composite-scorer.ts
 *
 * Composite route scoring.
 *
 * Combines fee, speed, reliability, and confidence into a single
 * normalised score. Lower fee and lower execution time are better;
 * higher reliability and confidence are better.
 */

import {
  DEFAULT_ROUTING_SCORING_WEIGHTS,
  type RoutingDimensionScores,
  type RoutingScoredEntry,
  type RoutingScoringWeights,
} from '../types';
import { normaliseWeights, validateScoringWeights } from '../scoring-weights';

// ─── Input Types ─────────────────────────────────────────────────────────────

/**
 * Raw scoring dimensions for a route.
 *
 * fee and speed are cost-like dimensions where lower values are better.
 * reliability and confidence are benefit-like dimensions where higher
 * values are better.
 */
export interface RoutingScoringMetrics {
  fee: number;
  speed: number;
  reliability: number;
  confidence: number;
}

/**
 * Extracts the scoring metrics from a route.
 *
 * This keeps the composite scorer independent of the concrete route shape.
 */
export type RoutingMetricsExtractor<T> = (route: T) => RoutingScoringMetrics;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function assertFiniteMetric(name: string, value: number, index: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `Route at index ${index} has an invalid ${name} value: ${value}`,
    );
  }
}

/**
 * Normalise a set of values into [0, 1].
 *
 * For benefit dimensions, the minimum becomes 0 and the maximum becomes 1.
 * For cost dimensions, the minimum becomes 1 and the maximum becomes 0.
 *
 * If every route has the same value, every route receives 1 because there
 * is no meaningful difference between the routes on that dimension.
 */
function normaliseDimension(
  values: number[],
  lowerIsBetter: boolean,
): number[] {
  if (values.length === 0) {
    return [];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  // No distinction can be made when every route has the same value.
  if (min === max) {
    return values.map(() => 1);
  }

  const range = max - min;

  return values.map((value) => {
    const normalised = (value - min) / range;

    return lowerIsBetter ? 1 - normalised : normalised;
  });
}

// ─── Composite Scoring ───────────────────────────────────────────────────────

/**
 * Scores and ranks a collection of routes using configurable weights.
 *
 * The scoring process is:
 *
 * 1. Extract raw metrics from every route.
 * 2. Normalise every dimension against the compared route set.
 * 3. Normalise the configured weights.
 * 4. Calculate the weighted composite score.
 * 5. Sort routes from highest score to lowest score.
 * 6. Assign a 1-based rank.
 *
 * Higher composite scores are better.
 */
export function scoreRoutes<T>(
  routes: readonly T[],
  getMetrics: RoutingMetricsExtractor<T>,
  weights: RoutingScoringWeights = DEFAULT_ROUTING_SCORING_WEIGHTS,
): RoutingScoredEntry<T>[] {
  if (routes.length === 0) {
    return [];
  }

  const weightErrors = validateScoringWeights(weights);

  if (weightErrors.length > 0) {
    throw new Error(
      `Invalid routing scoring weights: ${weightErrors.join('; ')}`,
    );
  }

  const metrics = routes.map((route, index) => {
    const value = getMetrics(route);

    assertFiniteMetric('fee', value.fee, index);
    assertFiniteMetric('speed', value.speed, index);
    assertFiniteMetric('reliability', value.reliability, index);
    assertFiniteMetric('confidence', value.confidence, index);

    return value;
  });

  const feeScores = normaliseDimension(
    metrics.map((metric) => metric.fee),
    true,
  );

  const speedScores = normaliseDimension(
    metrics.map((metric) => metric.speed),
    true,
  );

  const reliabilityScores = normaliseDimension(
    metrics.map((metric) => metric.reliability),
    false,
  );

  const confidenceScores = normaliseDimension(
    metrics.map((metric) => metric.confidence),
    false,
  );

  const dimensionScores: RoutingDimensionScores[] = routes.map((_, index) => ({
    feeScore: feeScores[index],
    speedScore: speedScores[index],
    reliabilityScore: reliabilityScores[index],
    confidenceScore: confidenceScores[index],
  }));

  const normalisedWeights = normaliseWeights(weights);

  const scored = routes.map((route, index) => {
    const scores = dimensionScores[index];

    const compositeScore =
      scores.feeScore * normalisedWeights.feeWeight +
      scores.speedScore * normalisedWeights.speedWeight +
      scores.reliabilityScore * normalisedWeights.reliabilityWeight +
      scores.confidenceScore * normalisedWeights.confidenceWeight;

    return {
      route,
      dimensionScores: scores,
      compositeScore,
      originalIndex: index,
    };
  });

  // Stable ordering:
  // - higher composite score first
  // - original order is retained when scores are identical
  scored.sort((a, b) => {
    const scoreDifference = b.compositeScore - a.compositeScore;

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return a.originalIndex - b.originalIndex;
  });

  return scored.map(
    ({ route, dimensionScores: scores, compositeScore }, index) => ({
      route,
      dimensionScores: scores,
      compositeScore,
      rank: index + 1,
    }),
  );
}

/**
 * Scores a single set of already-normalised dimensions.
 *
 * This helper is useful when another scoring layer has already performed
 * normalisation and only needs the weighted composite calculation.
 */
export function calculateCompositeScore(
  dimensionScores: RoutingDimensionScores,
  weights: RoutingScoringWeights = DEFAULT_ROUTING_SCORING_WEIGHTS,
): number {
  const weightErrors = validateScoringWeights(weights);

  if (weightErrors.length > 0) {
    throw new Error(
      `Invalid routing scoring weights: ${weightErrors.join('; ')}`,
    );
  }

  const normalisedWeights = normaliseWeights(weights);

  return (
    dimensionScores.feeScore * normalisedWeights.feeWeight +
    dimensionScores.speedScore * normalisedWeights.speedWeight +
    dimensionScores.reliabilityScore * normalisedWeights.reliabilityWeight +
    dimensionScores.confidenceScore * normalisedWeights.confidenceWeight
  );
}
