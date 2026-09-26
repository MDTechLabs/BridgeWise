import {
  HealthSummary,
  NormalizedProviderStatus,
  ProviderState,
  RawProviderStatus,
} from "./types";

const STATE_ALIASES: Record<string, ProviderState> = {
  operational: "operational",
  ok: "operational",
  healthy: "operational",
  up: "operational",
  online: "operational",
  degraded: "degraded",
  partial: "degraded",
  slow: "degraded",
  down: "down",
  offline: "down",
  unavailable: "down",
  error: "down",
};

export class SorobanProviderStatusAggregator {
  normalize(raw: RawProviderStatus): NormalizedProviderStatus {
    return {
      providerId: raw.providerId,
      state: this.normalizeState(raw.state),
      latency: raw.latency ?? 0,
      errorRate: raw.errorRate ?? 0,
    };
  }

  collect(
    statuses: RawProviderStatus[]
  ): NormalizedProviderStatus[] {
    return statuses.map((status) => this.normalize(status));
  }

  summarize(statuses: RawProviderStatus[]): HealthSummary {
    const normalized = this.collect(statuses);

    const operational = normalized.filter(
      (status) => status.state === "operational"
    ).length;
    const degraded = normalized.filter(
      (status) => status.state === "degraded"
    ).length;
    const down = normalized.filter(
      (status) => status.state === "down"
    ).length;

    const total = normalized.length;
    const healthScore =
      total > 0
        ? (operational + degraded * 0.5) / total
        : 0;

    return {
      total,
      operational,
      degraded,
      down,
      healthScore,
    };
  }

  private normalizeState(state: string): ProviderState {
    return STATE_ALIASES[state.trim().toLowerCase()] ?? "down";
  }
}
