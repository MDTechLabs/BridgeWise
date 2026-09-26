import {
  StellarMultiHopAnalyzer,
  stellarMultiHopAnalyzer,
} from "./multiHopAnalyzer";
import { MultiHopRoute, RouteHop } from "./types";

/**
 * Build a simple chain of hops connecting source → ... → destination.
 * Convenience helper for readable test setup.
 */
function buildRoute(
  routeId: string,
  links: Array<[source: string, destination: string, cost: number, latency: number]>,
): MultiHopRoute {
  const hops: RouteHop[] = links.map(([source, destination, cost, latency]) => ({
    source,
    destination,
    cost,
    latency,
  }));
  return { routeId, hops };
}

describe("StellarMultiHopAnalyzer", () => {
  const analyzer = new StellarMultiHopAnalyzer();

  describe("detectRouteHops", () => {
    it("counts zero hops for an empty route", () => {
      expect(analyzer.detectRouteHops({ routeId: "empty", hops: [] })).toBe(0);
    });

    it("counts the number of hops in a multi-hop route", () => {
      const hops = analyzer.detectRouteHops(
        buildRoute("route-1", [
          ["XLM", "USDC", 1, 2],
          ["USDC", "EURC", 2, 3],
        ]),
      );
      expect(hops).toBe(2);
    });
  });

  describe("analyze — cumulative cost & latency", () => {
    it("returns the expected slice fields for a 2-hop route", () => {
      const result = analyzer.analyze(
        buildRoute("route-1", [
          ["XLM", "USDC", 1, 2],
          ["USDC", "EURC", 2, 3],
        ]),
      );

      expect(result.totalCost).toBe(3);
      expect(result.totalLatency).toBe(5);
      expect(result.hopCount).toBe(2);
    });

    it("returns zeros when the route has no hops", () => {
      const result = analyzer.analyze({ routeId: "empty", hops: [] });

      expect(result.totalCost).toBe(0);
      expect(result.totalLatency).toBe(0);
      expect(result.hopCount).toBe(0);
      expect(result.averageCostPerHop).toBe(0);
      expect(result.averageLatencyPerHop).toBe(0);
      expect(result.chainValidation.isValid).toBe(true);
      expect(result.rating).toBe("efficient");
    });
  });

  describe("analyze — per-hop statistics", () => {
    it("summarizes min/max/total/average per cost and latency", () => {
      const result = analyzer.analyze(
        buildRoute("route-1", [
          ["A", "B", 1, 2],
          ["B", "C", 4, 1],
          ["C", "D", 2, 5],
        ]),
      );

      expect(result.costBreakdown.total).toBe(7);
      expect(result.costBreakdown.max).toBe(4);
      expect(result.costBreakdown.maxHopIndex).toBe(1);
      expect(result.costBreakdown.min).toBe(1);
      expect(result.costBreakdown.minHopIndex).toBe(0);
      expect(result.costBreakdown.average).toBeCloseTo(7 / 3);

      expect(result.latencyBreakdown.total).toBe(8);
      expect(result.latencyBreakdown.max).toBe(5);
      expect(result.latencyBreakdown.maxHopIndex).toBe(2);
      expect(result.latencyBreakdown.min).toBe(1);
      expect(result.latencyBreakdown.minHopIndex).toBe(1);
    });

    it("populates hopAnalyses with cost and latency shares", () => {
      const result = analyzer.analyze(
        buildRoute("route-1", [
          ["A", "B", 1, 3],
          ["B", "C", 3, 1],
        ]),
      );

      expect(result.hopAnalyses).toHaveLength(2);
      expect(result.hopAnalyses[0]).toMatchObject({
        hopIndex: 0,
        source: "A",
        destination: "B",
        cost: 1,
        latency: 3,
        costShare: 0.25,
        latencyShare: 0.75,
      });
      expect(result.hopAnalyses[1]).toMatchObject({
        hopIndex: 1,
        costShare: 0.75,
        latencyShare: 0.25,
      });
    });
  });

  describe("analyze — chain validation", () => {
    it("marks a continuous chain as valid", () => {
      const result = analyzer.analyze(
        buildRoute("route-1", [
          ["XLM", "USDC", 1, 2],
          ["USDC", "EURC", 2, 3],
          ["EURC", "BTC", 4, 5],
        ]),
      );
      expect(result.chainValidation.isValid).toBe(true);
      expect(result.chainValidation.breakHopIndex).toBe(-1);
      expect(result.chainValidation.issue).toBeNull();
    });

    it("flags a broken chain with the offending hop index", () => {
      const result = analyzer.analyze(
        // Second hop source doesn't match first hop destination.
        buildRoute("route-1", [
          ["XLM", "USDC", 1, 2],
          ["BTC", "ETH", 2, 3],
        ]),
      );
      expect(result.chainValidation.isValid).toBe(false);
      expect(result.chainValidation.breakHopIndex).toBe(0);
      expect(result.chainValidation.issue).toContain("does not match");
    });

    it("surfaces the broken-chain issue in the insight, ahead of the rating", () => {
      const result = analyzer.analyze(
        buildRoute("route-1", [
          ["A", "B", 1, 100],
          ["X", "Y", 1, 100], // no chain continuity
        ]),
      );
      expect(result.chainValidation.isValid).toBe(false);
      expect(result.insight).toMatch(/chain is broken/);
      expect(result.insight).toMatch(/does not match/);
    });
  });

  describe("analyze — single-hop routes", () => {
    it("treats a one-hop route as a trivially valid chain", () => {
      const result = analyzer.analyze(
        buildRoute("route-1", [["XLM", "USDC", 2, 200]]),
      );
      expect(result.hopCount).toBe(1);
      expect(result.chainValidation.isValid).toBe(true);
      expect(result.costBreakdown.max).toBe(2);
      expect(result.costBreakdown.min).toBe(2);
      expect(result.costBreakdown.maxHopIndex).toBe(0);
      expect(result.costBreakdown.minHopIndex).toBe(0);
      expect(result.hopAnalyses[0]).toMatchObject({
        hopIndex: 0,
        costShare: 1,
        latencyShare: 1,
      });
      expect(result.rating).toBe("efficient");
    });
  });

  describe("analyze — rating threshold boundaries", () => {
    it("does NOT mark a route as 'expensive' when averageCostPerHop exactly equals the threshold", () => {
      // Default expensiveCostPerHopThreshold is 5; avg cost of 5 must NOT trigger 'expensive'.
      const at = new StellarMultiHopAnalyzer().analyze(
        buildRoute("route-1", [
          ["A", "B", 5, 100],
        ]),
      );
      expect(at.rating).not.toBe("expensive");
    });

    it("marks a route as 'expensive' immediately above the threshold", () => {
      const justOver = new StellarMultiHopAnalyzer().analyze(
        buildRoute("route-1", [
          ["A", "B", 5.01, 100],
        ]),
      );
      expect(justOver.rating).toBe("expensive");
    });
  });

  describe("analyze — rating & insight", () => {
    it("rates a balanced route as 'efficient'", () => {
      const result = analyzer.analyze(
        buildRoute("route-1", [
          ["A", "B", 1, 100],
          ["B", "C", 1, 100],
        ]),
      );
      expect(result.rating).toBe("efficient");
      expect(result.insight).toMatch(/efficient/);
    });

    it("rates a high-cost route as 'expensive'", () => {
      const result = analyzer.analyze(
        buildRoute("route-1", [
          ["A", "B", 100, 1],
          ["B", "C", 100, 1],
        ]),
      );
      expect(result.rating).toBe("expensive");
      expect(result.insight).toMatch(/expensive/);
    });

    it("rates a high-latency route as 'slow'", () => {
      const result = analyzer.analyze(
        buildRoute("route-1", [
          ["A", "B", 1, 20_000],
          ["B", "C", 1, 20_000],
        ]),
      );
      expect(result.rating).toBe("slow");
      expect(result.insight).toMatch(/slow/);
    });

    it("rates routes that are both expensive and slow as 'suboptimal'", () => {
      const result = analyzer.analyze(
        buildRoute("route-1", [
          ["A", "B", 100, 20_000],
          ["B", "C", 100, 20_000],
        ]),
      );
      expect(result.rating).toBe("suboptimal");
    });

    it("flags a high hop count as 'suboptimal' even with low cost/latency", () => {
      const manyHops = Array.from({ length: 10 }, (_, i) => [
        String(i),
        String(i + 1),
        0.1,
        100,
      ] as [string, string, number, number]);
      const result = analyzer.analyze(buildRoute("route-1", manyHops));
      expect(result.rating).toBe("suboptimal");
    });

    it("uses overridden thresholds when provided", () => {
      const permissive = new StellarMultiHopAnalyzer({
        expensiveCostPerHopThreshold: 1_000,
        slowLatencyPerHopThresholdMs: 1_000_000,
        suboptimalHopCountThreshold: 100,
      });
      const result = permissive.analyze(
        buildRoute("route-1", [
          ["A", "B", 50, 5_000],
          ["B", "C", 50, 5_000],
          ["C", "D", 50, 5_000],
        ]),
      );
      expect(result.rating).toBe("efficient");
      expect(permissive.getOptions().expensiveCostPerHopThreshold).toBe(1_000);
    });
  });

  describe("analyzeRoutes — comparison & ranking", () => {
    it("returns an empty array when no routes are supplied", () => {
      expect(analyzer.analyzeRoutes([])).toEqual([]);
    });

    it("ranks cheaper routes ahead of more expensive ones with same hop count", () => {
      const cheap = buildRoute("cheap", [
        ["A", "B", 1, 100],
        ["B", "C", 1, 100],
      ]);
      const expensive = buildRoute("expensive", [
        ["A", "B", 99, 100],
        ["B", "C", 99, 100],
      ]);
      const ranked = analyzer.analyzeRoutes([expensive, cheap]);

      expect(ranked).toHaveLength(2);
      expect(ranked[0].routeId).toBe("cheap");
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].routeId).toBe("expensive");
      expect(ranked[1].rank).toBe(2);
    });

    it("breaks ties on cost by lower latency", () => {
      const slow = buildRoute("slow", [
        ["A", "B", 1, 1_000],
        ["B", "C", 1, 1_000],
      ]);
      const fast = buildRoute("fast", [
        ["A", "B", 1, 100],
        ["B", "C", 1, 100],
      ]);
      const ranked = analyzer.analyzeRoutes([slow, fast]);
      expect(ranked[0].routeId).toBe("fast");
      expect(ranked[1].routeId).toBe("slow");
    });

    it("breaks further ties on cost+latency by hop count", () => {
      const many = buildRoute("many", [
        ["A", "B", 1, 100],
        ["B", "C", 1, 100],
        ["C", "D", 1, 100],
      ]);
      const few = buildRoute("few", [
        ["A", "B", 1, 150],
        ["B", "C", 2, 150],
      ]);
      // Equal cost (3), equal latency (300), fewer hops wins.
      const ranked = analyzer.analyzeRoutes([many, few]);
      expect(ranked[0].routeId).toBe("few");
      expect(ranked[1].routeId).toBe("many");
    });
  });

  describe("validateChain (standalone)", () => {
    it("returns isValid=true with no issue for an empty chain", () => {
      const result = analyzer.validateChain([]);
      expect(result.isValid).toBe(true);
      expect(result.breakHopIndex).toBe(-1);
      expect(result.issue).toBeNull();
    });

    it("returns isValid=true for a single hop", () => {
      const result = analyzer.validateChain([
        { source: "A", destination: "B", cost: 1, latency: 1 },
      ]);
      expect(result.isValid).toBe(true);
    });
  });

  describe("default singleton", () => {
    it("exposes a shared analyzer with default thresholds", () => {
      expect(stellarMultiHopAnalyzer).toBeInstanceOf(StellarMultiHopAnalyzer);
      expect(
        stellarMultiHopAnalyzer.getOptions().expensiveCostPerHopThreshold,
      ).toBe(5);
      expect(
        stellarMultiHopAnalyzer.getOptions().slowLatencyPerHopThresholdMs,
      ).toBe(5_000);
    });
  });
});
