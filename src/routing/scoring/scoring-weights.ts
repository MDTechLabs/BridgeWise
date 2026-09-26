/**
 * File: src/routing/scoring/scoring-weights.ts
 *
 * Utility helpers for working with routing scoring weights.
 *
 * These helpers are shared by the route-level scoring layer and can be
 * used by any consumer that needs to validate, merge, or normalise
 * weight configurations.
 */

import {
  DEFAULT_ROUTING_SCORING_WEIGHTS,
  type RoutingScoringWeights,
} from './types';

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validates that all weights are in the range [0, 1].
 *
 * Returns an array of error messages. An empty array means the weights
 * are valid.
 */
export function validateScoringWeights(
  weights: RoutingScoringWeights,
): string[] {
  const errors: string[] = [];
  for (const [key, value] of Object.entries(weights)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`${key} must be a finite number, got ${value}`);
    } else if (value < 0 || value > 1) {
      errors.push(`${key} must be between 0 and 1, got ${value}`);
    }
  }
  return errors;
}

// ─── Merging ─────────────────────────────────────────────────────────────────

/**
 * Merge partial weight overrides onto a base weight configuration.
 *
 * Missing keys in the override fall back to the base values.
 */
export function mergeScoringWeights(
  base: RoutingScoringWeights = DEFAULT_ROUTING_SCORING_WEIGHTS,
  overrides: Partial<RoutingScoringWeights> = {},
): RoutingScoringWeights {
  return { ...base, ...overrides };
}

// ─── Normalisation ───────────────────────────────────────────────────────────

/**
 * Normalise weights so they sum to exactly 1.
 *
 * If all weights are 0 the function returns equal weights for each
 * dimension. This is useful for display or for feeding into algorithms
 * that require a probability distribution.
 */
export function normaliseWeights(
  weights: RoutingScoringWeights,
): RoutingScoringWeights {
  const total =
    weights.feeWeight +
    weights.speedWeight +
    weights.reliabilityWeight +
    weights.confidenceWeight;

  if (total === 0) {
    return {
      feeWeight: 0.25,
      speedWeight: 0.25,
      reliabilityWeight: 0.25,
      confidenceWeight: 0.25,
    };
  }

  return {
    feeWeight: weights.feeWeight / total,
    speedWeight: weights.speedWeight / total,
    reliabilityWeight: weights.reliabilityWeight / total,
    confidenceWeight: weights.confidenceWeight / total,
  };
}
