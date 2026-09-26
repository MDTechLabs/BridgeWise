import { PathFinder } from "../path-finder";
import { CostCalculator } from "../cost-calculator";
import { GraphEdge } from "../types";

function makeEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    sourceNode: "USDC:stellar",
    targetNode: "USDC:ethereum",
    provider: "stellar",
    fee: 0.005,
    latencyMs: 15000,
    liquidity: 10000,
    isActive: true,
    ...overrides,
  };
}

describe("PathFinder", () => {
  let finder: PathFinder;

  beforeEach(() => {
    finder = new PathFinder();
  });

  describe("addEdge / addEdges / buildGraph", () => {
    it("adds a single edge", () => {
      finder.addEdge(makeEdge());
      expect(finder.getRoutesFrom("USDC:stellar")).toHaveLength(1);
    });

    it("adds multiple edges", () => {
      finder.addEdges([
        makeEdge({ sourceNode: "USDC:stellar", targetNode: "USDC:ethereum" }),
        makeEdge({ sourceNode: "USDC:stellar", targetNode: "USDC:polygon" }),
      ]);
      expect(finder.getRoutesFrom("USDC:stellar")).toHaveLength(2);
    });

    it("buildGraph replaces all edges", () => {
      finder.addEdge(makeEdge());
      finder.buildGraph([]);
      expect(finder.getRoutesFrom("USDC:stellar")).toHaveLength(0);
    });
  });

  describe("findPath — direct routes", () => {
    it("finds a direct path between two connected nodes", () => {
      finder.addEdge(makeEdge());
      const result = finder.findPath("USDC:stellar", "USDC:ethereum");
      expect(result).not.toBeNull();
      expect(result!.totalHops).toBe(1);
      expect(result!.path[0].provider).toBe("stellar");
    });

    it("returns null when no path exists", () => {
      const result = finder.findPath("USDC:stellar", "ETH:ethereum");
      expect(result).toBeNull();
    });

    it("returns the cheapest path", () => {
      finder.addEdges([
        makeEdge({ sourceNode: "USDC:stellar", targetNode: "USDC:ethereum", provider: "stellar", fee: 0.01 }),
        makeEdge({ sourceNode: "USDC:stellar", targetNode: "USDC:ethereum", provider: "layerzero", fee: 0.001 }),
      ]);
      const result = finder.findPath("USDC:stellar", "USDC:ethereum", { strategy: "cheapest" });
      expect(result!.path[0].provider).toBe("layerzero");
    });

    it("returns the fastest path", () => {
      finder.addEdges([
        makeEdge({ sourceNode: "USDC:stellar", targetNode: "USDC:ethereum", provider: "hop", latencyMs: 60000 }),
        makeEdge({ sourceNode: "USDC:stellar", targetNode: "USDC:ethereum", provider: "stellar", latencyMs: 5000 }),
      ]);
      const result = finder.findPath("USDC:stellar", "USDC:ethereum", { strategy: "fastest" });
      expect(result!.path[0].provider).toBe("stellar");
    });

    it("avoids edges with depleted liquidity", () => {
      finder.addEdge(makeEdge({ liquidity: 0 }));
      const result = finder.findPath("USDC:stellar", "USDC:ethereum");
      expect(result).toBeNull();
    });

    it("avoids inactive edges", () => {
      finder.addEdge(makeEdge({ isActive: false }));
      const result = finder.findPath("USDC:stellar", "USDC:ethereum");
      expect(result).toBeNull();
    });

    it("excludes specified providers", () => {
      finder.addEdge(makeEdge({ provider: "layerzero" }));
      const result = finder.findPath("USDC:stellar", "USDC:ethereum", {
        strategy: "cheapest",
        excludeProviders: ["layerzero"],
      });
      expect(result).toBeNull();
    });
  });

  describe("findPath — multi-hop routing", () => {
    it("finds a multi-hop path when no direct route exists", () => {
      finder.addEdges([
        makeEdge({ sourceNode: "USDC:stellar", targetNode: "USDC:polygon", fee: 0.002, latencyMs: 10000 }),
        makeEdge({ sourceNode: "USDC:polygon", targetNode: "USDC:ethereum", fee: 0.003, latencyMs: 15000 }),
      ]);
      const result = finder.findPath("USDC:stellar", "USDC:ethereum");
      expect(result).not.toBeNull();
      expect(result!.totalHops).toBe(2);
    });

    it("respects maxHops limit", () => {
      finder.addEdges([
        makeEdge({ sourceNode: "A:stellar", targetNode: "B:polygon" }),
        makeEdge({ sourceNode: "B:polygon", targetNode: "C:ethereum" }),
        makeEdge({ sourceNode: "C:ethereum", targetNode: "D:arbitrum" }),
      ]);
      const result = finder.findPath("A:stellar", "D:arbitrum", { strategy: "cheapest", maxHops: 2 });
      expect(result).toBeNull();
    });

    it("prefers multi-hop over no route", () => {
      finder.addEdges([
        makeEdge({ sourceNode: "USDC:stellar", targetNode: "USDC:polygon" }),
        makeEdge({ sourceNode: "USDC:polygon", targetNode: "USDC:ethereum" }),
      ]);
      const result = finder.findPath("USDC:stellar", "USDC:ethereum");
      expect(result).not.toBeNull();
    });
  });

  describe("findPaths — multiple results", () => {
    it("returns multiple paths when available", () => {
      finder.addEdges([
        makeEdge({ sourceNode: "USDC:stellar", targetNode: "USDC:ethereum", provider: "stellar", fee: 0.01 }),
        makeEdge({ sourceNode: "USDC:stellar", targetNode: "USDC:polygon", provider: "stellar", fee: 0.001 }),
        makeEdge({ sourceNode: "USDC:polygon", targetNode: "USDC:ethereum", provider: "hop", fee: 0.002 }),
      ]);
      const results = finder.findPaths("USDC:stellar", "USDC:ethereum", { strategy: "cheapest" }, 5);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("returns empty array when no paths exist", () => {
      const results = finder.findPaths("A:stellar", "Z:ethereum");
      expect(results).toEqual([]);
    });
  });

  describe("getRoutesFrom", () => {
    it("returns empty array for unknown node", () => {
      expect(finder.getRoutesFrom("nonexistent")).toEqual([]);
    });
  });
});

describe("CostCalculator", () => {
  const calculator = new CostCalculator();

  describe("calculateEdgeCost", () => {
    it("calculates edge cost between two chains", async () => {
      const edge = await calculator.calculateEdgeCost("USDC", "stellar", "ethereum", 1000);
      expect(edge.sourceNode).toBe("USDC:stellar");
      expect(edge.targetNode).toBe("USDC:ethereum");
      expect(edge.fee).toBeGreaterThan(0);
      expect(edge.latencyMs).toBeGreaterThan(0);
      expect(edge.isActive).toBe(true);
    });

    it("produces different results for different chain pairs", async () => {
      const stellarToEth = await calculator.calculateEdgeCost("USDC", "stellar", "ethereum", 1000);
      const stellarToPolygon = await calculator.calculateEdgeCost("USDC", "stellar", "polygon", 1000);
      expect(stellarToEth.latencyMs).not.toBe(stellarToPolygon.latencyMs);
    });
  });

  describe("calculateEdges", () => {
    it("calculates multiple edges in parallel", async () => {
      const routes = [
        { asset: "USDC", sourceChain: "stellar", targetChain: "ethereum", amount: 1000 },
        { asset: "USDC", sourceChain: "ethereum", targetChain: "polygon", amount: 500 },
      ];
      const edges = await calculator.calculateEdges(routes);
      expect(edges).toHaveLength(2);
    });
  });

  describe("refreshLiquidity", () => {
    it("returns current liquidity value", async () => {
      const edge = await calculator.calculateEdgeCost("USDC", "stellar", "ethereum", 100);
      const liquidity = await calculator.refreshLiquidity(edge);
      expect(liquidity).toBeGreaterThanOrEqual(0);
    });
  });
});
