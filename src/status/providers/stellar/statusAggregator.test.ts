import { SorobanProviderStatusAggregator } from "./statusAggregator";
import { RawProviderStatus } from "./types";

describe("SorobanProviderStatusAggregator", () => {
  const aggregator = new SorobanProviderStatusAggregator();

  const statuses: RawProviderStatus[] = [
    { providerId: "provider-a", state: "OK", latency: 120 },
    { providerId: "provider-b", state: "degraded", errorRate: 0.1 },
    { providerId: "provider-c", state: "offline" },
    { providerId: "provider-d", state: "unknown-value" },
  ];

  it("normalizes varied status formats into canonical states", () => {
    const normalized = aggregator.collect(statuses);

    expect(normalized.map((s) => s.state)).toEqual([
      "operational",
      "degraded",
      "down",
      "down",
    ]);
  });

  it("defaults missing latency and error rate to zero", () => {
    const normalized = aggregator.normalize({
      providerId: "provider-x",
      state: "healthy",
    });

    expect(normalized.latency).toBe(0);
    expect(normalized.errorRate).toBe(0);
    expect(normalized.state).toBe("operational");
  });

  it("generates a health summary", () => {
    const summary = aggregator.summarize(statuses);

    expect(summary.total).toBe(4);
    expect(summary.operational).toBe(1);
    expect(summary.degraded).toBe(1);
    expect(summary.down).toBe(2);
    expect(summary.healthScore).toBeCloseTo(0.375);
  });

  it("returns a zero health score for no providers", () => {
    const summary = aggregator.summarize([]);

    expect(summary.total).toBe(0);
    expect(summary.healthScore).toBe(0);
  });
});
