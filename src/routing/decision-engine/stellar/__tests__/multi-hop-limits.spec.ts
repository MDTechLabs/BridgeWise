import { StellarRouteDecisionEngine } from "../stellar-route-decision-engine";
import { BridgeRoute } from "../../../services/route-ranker";

describe("Multi-Hop Route Limits (Issue #1143)", () => {
  let engine: StellarRouteDecisionEngine;

  const directRoute: BridgeRoute = {
    id: "route-direct",
    fromChain: "stellar",
    toChain: "stellar",
    fromToken: "XLM",
    toToken: "USDC",
    amount: "1000",
    fee: { amount: "0.1", token: "XLM" },
    estimatedTime: 1,
    successRate: 0.99,
    provider: "stellar-dex",
    hops: 1,
  };

  const twoHopRoute: BridgeRoute = {
    id: "route-2hop",
    fromChain: "stellar",
    toChain: "stellar",
    fromToken: "XLM",
    toToken: "USDC",
    amount: "1000",
    fee: { amount: "0.05", token: "XLM" },
    estimatedTime: 2,
    successRate: 0.95,
    provider: "soroban-pool",
    hops: 2,
    path: ["XLM", "AQUA", "USDC"],
  };

  const fourHopRoute: BridgeRoute = {
    id: "route-4hop",
    fromChain: "stellar",
    toChain: "ethereum",
    fromToken: "XLM",
    toToken: "USDC",
    amount: "1000",
    fee: { amount: "0.01", token: "XLM" },
    estimatedTime: 5,
    successRate: 0.90,
    provider: "multi-bridge",
    hops: 4,
    path: ["XLM", "AQUA", "yXLM", "USDC", "eUSDC"],
  };

  beforeEach(() => {
    engine = new StellarRouteDecisionEngine();
  });

  it("allows routes within default maxHops (3)", () => {
    const result = engine.decide([directRoute, twoHopRoute, fourHopRoute]);

    expect(result.selection).not.toBeNull();
    const survivingIds = [
      result.selection?.id,
      ...result.alternatives.map((a) => a.id),
    ];
    expect(survivingIds).toContain("route-direct");
    expect(survivingIds).toContain("route-2hop");
    expect(survivingIds).not.toContain("route-4hop");

    const rejections = result.rejections.find((r) => r.route.id === "route-4hop");
    expect(rejections?.reason).toContain("route hop count 4 exceeds policy max 3");
  });

  it("enforces strict maxHops = 1 (single-hop only)", () => {
    const result = engine.decide([directRoute, twoHopRoute], {}, {
      policy: { maxHops: 1 },
    });

    expect(result.selection?.id).toBe("route-direct");
    expect(result.alternatives).toHaveLength(0);
    expect(result.rejections).toHaveLength(1);
    expect(result.rejections[0].route.id).toBe("route-2hop");
  });

  it("rejects invalid maxHops < 1 with clear validation error", () => {
    const result = engine.decide([directRoute], {}, {
      policy: { maxHops: 0 },
    });

    expect(result.selection).toBeNull();
    expect(result.rejections[0].reason).toContain("invalid policy maxHops (0): must be at least 1");
  });

  it("allows 4-hop routes when maxHops policy is relaxed to 5", () => {
    const result = engine.decide([fourHopRoute], {}, {
      policy: { maxHops: 5 },
    });

    expect(result.selection?.id).toBe("route-4hop");
    expect(result.rejections).toHaveLength(0);
  });
});
