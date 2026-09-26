import { StellarProviderRankingEngine } from "./rankingEngine";
import { ProviderMetrics } from "./types";

describe("StellarProviderRankingEngine", () => {
  const engine = new StellarProviderRankingEngine();

  const providers: ProviderMetrics[] = [
    {
      providerId: "provider-a",
      uptime: 0.99,
      avgLatency: 100,
      successRate: 0.98,
      totalVolume: 0.5,
    },
    {
      providerId: "provider-b",
      uptime: 0.95,
      avgLatency: 250,
      successRate: 0.9,
      totalVolume: 0.2,
    },
    {
      providerId: "provider-c",
      uptime: 0.8,
      avgLatency: 500,
      successRate: 0.7,
      totalVolume: 0.1,
    },
  ];

  it("generates rankings ordered by score", () => {
    const rankings = engine.rank(providers);

    expect(rankings.map((r) => r.providerId)).toEqual([
      "provider-a",
      "provider-b",
      "provider-c",
    ]);
    expect(rankings[0].rank).toBe(1);
    expect(rankings[2].rank).toBe(3);
  });

  it("assigns higher score to the better provider", () => {
    const best = engine.score(providers[0]);
    const worst = engine.score(providers[2]);

    expect(best).toBeGreaterThan(worst);
  });

  it("supports ranking filters", () => {
    const rankings = engine.rank(providers, {
      minSuccessRate: 0.95,
      maxLatency: 200,
    });

    expect(rankings).toHaveLength(1);
    expect(rankings[0].providerId).toBe("provider-a");
    expect(rankings[0].rank).toBe(1);
  });
});
