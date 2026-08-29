import {
  checkSorobanContractHealth,
  type SorobanContractConfig,
  type SorobanContractProbe,
} from "../../../src/contracts/health/soroban";

const CONTRACT_ID = "CABC123";

function config(overrides: Partial<SorobanContractConfig> = {}): SorobanContractConfig {
  return {
    id: CONTRACT_ID,
    name: "Bridge Pool",
    network: "testnet",
    expectedMethods: ["quote", "swap"],
    ...overrides,
  };
}

/** A probe where every call succeeds unless overridden. */
function probe(overrides: Partial<SorobanContractProbe> = {}): SorobanContractProbe {
  return {
    getContractInfo: jest.fn().mockResolvedValue({ exists: true, network: "testnet" }),
    listMethods: jest.fn().mockResolvedValue(["quote", "swap", "admin"]),
    callRead: jest.fn().mockResolvedValue(42),
    ...overrides,
  };
}

describe("checkSorobanContractHealth", () => {
  it("reports healthy when every check passes", async () => {
    const result = await checkSorobanContractHealth(config(), probe());

    expect(result.status).toBe("healthy");
    expect(result.missingMethods).toEqual([]);
    expect(result.contractId).toBe(CONTRACT_ID);
  });

  it("records a result for each check", async () => {
    const result = await checkSorobanContractHealth(config(), probe());

    expect(result.checks.map((check) => check.name)).toEqual([
      "availability",
      "network",
      "interface",
      "read",
    ]);
  });

  // ── Availability ────────────────────────────────────────────────────

  it("is unhealthy when the contract does not exist", async () => {
    const result = await checkSorobanContractHealth(
      config(),
      probe({ getContractInfo: jest.fn().mockResolvedValue({ exists: false }) }),
    );

    expect(result.status).toBe("unhealthy");
    expect(result.checks[0]).toMatchObject({ name: "availability", ok: false });
  });

  // Blaming interface and read checks for a contract that is not there would
  // bury the one fact that matters.
  it("skips the remaining checks when the contract is absent", async () => {
    const listMethods = jest.fn();
    const callRead = jest.fn();

    const result = await checkSorobanContractHealth(
      config({ readProbes: [{ method: "quote" }] }),
      probe({
        getContractInfo: jest.fn().mockResolvedValue({ exists: false }),
        listMethods,
        callRead,
      }),
    );

    expect(listMethods).not.toHaveBeenCalled();
    expect(callRead).not.toHaveBeenCalled();

    for (const name of ["network", "interface", "read"]) {
      expect(result.checks.find((check) => check.name === name)?.skipped).toBe(true);
    }
  });

  it("reports every expected method as missing when the contract is absent", async () => {
    const result = await checkSorobanContractHealth(
      config(),
      probe({ getContractInfo: jest.fn().mockResolvedValue({ exists: false }) }),
    );

    expect(result.missingMethods).toEqual(["quote", "swap"]);
  });

  it("treats a throwing availability probe as unavailable", async () => {
    const result = await checkSorobanContractHealth(
      config(),
      probe({ getContractInfo: jest.fn().mockRejectedValue(new Error("rpc down")) }),
    );

    expect(result.status).toBe("unhealthy");
    expect(result.checks[0].message).toContain("rpc down");
  });

  // ── Network ─────────────────────────────────────────────────────────

  // A contract answering from the wrong network is worse than silence: the
  // integration looks fine while reading someone else's state.
  it("is unhealthy when the wrong network answers", async () => {
    const result = await checkSorobanContractHealth(
      config({ network: "mainnet" }),
      probe({
        getContractInfo: jest.fn().mockResolvedValue({ exists: true, network: "testnet" }),
      }),
    );

    expect(result.status).toBe("unhealthy");

    const check = result.checks.find((entry) => entry.name === "network");
    expect(check?.ok).toBe(false);
    expect(check?.message).toContain("mainnet");
    expect(check?.message).toContain("testnet");
  });

  it("accepts a probe that does not report a network", async () => {
    const result = await checkSorobanContractHealth(
      config(),
      probe({ getContractInfo: jest.fn().mockResolvedValue({ exists: true }) }),
    );

    expect(result.status).toBe("healthy");
  });

  // ── Interface ───────────────────────────────────────────────────────

  it("is unhealthy when an expected method is missing", async () => {
    const result = await checkSorobanContractHealth(
      config(),
      probe({ listMethods: jest.fn().mockResolvedValue(["quote"]) }),
    );

    expect(result.status).toBe("unhealthy");
    expect(result.missingMethods).toEqual(["swap"]);
  });

  it("names every missing method", async () => {
    const result = await checkSorobanContractHealth(
      config(),
      probe({ listMethods: jest.fn().mockResolvedValue([]) }),
    );

    const check = result.checks.find((entry) => entry.name === "interface");
    expect(check?.message).toContain("quote");
    expect(check?.message).toContain("swap");
  });

  it("ignores extra methods the contract exposes", async () => {
    const result = await checkSorobanContractHealth(
      config(),
      probe({ listMethods: jest.fn().mockResolvedValue(["quote", "swap", "extra"]) }),
    );

    expect(result.status).toBe("healthy");
  });

  // ── Reads ───────────────────────────────────────────────────────────

  it("skips the read check when no probes are configured", async () => {
    const result = await checkSorobanContractHealth(config(), probe());

    expect(result.checks.find((check) => check.name === "read")?.skipped).toBe(true);
    expect(result.status).toBe("healthy");
  });

  it("runs each configured read probe", async () => {
    const callRead = jest.fn().mockResolvedValue(1);

    await checkSorobanContractHealth(
      config({ readProbes: [{ method: "quote", args: [1, 2] }, { method: "swap" }] }),
      probe({ callRead }),
    );

    expect(callRead).toHaveBeenCalledTimes(2);
    expect(callRead).toHaveBeenCalledWith(CONTRACT_ID, "quote", [1, 2]);
  });

  // The contract is present and correctly shaped, so a failing read is more
  // likely transient than structural — that difference drives the response.
  it("is degraded, not unhealthy, when a read fails", async () => {
    const result = await checkSorobanContractHealth(
      config({ readProbes: [{ method: "quote" }] }),
      probe({ callRead: jest.fn().mockRejectedValue(new Error("timeout")) }),
    );

    expect(result.status).toBe("degraded");
    expect(result.checks.find((check) => check.name === "read")?.message).toContain("timeout");
  });

  it("fails a read whose value does not meet expectations", async () => {
    const result = await checkSorobanContractHealth(
      config({
        readProbes: [
          { method: "quote", expect: (value) => (typeof value === "number" ? null : "not a number") },
        ],
      }),
      probe({ callRead: jest.fn().mockResolvedValue("nope") }),
    );

    expect(result.status).toBe("degraded");
    expect(result.checks.find((check) => check.name === "read")?.message).toContain(
      "not a number",
    );
  });

  it("reports every failing probe rather than stopping at the first", async () => {
    const result = await checkSorobanContractHealth(
      config({ readProbes: [{ method: "a" }, { method: "b" }] }),
      probe({ callRead: jest.fn().mockRejectedValue(new Error("boom")) }),
    );

    const message = result.checks.find((check) => check.name === "read")?.message ?? "";
    expect(message).toContain("a:");
    expect(message).toContain("b:");
  });

  // A structural fault outranks a transient one.
  it("prefers unhealthy over degraded when both apply", async () => {
    const result = await checkSorobanContractHealth(
      config({ readProbes: [{ method: "quote" }] }),
      probe({
        listMethods: jest.fn().mockResolvedValue([]),
        callRead: jest.fn().mockRejectedValue(new Error("also broken")),
      }),
    );

    expect(result.status).toBe("unhealthy");
  });

  // ── Timeouts ────────────────────────────────────────────────────────

  // An integration that never answers is not healthy, and without a bound the
  // health check would hang with it.
  it("bounds a hanging probe", async () => {
    const result = await checkSorobanContractHealth(
      config(),
      probe({ getContractInfo: jest.fn().mockImplementation(() => new Promise(() => {})) }),
      { timeoutMs: 20 },
    );

    expect(result.status).toBe("unhealthy");
    expect(result.checks[0].message).toContain("timed out");
  });

  it("bounds a hanging read", async () => {
    const result = await checkSorobanContractHealth(
      config({ readProbes: [{ method: "quote" }] }),
      probe({ callRead: jest.fn().mockImplementation(() => new Promise(() => {})) }),
      { timeoutMs: 20 },
    );

    expect(result.status).toBe("degraded");
  });

  it("uses the injected clock for timings", async () => {
    let tick = 1_000;
    const now = jest.fn(() => (tick += 5));

    const result = await checkSorobanContractHealth(config(), probe(), { now });

    expect(result.checkedAt).toBe(1_005);
    expect(result.totalDurationMs).toBeGreaterThan(0);
  });
});
