/**
 * Types for the routing regression corpus.
 *
 * A corpus is a set of JSON files, each describing one or more graphs and a
 * list of routing requests with the outcome the router is expected to produce.
 * The runner replays every case against a fresh {@link PathFinder} so that any
 * behavioural change in route selection surfaces as a failing case.
 *
 * @example
 * ```ts
 * import { parseCorpusFile, runRegressionCorpus } from '@bridgewise/router';
 *
 * const file = parseCorpusFile(JSON.parse(raw), 'core.json');
 * const report = await runRegressionCorpus([file]);
 * ```
 */

import { GraphEdge, RoutingOptions } from "../types";

/** Corpus schema versions this runner understands. */
export const SUPPORTED_SCHEMA_VERSIONS = [1] as const;
export type CorpusSchemaVersion = (typeof SUPPORTED_SCHEMA_VERSIONS)[number];

/**
 * A graph edge whose cost is derived by {@link CostCalculator} rather than
 * written by hand. Used for cases that exercise the calculator → path finder
 * pipeline end to end.
 */
export interface GeneratedEdgeSpec {
  asset: string;
  sourceChain: string;
  targetChain: string;
  amount: number;
  provider?: string;
}

/**
 * How a case obtains its graph:
 *  - a string names a graph declared in the file's `graphs` map;
 *  - `{ edges }` declares the edges inline;
 *  - `{ generate }` derives edges through the cost calculator.
 */
export type GraphSource = string | { edges: GraphEdge[] } | { generate: GeneratedEdgeSpec[] };

/** The routing request replayed for a case. */
export interface RegressionRequest {
  source: string;
  target: string;
  options: RoutingOptions;
  /** When set, `findPaths` is used and every returned path is compared. */
  maxResults?: number;
}

/** Expected shape of a single returned route. */
export interface ExpectedRoute {
  /**
   * Hop signatures in order, formatted `"<source>-><target>@<provider>"`,
   * e.g. `"USDC:stellar->USDC:ethereum@layerzero"`.
   */
  hops: string[];
  /** Expected total fee; compared within `feeTolerance`. */
  totalFee?: number;
  /** Expected total latency in milliseconds; compared exactly. */
  totalLatencyMs?: number;
}

/** Expected outcome of a case. */
export type ExpectedOutcome =
  | { kind: "no-route" }
  | { kind: "route"; route: ExpectedRoute }
  | { kind: "routes"; routes: ExpectedRoute[] };

/**
 * Lifecycle status of a case.
 *  - `active`: must pass.
 *  - `known-issue`: documents a known router defect. `expected` records the
 *    *correct* behaviour; the case is reported as `xfail` while the defect
 *    persists and as `xpass` (a failure prompting promotion to `active`) once
 *    it is fixed.
 */
export type CaseStatus = "active" | "known-issue";

/** A single regression case. */
export interface RegressionCase {
  id: string;
  description: string;
  tags: string[];
  status: CaseStatus;
  /** Required when `status` is `known-issue`: a short explanation or issue link. */
  issue?: string;
  graph: GraphSource;
  request: RegressionRequest;
  expected: ExpectedOutcome;
}

/** One corpus file after validation. */
export interface CorpusFile {
  schemaVersion: CorpusSchemaVersion;
  suite: string;
  description: string;
  /** Absolute tolerance for fee comparisons (default {@link DEFAULT_FEE_TOLERANCE}). */
  feeTolerance: number;
  graphs: Record<string, GraphEdge[]>;
  cases: RegressionCase[];
  /** Where the file was loaded from; used in diagnostics only. */
  source: string;
}

/** Outcome of replaying a single case. */
export type CaseOutcome = "pass" | "fail" | "error" | "xfail" | "xpass" | "skipped";

export interface CaseResult {
  suite: string;
  id: string;
  outcome: CaseOutcome;
  /** Human-readable differences between expected and actual results. */
  mismatches: string[];
  /** Error message when `outcome` is `error`. */
  error?: string;
  durationMs: number;
}

export interface RegressionReport {
  total: number;
  passed: number;
  failed: number;
  errored: number;
  expectedFailures: number;
  unexpectedPasses: number;
  skipped: number;
  durationMs: number;
  results: CaseResult[];
  /** `true` when no case failed, errored, or unexpectedly passed. */
  ok: boolean;
}

/** Minimal structured logger; defaults to a no-op so the library stays silent. */
export interface RegressionLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/** Metrics sink; defaults to a no-op. Names are prefixed `router.regression.`. */
export interface RegressionMetricsSink {
  increment(name: string, tags?: Record<string, string>): void;
  timing(name: string, valueMs: number, tags?: Record<string, string>): void;
}

export interface RunnerOptions {
  logger?: RegressionLogger;
  metrics?: RegressionMetricsSink;
  /** Only run cases carrying at least one of these tags. */
  includeTags?: string[];
  /** Per-case time budget in ms; slower cases fail (default 1000). */
  caseTimeoutMs?: number;
  /** Clock override for deterministic tests. */
  now?: () => number;
}

export const DEFAULT_FEE_TOLERANCE = 1e-9;
export const DEFAULT_CASE_TIMEOUT_MS = 1000;
