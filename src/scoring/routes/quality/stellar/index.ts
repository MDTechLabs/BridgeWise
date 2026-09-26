export interface RouteQualityMetrics {
  latencyMs?: number;
  reliabilityScore?: number;
  feeStroops?: number;
}

export interface RouteWithMetrics<T> {
  route: T;
  metrics: RouteQualityMetrics;
}

export interface ScoredRoute<T> extends RouteWithMetrics<T> {
  qualityScore: number;
}

export interface QualityWeights {
  latency: number;
  reliability: number;
  fee: number;
}

const DEFAULT_WEIGHTS: QualityWeights = {
  reliability: 0.4,
  fee: 0.4,
  latency: 0.2,
};

/**
 * Generates holistic quality scores for Stellar bridge routes.
 * Optimized for O(N) time and O(1) extra space complexity (excluding output) by using a two-pass approach.
 * 
 * @param routes - Array of routes containing their respective metrics
 * @param weights - Optional custom weights for scoring (default: Reliability 40%, Fee 40%, Latency 20%)
 * @returns Array of ScoredRoutes with computed quality scores
 */
export function calculateQualityScores<T>(
  routes: RouteWithMetrics<T>[],
  weights: QualityWeights = DEFAULT_WEIGHTS
): ScoredRoute<T>[] {
  if (routes.length === 0) return [];
  if (routes.length === 1) {
    return [{ ...routes[0], qualityScore: 1.0 }];
  }

  // Pass 1: Find min and max for each metric to use for normalization
  // Space complexity: O(1)
  // Time complexity: O(N)
  let minLatency = Infinity, maxLatency = -Infinity;
  let minReliability = Infinity, maxReliability = -Infinity;
  let minFee = Infinity, maxFee = -Infinity;

  let hasLatency = false, hasReliability = false, hasFee = false;

  for (const r of routes) {
    const { latencyMs, reliabilityScore, feeStroops } = r.metrics;
    
    if (latencyMs !== undefined) {
      if (latencyMs < minLatency) minLatency = latencyMs;
      if (latencyMs > maxLatency) maxLatency = latencyMs;
      hasLatency = true;
    }
    
    if (reliabilityScore !== undefined) {
      if (reliabilityScore < minReliability) minReliability = reliabilityScore;
      if (reliabilityScore > maxReliability) maxReliability = reliabilityScore;
      hasReliability = true;
    }
    
    if (feeStroops !== undefined) {
      if (feeStroops < minFee) minFee = feeStroops;
      if (feeStroops > maxFee) maxFee = feeStroops;
      hasFee = true;
    }
  }

  // Pass 2: Normalize values and calculate composite score
  // Space complexity: O(N) for output array
  // Time complexity: O(N)
  const scoredRoutes: ScoredRoute<T>[] = [];

  for (const r of routes) {
    const { latencyMs, reliabilityScore, feeStroops } = r.metrics;

    let latencyNorm = 0.5; // Neutral default
    if (hasLatency && latencyMs !== undefined) {
      if (maxLatency > minLatency) {
        // Lower latency is better
        latencyNorm = 1 - (latencyMs - minLatency) / (maxLatency - minLatency);
      } else {
        latencyNorm = 1.0;
      }
    }

    let reliabilityNorm = 0.5;
    if (hasReliability && reliabilityScore !== undefined) {
      if (maxReliability > minReliability) {
        // Higher reliability is better
        reliabilityNorm = (reliabilityScore - minReliability) / (maxReliability - minReliability);
      } else {
        reliabilityNorm = 1.0;
      }
    }

    let feeNorm = 0.5;
    if (hasFee && feeStroops !== undefined) {
      if (maxFee > minFee) {
        // Lower fee is better
        feeNorm = 1 - (feeStroops - minFee) / (maxFee - minFee);
      } else {
        feeNorm = 1.0;
      }
    }

    // Calculate total applicable weights
    let totalWeight = 0;
    let score = 0;

    if (latencyMs !== undefined) {
      score += latencyNorm * weights.latency;
      totalWeight += weights.latency;
    }
    
    if (reliabilityScore !== undefined) {
      score += reliabilityNorm * weights.reliability;
      totalWeight += weights.reliability;
    }
    
    if (feeStroops !== undefined) {
      score += feeNorm * weights.fee;
      totalWeight += weights.fee;
    }

    // If no metrics were provided, return a neutral score
    const qualityScore = totalWeight > 0 ? score / totalWeight : 0.5;

    scoredRoutes.push({
      ...r,
      qualityScore,
    });
  }

  return scoredRoutes;
}
