import { ContractHealthMonitor, worstStatus } from "../../../src/monitoring/contracts";
import type {
  SorobanContractConfig,
  SorobanContractProbe,
} from "../../../src/contracts/health/soroban";

function config(id: string, overrides: Partial<SorobanContractConfig> = {}): SorobanContractConfig {
  return {
    id,
    name: `Contract ${id}`,
    network: "testnet",
    expectedMethods: ["quote"],
    ...overrides,
  };
}

function probe(overrides: Partial<SorobanContractProbe> = {}): SorobanContractProbe {
  return {
    getContractInfo: jest.fn().mockResolvedValue({ exists: true, network: "testnet" }),
    listMethods: jest.fn().mockResolvedValue(["quote"]),
    callRead: jest.fn().mockResolvedValue(1),
    ...overrides,
  };
}

describe("worstStatus", () => {
  it("picks the most severe status", () => {
    expect(worstStatus(["healthy", "degraded"])).toBe("degraded");
    expect(worstStatus(["degraded", "unhealthy"])).toBe("unhealthy");
    expect(worstStatus(["healthy", "healthy"])).toBe("healthy");
  });

  // An empty monitor is not a healthy one — reporting "healthy" would hide a
  // configuration where nothing was registered at all.
  it("reports unknown for no statuses", () => {
    expect(worstStatus([])).toBe("unknown");
  });
});

describe("ContractHealthMonitor", () => {
  it("registers and lists contracts", () => {
    const monitor = new ContractHealthMonitor(probe());

    monitor.register(config("A"));
    monitor.register(config("B"));

    expect(monitor.registered().map((entry) => entry.id)).toEqual(["A", "B"]);
  });

  it("unregisters a contract and forgets its history", async () => {
    const monitor = new ContractHealthMonitor(probe());

    monitor.register(config("A"));
    await monitor.check("A");

    monitor.unregister("A");

    expect(monitor.registered()).toEqual([]);
    expect(monitor.latest("A")).toBeUndefined();
  });

  it("refuses to check a contract it does not know", async () => {
    const monitor = new ContractHealthMonitor(probe());

    await expect(monitor.check("missing")).rejects.toThrow("No contract registered");
  });

  it("records the latest result", async () => {
    const monitor = new ContractHealthMonitor(probe());
    monitor.register(config("A"));

    await monitor.check("A");

    expect(monitor.latest("A")?.status).toBe("healthy");
  });

  it("keeps a bounded history, most recent first", async () => {
    const monitor = new ContractHealthMonitor(probe(), { historyLimit: 2 });
    monitor.register(config("A"));

    await monitor.check("A");
    await monitor.check("A");
    await monitor.check("A");

    expect(monitor.historyFor("A")).toHaveLength(2);
  });

  it("checks every registered contract", async () => {
    const monitor = new ContractHealthMonitor(probe());
    monitor.register(config("A"));
    monitor.register(config("B"));

    const results = await monitor.checkAll();

    expect(results.map((entry) => entry.contractId).sort()).toEqual(["A", "B"]);
  });

  // One unreachable integration must not hide the status of the others.
  it("keeps sweeping when one contract throws", async () => {
    const monitor = new ContractHealthMonitor(
      probe({
        getContractInfo: jest.fn(async (id: string) => {
          if (id === "A") throw new Error("exploded");

          return { exists: true, network: "testnet" };
        }),
      }),
    );

    monitor.register(config("A"));
    monitor.register(config("B"));

    const results = await monitor.checkAll();

    expect(results).toHaveLength(2);
    expect(results.find((entry) => entry.contractId === "B")?.status).toBe("healthy");
  });

  describe("summary", () => {
    it("is unknown before anything has been checked", () => {
      const monitor = new ContractHealthMonitor(probe());
      monitor.register(config("A"));

      expect(monitor.summary().overall).toBe("unknown");
      expect(monitor.summary().total).toBe(0);
    });

    it("counts each status", async () => {
      const monitor = new ContractHealthMonitor(
        probe({
          listMethods: jest.fn(async (id: string) => (id === "B" ? [] : ["quote"])),
        }),
      );

      monitor.register(config("A"));
      monitor.register(config("B"));
      await monitor.checkAll();

      const summary = monitor.summary();

      expect(summary.healthy).toBe(1);
      expect(summary.unhealthy).toBe(1);
      expect(summary.overall).toBe("unhealthy");
    });

    it("lists failing contracts worst first", async () => {
      const monitor = new ContractHealthMonitor(
        probe({
          listMethods: jest.fn(async (id: string) => (id === "BAD" ? [] : ["quote"])),
          callRead: jest.fn(async (id: string) => {
            if (id === "SLOW") throw new Error("timeout");

            return 1;
          }),
        }),
      );

      monitor.register(config("OK"));
      monitor.register(config("SLOW", { readProbes: [{ method: "quote" }] }));
      monitor.register(config("BAD"));

      await monitor.checkAll();

      expect(monitor.summary().failing).toEqual(["BAD", "SLOW"]);
    });
  });

  describe("isPersistentlyFailing", () => {
    // A run of failures is what separates a broken integration from a blip,
    // and the two warrant different responses.
    it("is false until enough consecutive failures are recorded", async () => {
      const monitor = new ContractHealthMonitor(
        probe({ getContractInfo: jest.fn().mockResolvedValue({ exists: false }) }),
      );

      monitor.register(config("A"));

      await monitor.check("A");
      expect(monitor.isPersistentlyFailing("A", 3)).toBe(false);

      await monitor.check("A");
      expect(monitor.isPersistentlyFailing("A", 3)).toBe(false);

      await monitor.check("A");
      expect(monitor.isPersistentlyFailing("A", 3)).toBe(true);
    });

    it("is false when a recent check succeeded", async () => {
      let healthy = false;

      const monitor = new ContractHealthMonitor(
        probe({ getContractInfo: jest.fn(async () => ({ exists: healthy, network: "testnet" })) }),
      );

      monitor.register(config("A"));

      await monitor.check("A");
      await monitor.check("A");
      healthy = true;
      await monitor.check("A");

      expect(monitor.isPersistentlyFailing("A", 3)).toBe(false);
    });
  });
});
