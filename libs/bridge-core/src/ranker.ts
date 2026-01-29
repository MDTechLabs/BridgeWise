import { BridgeRoute } from './types';

/**
 * Configuration for route ranking weights
 */
export interface RankingWeights {
  /** Weight for cost (0-1, higher = more emphasis on cheaper routes) */
  costWeight: number;
  /** Weight for latency (0-1, higher = more emphasis on faster routes) */
  latencyWeight: number;
  /** Weight for reliability (0-1, higher = more emphasis on reliable routes) */
  reliabilityWeight: number;
}

/**
 * Default ranking weights (balanced approach)
 */
export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  costWeight: 0.4,
  latencyWeight: 0.4,
  reliabilityWeight: 0.2,
};

/**
 * Route ranker that scores routes based on configurable weights
 */
export class RouteRanker {
  private weights: RankingWeights;

  constructor(weights: RankingWeights = DEFAULT_RANKING_WEIGHTS) {
    this.weights = { ...weights };
    this.validateWeights();
  }

  /**
   * Update ranking weights
   */
  updateWeights(weights: Partial<RankingWeights>): void {
    this.weights = { ...this.weights, ...weights };
    this.validateWeights();
  }

  /**
   * Rank routes based on current weights
   */
  rankRoutes<T extends BridgeRoute | any>(routes: T[]): T[] {
    return [...routes].sort((a, b) => {
      const scoreA = this.calculateScore(a as unknown as BridgeRoute);
      const scoreB = this.calculateScore(b as unknown as BridgeRoute);
      return scoreB - scoreA; // Higher score first
    });
  }

  /**
   * Calculate composite score for a route
   */
  private calculateScore(route: BridgeRoute): number {
    const costScore = this.normalizeCost(route.feePercentage);
    const latencyScore = this.normalizeLatency(route.estimatedTime);
    const reliabilityScore = route.reliability;

    return (
      this.weights.costWeight * costScore +
      this.weights.latencyWeight * latencyScore +
      this.weights.reliabilityWeight * reliabilityScore
    );
  }

  /**
   * Normalize cost (lower fee percentage = higher score)
   * Fee percentage 0-100, normalized to 0-1 where 1 is best (cheapest)
   */
  private normalizeCost(feePercentage: number): number {
    // Clamp fee percentage to reasonable range
    const clamped = Math.max(0, Math.min(100, feePercentage));
    // Invert so lower fee = higher score
    return 1 - (clamped / 100);
  }

  /**
   * Normalize latency (lower time = higher score)
   * Time in seconds, normalized assuming 1 minute = baseline
   */
  private normalizeLatency(estimatedTime: number): number {
    // Clamp to reasonable range (1 second to 1 hour)
    const clamped = Math.max(1, Math.min(3600, estimatedTime));
    // Use exponential decay: score = e^(-time/60)
    // This gives high scores for fast routes, decaying for slower ones
    return Math.exp(-clamped / 60);
  }

  /**
   * Validate that weights sum to 1
   */
  private validateWeights(): void {
    const sum = this.weights.costWeight + this.weights.latencyWeight + this.weights.reliabilityWeight;
    if (Math.abs(sum - 1) > 0.001) {
      throw new Error(`Ranking weights must sum to 1, got ${sum}`);
    }

    // Validate individual weights are between 0 and 1
    Object.entries(this.weights).forEach(([key, value]) => {
      if (value < 0 || value > 1) {
        throw new Error(`${key} must be between 0 and 1, got ${value}`);
      }
    });
  }

  /**
   * Get current weights
   */
  getWeights(): RankingWeights {
    return { ...this.weights };
  }
}