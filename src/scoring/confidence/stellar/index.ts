/**
 * Stellar route confidence scoring.
 *
 * Assigns a confidence level (0–1) to a route recommendation based on
 * route reliability, data freshness, sample size, and consensus strength.
 * A higher score means the recommendation can be trusted with more certainty.
 */

export interface RouteConfidenceInput {
  /** Historical success rate for this route (0–1) */
  successRate?: number;
  /** Number of completed transfers used to compute successRate */
  sampleSize?: number;
  /** Age of the most recent data point in seconds */
  dataAgeSeconds?: number;
  /** Agreement ratio across data sources (0–1) */
  consensusRatio?: number;
}

export interface RouteConfidenceResult {
  /** Confidence score in the range [0, 1] */
  confidence: number;
  /** Human-readable tier label */
  tier: 'high' | 'medium' | 'low';
  /** Metadata passthrough for downstream display */
  metadata: RouteConfidenceInput;
}

const THRESHOLDS = { high: 0.75, medium: 0.4 } as const;
const MIN_SAMPLE = 10;
const MAX_FRESH_AGE_S = 300; // 5 minutes

function tier(score: number): RouteConfidenceResult['tier'] {
  if (score >= THRESHOLDS.high) return 'high';
  if (score >= THRESHOLDS.medium) return 'medium';
  return 'low';
}

/**
 * Calculates a confidence score for a single Stellar route recommendation.
 */
export function calculateRouteConfidence(
  input: RouteConfidenceInput,
): RouteConfidenceResult {
  const components: number[] = [];

  if (input.successRate !== undefined) {
    components.push(Math.max(0, Math.min(1, input.successRate)));
  }

  if (input.sampleSize !== undefined) {
    // Logarithmic ramp: reaches 1.0 at MIN_SAMPLE, asymptotes beyond
    components.push(Math.min(1, input.sampleSize / MIN_SAMPLE));
  }

  if (input.dataAgeSeconds !== undefined) {
    components.push(
      Math.max(0, 1 - input.dataAgeSeconds / MAX_FRESH_AGE_S),
    );
  }

  if (input.consensusRatio !== undefined) {
    components.push(Math.max(0, Math.min(1, input.consensusRatio)));
  }

  const confidence =
    components.length > 0
      ? components.reduce((sum, v) => sum + v, 0) / components.length
      : 0.5;

  return { confidence, tier: tier(confidence), metadata: input };
}

/**
 * Scores an array of routes and attaches confidence metadata to each.
 */
export function scoreRoutesConfidence(
  inputs: RouteConfidenceInput[],
): RouteConfidenceResult[] {
  return inputs.map(calculateRouteConfidence);
}
