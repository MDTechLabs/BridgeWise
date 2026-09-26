import {
  ProviderMetrics,
  ProviderRanking,
  RankingFilter,
  RankingWeights,
} from "./types";

const DEFAULT_WEIGHTS: RankingWeights = {
  uptime: 0.3,
  latency: 0.2,
  successRate: 0.4,
  volume: 0.1,
};

export class StellarProviderRankingEngine {
  constructor(
    private readonly weights: RankingWeights = DEFAULT_WEIGHTS
  ) {}

  score(metrics: ProviderMetrics): number {
    const latencyScore =
      metrics.avgLatency > 0
        ? 1 / metrics.avgLatency
        : 0;

    return (
      metrics.uptime * this.weights.uptime +
      latencyScore * this.weights.latency +
      metrics.successRate * this.weights.successRate +
      metrics.totalVolume * this.weights.volume
    );
  }

  rank(
    providers: ProviderMetrics[],
    filter: RankingFilter = {}
  ): ProviderRanking[] {
    return providers
      .filter((provider) => this.matchesFilter(provider, filter))
      .map((provider) => ({
        providerId: provider.providerId,
        score: this.score(provider),
        rank: 0,
      }))
      .sort((a, b) => b.score - a.score)
      .map((ranking, index) => ({
        ...ranking,
        rank: index + 1,
      }));
  }

  private matchesFilter(
    metrics: ProviderMetrics,
    filter: RankingFilter
  ): boolean {
    if (
      filter.minUptime !== undefined &&
      metrics.uptime < filter.minUptime
    ) {
      return false;
    }

    if (
      filter.minSuccessRate !== undefined &&
      metrics.successRate < filter.minSuccessRate
    ) {
      return false;
    }

    if (
      filter.maxLatency !== undefined &&
      metrics.avgLatency > filter.maxLatency
    ) {
      return false;
    }

    return true;
  }
}
