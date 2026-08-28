import {
  StellarProviderDependencyGraph,
  worstDependencyStatus,
} from "../../../src/providers/dependencies/stellar";
import {
  healthyProviderIds,
  summarizeProviderHealth,
} from "../../../src/providers/health";

/** A graph with two providers sharing one RPC endpoint. */
function graphWithSharedRpc() {
  const graph = new StellarProviderDependencyGraph({ now: () => 1_000 });

  graph.addDependency({ id: "rpc-main", kind: "rpc", label: "Soroban RPC", critical: true });
  graph.addDependency({ id: "pool-a", kind: "contract", label: "Pool A", critical: true });
  graph.addDependency({ id: "prices", kind: "api", label: "Price API", critical: false });

  graph.addProvider({ id: "alpha", name: "Alpha Bridge", dependencyIds: ["rpc-main", "pool-a"] });
  graph.addProvider({ id: "beta", name: "Beta Bridge", dependencyIds: ["rpc-main", "prices"] });

  return graph;
}

/** Mark every dependency healthy so a test can isolate one failure. */
function allHealthy(graph: StellarProviderDependencyGraph) {
  for (const dependency of graph.listDependencies()) {
    graph.recordDependencyHealth(dependency.id, "healthy");
  }
}

describe("worstDependencyStatus", () => {
  it("picks the most severe", () => {
    expect(worstDependencyStatus(["healthy", "degraded", "unhealthy"])).toBe("unhealthy");
    expect(worstDependencyStatus(["healthy", "unknown"])).toBe("unknown");
  });

  it("is unknown for an empty list", () => {
    expect(worstDependencyStatus([])).toBe("unknown");
  });
});

describe("StellarProviderDependencyGraph", () => {
  it("registers dependencies and providers", () => {
    const graph = graphWithSharedRpc();

    expect(graph.listDependencies().map((entry) => entry.id).sort()).toEqual([
      "pool-a",
      "prices",
      "rpc-main",
    ]);
    expect(graph.listProviders().map((entry) => entry.id).sort()).toEqual(["alpha", "beta"]);
  });

  // A provider pointing at a dependency that does not exist would have
  // nothing to check and would silently report healthy.
  it("refuses a provider that declares an unknown dependency", () => {
    const graph = new StellarProviderDependencyGraph();

    expect(() =>
      graph.addProvider({ id: "x", name: "X", dependencyIds: ["nope"] }),
    ).toThrow("unknown dependencies");
  });

  it("refuses health for an unknown dependency", () => {
    const graph = new StellarProviderDependencyGraph();

    expect(() => graph.recordDependencyHealth("nope", "healthy")).toThrow("Unknown dependency");
  });

  it("starts every dependency as unknown", () => {
    const graph = graphWithSharedRpc();

    expect(graph.dependencyStatus("rpc-main")).toMatchObject({ status: "unknown", updatedAt: 0 });
  });

  it("records health with a reason and a timestamp", () => {
    const graph = graphWithSharedRpc();

    graph.recordDependencyHealth("rpc-main", "unhealthy", "connection refused");

    expect(graph.dependencyStatus("rpc-main")).toMatchObject({
      status: "unhealthy",
      reason: "connection refused",
      updatedAt: 1_000,
    });
  });

  // ── Attribution ─────────────────────────────────────────────────────

  it("names the providers that depend on something", () => {
    const graph = graphWithSharedRpc();

    expect(graph.providersAffectedBy("rpc-main").map((entry) => entry.id).sort()).toEqual([
      "alpha",
      "beta",
    ]);
    expect(graph.providersAffectedBy("pool-a").map((entry) => entry.id)).toEqual(["alpha"]);
  });

  it("predicts impact without recording a failure", () => {
    const graph = graphWithSharedRpc();
    allHealthy(graph);

    expect(graph.impactOf("rpc-main")).toEqual({ unhealthy: ["alpha", "beta"], degraded: [] });
    expect(graph.impactOf("prices")).toEqual({ unhealthy: [], degraded: ["beta"] });

    // Nothing was actually recorded.
    expect(graph.providerHealth("alpha").status).toBe("healthy");
  });

  // ── Provider health derivation ──────────────────────────────────────

  it("is healthy when every dependency is healthy", () => {
    const graph = graphWithSharedRpc();
    allHealthy(graph);

    expect(graph.providerHealth("alpha").status).toBe("healthy");
    expect(graph.providerHealth("alpha").summary).toContain("healthy");
  });

  it("is unhealthy when a critical dependency fails", () => {
    const graph = graphWithSharedRpc();
    allHealthy(graph);

    graph.recordDependencyHealth("rpc-main", "unhealthy", "connection refused");

    const report = graph.providerHealth("alpha");

    expect(report.status).toBe("unhealthy");
    expect(report.criticalFailures.map((entry) => entry.dependencyId)).toEqual(["rpc-main"]);
    expect(report.summary).toContain("Soroban RPC");
  });

  // The distinction that makes the graph worth having: a price feed going
  // down degrades quality, an RPC going down stops the provider.
  it("is only degraded when a non-critical dependency fails", () => {
    const graph = graphWithSharedRpc();
    allHealthy(graph);

    graph.recordDependencyHealth("prices", "unhealthy", "429");

    const report = graph.providerHealth("beta");

    expect(report.status).toBe("degraded");
    expect(report.criticalFailures).toEqual([]);
    expect(report.failing.map((entry) => entry.dependencyId)).toEqual(["prices"]);
  });

  it("is degraded when a critical dependency is degraded rather than down", () => {
    const graph = graphWithSharedRpc();
    allHealthy(graph);

    graph.recordDependencyHealth("rpc-main", "degraded", "elevated latency");

    expect(graph.providerHealth("alpha").status).toBe("degraded");
  });

  // Claiming health for something never checked is how a dashboard ends up
  // lying.
  it("is unknown while a critical dependency has never reported", () => {
    const graph = graphWithSharedRpc();

    graph.recordDependencyHealth("pool-a", "healthy");

    const report = graph.providerHealth("alpha");

    expect(report.status).toBe("unknown");
    expect(report.unknown.map((entry) => entry.dependencyId)).toEqual(["rpc-main"]);
  });

  it("is unknown for a provider with no dependencies declared", () => {
    const graph = new StellarProviderDependencyGraph();

    graph.addProvider({ id: "bare", name: "Bare", dependencyIds: [] });

    expect(graph.providerHealth("bare").status).toBe("unknown");
    expect(graph.providerHealth("bare").summary).toContain("No dependencies");
  });

  it("prefers unhealthy over degraded when both apply", () => {
    const graph = graphWithSharedRpc();
    allHealthy(graph);

    graph.recordDependencyHealth("rpc-main", "unhealthy");
    graph.recordDependencyHealth("prices", "degraded");

    expect(graph.providerHealth("beta").status).toBe("unhealthy");
  });

  it("refuses health for an unknown provider", () => {
    const graph = graphWithSharedRpc();

    expect(() => graph.providerHealth("nope")).toThrow("Unknown provider");
  });

  // One shared endpoint failing takes down everything that leans on it —
  // which is the situation the graph exists to make obvious.
  it("fans a shared failure out to every dependent provider", () => {
    const graph = graphWithSharedRpc();
    allHealthy(graph);

    graph.recordDependencyHealth("rpc-main", "unhealthy", "connection refused");

    expect(graph.providerHealth("alpha").status).toBe("unhealthy");
    expect(graph.providerHealth("beta").status).toBe("unhealthy");
  });

  it("leaves unrelated providers alone", () => {
    const graph = graphWithSharedRpc();
    allHealthy(graph);

    graph.recordDependencyHealth("pool-a", "unhealthy");

    expect(graph.providerHealth("alpha").status).toBe("unhealthy");
    expect(graph.providerHealth("beta").status).toBe("healthy");
  });
});

describe("summarizeProviderHealth", () => {
  it("counts providers by status", () => {
    const graph = graphWithSharedRpc();
    allHealthy(graph);
    graph.recordDependencyHealth("prices", "unhealthy");

    const overview = summarizeProviderHealth(graph);

    expect(overview.total).toBe(2);
    expect(overview.healthy).toBe(1);
    expect(overview.degraded).toBe(1);
    expect(overview.overall).toBe("degraded");
  });

  it("orders failing providers worst first", () => {
    const graph = graphWithSharedRpc();
    allHealthy(graph);

    graph.recordDependencyHealth("pool-a", "unhealthy");
    graph.recordDependencyHealth("prices", "degraded");

    expect(summarizeProviderHealth(graph).failing.map((entry) => entry.providerId)).toEqual([
      "alpha",
      "beta",
    ]);
  });

  // Five providers failing for one reason is one problem, not five.
  it("groups failures by the dependency responsible", () => {
    const graph = graphWithSharedRpc();
    allHealthy(graph);

    graph.recordDependencyHealth("rpc-main", "unhealthy", "connection refused");

    const [rootCause] = summarizeProviderHealth(graph).rootCauses;

    expect(rootCause.dependencyId).toBe("rpc-main");
    expect(rootCause.label).toBe("Soroban RPC");
    expect(rootCause.providerIds).toEqual(["alpha", "beta"]);
  });

  it("puts the widest blast radius first", () => {
    const graph = graphWithSharedRpc();
    allHealthy(graph);

    graph.recordDependencyHealth("rpc-main", "unhealthy");
    graph.recordDependencyHealth("prices", "unhealthy");

    expect(summarizeProviderHealth(graph).rootCauses[0].dependencyId).toBe("rpc-main");
  });

  it("reports no root causes when everything is healthy", () => {
    const graph = graphWithSharedRpc();
    allHealthy(graph);

    expect(summarizeProviderHealth(graph).rootCauses).toEqual([]);
    expect(summarizeProviderHealth(graph).overall).toBe("healthy");
  });
});

describe("healthyProviderIds", () => {
  it("lists only providers that can serve", () => {
    const graph = graphWithSharedRpc();
    allHealthy(graph);

    expect(healthyProviderIds(graph).sort()).toEqual(["alpha", "beta"]);

    graph.recordDependencyHealth("pool-a", "unhealthy");

    expect(healthyProviderIds(graph)).toEqual(["beta"]);
  });

  // A provider whose dependencies have never reported is not known to be
  // healthy, so it must not be handed traffic.
  it("excludes providers whose health is unknown", () => {
    const graph = graphWithSharedRpc();

    expect(healthyProviderIds(graph)).toEqual([]);
  });
});
