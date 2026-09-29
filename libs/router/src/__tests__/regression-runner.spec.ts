import { parseCorpusFile } from "../regression/corpus-validator";
import { diffOutcome, formatRegressionReport, hopSignature, runRegressionCorpus } from "../regression/runner";
import { CorpusFile, RegressionLogger, RegressionMetricsSink } from "../regression/types";
import { PathFinder } from "../path-finder";

const edges = [
  { sourceNode: "A", targetNode: "B", provider: "cheap", fee: 1, latencyMs: 9000, liquidity: 100, isActive: true },
  { sourceNode: "A", targetNode: "B", provider: "fast", fee: 3, latencyMs: 1000, liquidity: 100, isActive: true },
];

function file(cases: unknown[], extra: Record<string, unknown> = {}): CorpusFile {
  return parseCorpusFile({ schemaVersion: 1, suite: "runner", description: "runner tests", graphs: { g: edges }, cases, ...extra }, "runner.json");
}

const request = (strategy = "cheapest") => ({ source: "A", target: "B", options: { strategy } });

describe("runRegressionCorpus", () => {
  it("passes when routes match", async () => {
    const report = await runRegressionCorpus([
      file([
        { id: "cheap", description: "d", graph: "g", request: request(), expected: { kind: "route", route: { hops: ["A->B@cheap"], totalFee: 1, totalLatencyMs: 9000 } } },
        { id: "none", description: "d", graph: "g", request: { ...request(), target: "Z" }, expected: { kind: "no-route" } },
      ]),
    ]);
    expect(report.ok).toBe(true);
    expect(report.passed).toBe(2);
    expect(report.total).toBe(2);
  });

  it("fails and describes a hop mismatch", async () => {
    const report = await runRegressionCorpus([
      file([{ id: "wrong", description: "d", graph: "g", request: request("fastest"), expected: { kind: "route", route: { hops: ["A->B@cheap"] } } }]),
    ]);
    expect(report.ok).toBe(false);
    expect(report.failed).toBe(1);
    expect(report.results[0].mismatches[0]).toBe("route hops: expected [A->B@cheap], got [A->B@fast]");
  });

  it("fails on fee and latency drift beyond tolerance", async () => {
    const report = await runRegressionCorpus([
      file([
        {
          id: "drift",
          description: "d",
          graph: "g",
          request: request(),
          expected: { kind: "route", route: { hops: ["A->B@cheap"], totalFee: 1.01, totalLatencyMs: 9001 } },
        },
      ]),
    ]);
    expect(report.results[0].mismatches).toEqual([
      "route totalFee: expected 1.01 (±1e-9), got 1",
      "route totalLatencyMs: expected 9001, got 9000",
    ]);
  });

  it("honours a file-level fee tolerance at its boundary", async () => {
    const cases = [{ id: "tol", description: "d", graph: "g", request: request(), expected: { kind: "route", route: { hops: ["A->B@cheap"], totalFee: 1.5 } } }];
    expect((await runRegressionCorpus([file(cases, { feeTolerance: 0.5 })])).ok).toBe(true);
    expect((await runRegressionCorpus([file(cases, { feeTolerance: 0.49 })])).ok).toBe(false);
  });

  it("reports unexpected routes and missing routes", async () => {
    const report = await runRegressionCorpus([
      file([
        { id: "unexpected", description: "d", graph: "g", request: request(), expected: { kind: "no-route" } },
        { id: "missing", description: "d", graph: { edges: [] }, request: request(), expected: { kind: "route", route: { hops: ["A->B@cheap"] } } },
      ]),
    ]);
    expect(report.results.map((r) => r.mismatches[0])).toEqual(["expected no route, got [A->B@cheap]", "expected a route, got none"]);
  });

  it("classifies known issues as xfail, and as xpass once fixed", async () => {
    const knownIssue = (hops: string[]) => ({
      id: "ki",
      description: "d",
      status: "known-issue",
      issue: "tracked",
      graph: "g",
      request: request(),
      expected: { kind: "route", route: { hops } },
    });
    const stillBroken = await runRegressionCorpus([file([knownIssue(["A->B@fast"])])]);
    expect(stillBroken.results[0].outcome).toBe("xfail");
    expect(stillBroken.ok).toBe(true);

    const fixed = await runRegressionCorpus([file([knownIssue(["A->B@cheap"])])]);
    expect(fixed.results[0].outcome).toBe("xpass");
    expect(fixed.ok).toBe(false);
    expect(formatRegressionReport(fixed)).toContain('set status to "active"');
  });

  it("captures router errors per case without aborting the run", async () => {
    const spy = jest.spyOn(PathFinder.prototype, "findPath").mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const report = await runRegressionCorpus([
      file([
        { id: "explodes", description: "d", graph: "g", request: request(), expected: { kind: "no-route" } },
        { id: "survives", description: "d", graph: "g", request: request(), expected: { kind: "route", route: { hops: ["A->B@cheap"] } } },
      ]),
    ]);
    spy.mockRestore();
    expect(report.results.map((r) => r.outcome)).toEqual(["error", "pass"]);
    expect(report.results[0].error).toBe("boom");
    expect(report.ok).toBe(false);
  });

  it("fails cases that exceed the time budget", async () => {
    let t = 0;
    const report = await runRegressionCorpus(
      [file([{ id: "slow", description: "d", graph: "g", request: request(), expected: { kind: "route", route: { hops: ["A->B@cheap"] } } }])],
      { caseTimeoutMs: 5, now: () => (t += 10) },
    );
    expect(report.results[0].outcome).toBe("fail");
    expect(report.results[0].mismatches).toEqual(["took 10ms, exceeding the 5ms budget"]);
  });

  it("filters by tag and marks the rest skipped", async () => {
    const report = await runRegressionCorpus(
      [
        file([
          { id: "tagged", description: "d", tags: ["smoke"], graph: "g", request: request(), expected: { kind: "route", route: { hops: ["A->B@cheap"] } } },
          { id: "other", description: "d", graph: "g", request: request(), expected: { kind: "no-route" } },
        ]),
      ],
      { includeTags: ["smoke"] },
    );
    expect(report.results.map((r) => r.outcome)).toEqual(["pass", "skipped"]);
    expect(report.ok).toBe(true);
  });

  it("isolates graphs between cases", async () => {
    const report = await runRegressionCorpus([
      file([
        { id: "first", description: "d", graph: { edges: [edges[0]] }, request: request(), expected: { kind: "route", route: { hops: ["A->B@cheap"] } } },
        { id: "second", description: "d", graph: { edges: [edges[1]] }, request: request(), expected: { kind: "route", route: { hops: ["A->B@fast"] } } },
      ]),
    ]);
    expect(report.ok).toBe(true);
  });

  it("emits metrics and logs", async () => {
    const metrics: RegressionMetricsSink = { increment: jest.fn(), timing: jest.fn() };
    const logger: RegressionLogger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
    await runRegressionCorpus(
      [
        file([
          { id: "ok", description: "d", graph: "g", request: request(), expected: { kind: "route", route: { hops: ["A->B@cheap"] } } },
          { id: "bad", description: "d", graph: "g", request: request(), expected: { kind: "no-route" } },
        ]),
      ],
      { metrics, logger },
    );
    expect(metrics.increment).toHaveBeenCalledWith("router.regression.case", { suite: "runner", case: "ok", outcome: "pass" });
    expect(metrics.increment).toHaveBeenCalledWith("router.regression.case", { suite: "runner", case: "bad", outcome: "fail" });
    expect(metrics.increment).toHaveBeenCalledWith("router.regression.run", { ok: "false" });
    expect(metrics.timing).toHaveBeenCalledWith("router.regression.run_duration_ms", expect.any(Number));
    expect(logger.debug).toHaveBeenCalledWith("routing regression case finished", expect.objectContaining({ case: "ok" }));
    expect(logger.warn).toHaveBeenCalledWith("routing regression case failed", expect.objectContaining({ case: "bad", mismatches: expect.any(Array) }));
  });
});

describe("diffOutcome", () => {
  const c = file([
    {
      id: "multi",
      description: "d",
      graph: "g",
      request: { ...request(), maxResults: 3 },
      expected: { kind: "routes", routes: [{ hops: ["A->B@cheap"] }, { hops: ["A->B@fast"] }] },
    },
  ]).cases[0];

  it("reports a route count mismatch and compares the overlapping prefix", () => {
    const finder = new PathFinder();
    finder.buildGraph([edges[1]]);
    const actual = finder.findPaths("A", "B", { strategy: "cheapest" }, 3);
    expect(diffOutcome(c, actual, 0)).toEqual([
      "expected 2 route(s), got 1: [A->B@fast]",
      "routes[0] hops: expected [A->B@cheap], got [A->B@fast]",
    ]);
  });

  it("reports 'none' when no routes are returned", () => {
    expect(diffOutcome(c, [], 0)).toEqual(["expected 2 route(s), got 0: none"]);
  });
});

describe("hopSignature", () => {
  it("formats source, target and provider", () => {
    expect(hopSignature(edges[0])).toBe("A->B@cheap");
  });
});

describe("formatRegressionReport", () => {
  it("summarises a passing report", async () => {
    const report = await runRegressionCorpus([
      file([{ id: "ok", description: "d", graph: "g", request: request(), expected: { kind: "route", route: { hops: ["A->B@cheap"] } } }]),
    ]);
    expect(formatRegressionReport(report)).toMatch(/^Routing regression corpus: OK \(1 passed, 0 failed/);
  });

  it("lists failing cases with their mismatches", async () => {
    const report = await runRegressionCorpus([file([{ id: "bad", description: "d", graph: "g", request: request(), expected: { kind: "no-route" } }])]);
    const text = formatRegressionReport(report);
    expect(text).toContain("FAILED");
    expect(text).toContain("✗ [fail] runner/bad");
    expect(text).toContain("expected no route, got [A->B@cheap]");
  });
});
