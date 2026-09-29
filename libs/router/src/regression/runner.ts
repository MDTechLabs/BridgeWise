/**
 * Replays a routing regression corpus against the router.
 *
 * Every case runs against a fresh {@link PathFinder} so cases cannot leak
 * state into each other. Failures in one case (including thrown errors) are
 * captured in the report and never abort the run.
 */

import { CostCalculator } from "../cost-calculator";
import { PathFinder } from "../path-finder";
import { GraphEdge, PathResult } from "../types";
import {
  CaseOutcome,
  CaseResult,
  CorpusFile,
  DEFAULT_CASE_TIMEOUT_MS,
  ExpectedRoute,
  RegressionCase,
  RegressionLogger,
  RegressionMetricsSink,
  RegressionReport,
  RunnerOptions,
} from "./types";

const noopLogger: RegressionLogger = { debug: () => {}, warn: () => {}, error: () => {} };
const noopMetrics: RegressionMetricsSink = { increment: () => {}, timing: () => {} };
const METRIC_PREFIX = "router.regression.";

/** Format a graph edge as the hop signature used in corpus expectations. */
export function hopSignature(edge: GraphEdge): string {
  return `${edge.sourceNode}->${edge.targetNode}@${edge.provider}`;
}

async function resolveEdges(file: CorpusFile, c: RegressionCase, calculator: CostCalculator): Promise<GraphEdge[]> {
  const g = c.graph;
  if (typeof g === "string") return file.graphs[g];
  if ("edges" in g) return g.edges;
  return calculator.calculateEdges(g.generate);
}

function compareRoute(label: string, expected: ExpectedRoute, actual: PathResult, feeTolerance: number): string[] {
  const out: string[] = [];
  const actualHops = actual.path.map(hopSignature);
  if (actualHops.length !== expected.hops.length || actualHops.some((h, i) => h !== expected.hops[i])) {
    out.push(`${label} hops: expected [${expected.hops.join(", ")}], got [${actualHops.join(", ")}]`);
  }
  if (expected.totalFee !== undefined && Math.abs(actual.totalFee - expected.totalFee) > feeTolerance) {
    out.push(`${label} totalFee: expected ${expected.totalFee} (±${feeTolerance}), got ${actual.totalFee}`);
  }
  if (expected.totalLatencyMs !== undefined && actual.totalLatencyMs !== expected.totalLatencyMs) {
    out.push(`${label} totalLatencyMs: expected ${expected.totalLatencyMs}, got ${actual.totalLatencyMs}`);
  }
  return out;
}

/** Compare the router's output with a case's expectation; returns mismatches. */
export function diffOutcome(c: RegressionCase, actual: PathResult[], feeTolerance: number): string[] {
  const exp = c.expected;
  const describe = (r: PathResult) => `[${r.path.map(hopSignature).join(", ")}]`;
  switch (exp.kind) {
    case "no-route":
      return actual.length === 0 ? [] : [`expected no route, got ${actual.map(describe).join(" | ")}`];
    case "route":
      return actual.length === 0 ? ["expected a route, got none"] : compareRoute("route", exp.route, actual[0], feeTolerance);
    case "routes": {
      const out: string[] = [];
      if (actual.length !== exp.routes.length) {
        out.push(`expected ${exp.routes.length} route(s), got ${actual.length}: ${actual.map(describe).join(" | ") || "none"}`);
      }
      const n = Math.min(actual.length, exp.routes.length);
      for (let i = 0; i < n; i++) out.push(...compareRoute(`routes[${i}]`, exp.routes[i], actual[i], feeTolerance));
      return out;
    }
  }
}

function classify(c: RegressionCase, mismatches: string[]): CaseOutcome {
  const matches = mismatches.length === 0;
  if (c.status === "known-issue") return matches ? "xpass" : "xfail";
  return matches ? "pass" : "fail";
}

/**
 * Run every case in the given corpus files and return a report.
 *
 * Never throws for case-level problems; inspect `report.ok` instead.
 */
export async function runRegressionCorpus(files: CorpusFile[], options: RunnerOptions = {}): Promise<RegressionReport> {
  const logger = options.logger ?? noopLogger;
  const metrics = options.metrics ?? noopMetrics;
  const now = options.now ?? (() => Date.now());
  const budgetMs = options.caseTimeoutMs ?? DEFAULT_CASE_TIMEOUT_MS;
  const includeTags = options.includeTags && options.includeTags.length > 0 ? new Set(options.includeTags) : null;
  const calculator = new CostCalculator();

  const runStart = now();
  const results: CaseResult[] = [];

  for (const file of files) {
    for (const c of file.cases) {
      const tags = { suite: file.suite, case: c.id };
      if (includeTags && !c.tags.some((t) => includeTags.has(t))) {
        results.push({ suite: file.suite, id: c.id, outcome: "skipped", mismatches: [], durationMs: 0 });
        continue;
      }

      const start = now();
      let result: CaseResult;
      try {
        const finder = new PathFinder();
        finder.buildGraph(await resolveEdges(file, c, calculator));
        const { source, target, options: routing, maxResults } = c.request;
        const actual =
          maxResults !== undefined
            ? finder.findPaths(source, target, routing, maxResults)
            : [finder.findPath(source, target, routing)].filter((r): r is PathResult => r !== null);
        const durationMs = now() - start;
        const mismatches = diffOutcome(c, actual, file.feeTolerance);
        if (durationMs > budgetMs) mismatches.push(`took ${durationMs}ms, exceeding the ${budgetMs}ms budget`);
        result = { suite: file.suite, id: c.id, outcome: classify(c, mismatches), mismatches, durationMs };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result = { suite: file.suite, id: c.id, outcome: "error", mismatches: [], error: message, durationMs: now() - start };
      }

      results.push(result);
      metrics.increment(`${METRIC_PREFIX}case`, { ...tags, outcome: result.outcome });
      metrics.timing(`${METRIC_PREFIX}case_duration_ms`, result.durationMs, tags);
      const ctx = { ...tags, outcome: result.outcome, durationMs: result.durationMs };
      if (result.outcome === "fail" || result.outcome === "xpass") logger.warn("routing regression case failed", { ...ctx, mismatches: result.mismatches });
      else if (result.outcome === "error") logger.error("routing regression case errored", { ...ctx, error: result.error });
      else logger.debug("routing regression case finished", ctx);
    }
  }

  const count = (o: CaseOutcome) => results.filter((r) => r.outcome === o).length;
  const report: RegressionReport = {
    total: results.length,
    passed: count("pass"),
    failed: count("fail"),
    errored: count("error"),
    expectedFailures: count("xfail"),
    unexpectedPasses: count("xpass"),
    skipped: count("skipped"),
    durationMs: now() - runStart,
    results,
    ok: false,
  };
  report.ok = report.failed === 0 && report.errored === 0 && report.unexpectedPasses === 0;
  metrics.timing(`${METRIC_PREFIX}run_duration_ms`, report.durationMs);
  metrics.increment(`${METRIC_PREFIX}run`, { ok: String(report.ok) });
  return report;
}

/** Render a report as plain text suitable for CI logs. */
export function formatRegressionReport(report: RegressionReport): string {
  const lines = [
    `Routing regression corpus: ${report.ok ? "OK" : "FAILED"} ` +
      `(${report.passed} passed, ${report.failed} failed, ${report.errored} errored, ` +
      `${report.expectedFailures} known issues, ${report.unexpectedPasses} unexpectedly passing, ` +
      `${report.skipped} skipped; ${report.total} total in ${report.durationMs}ms)`,
  ];
  for (const r of report.results) {
    if (r.outcome === "fail" || r.outcome === "error" || r.outcome === "xpass") {
      lines.push(`  ✗ [${r.outcome}] ${r.suite}/${r.id}`);
      if (r.outcome === "xpass") lines.push("      known issue now behaves as expected; set status to \"active\"");
      for (const m of r.mismatches) lines.push(`      ${m}`);
      if (r.error) lines.push(`      error: ${r.error}`);
    }
  }
  return lines.join("\n");
}
