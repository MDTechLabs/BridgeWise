/**
 * Validation for routing regression corpus files.
 *
 * Corpus files are data, not code: they are parsed from JSON and checked
 * against a strict schema before anything is replayed. Unknown keys are
 * rejected so typos cannot silently disable an assertion, and size limits
 * bound the work a single file can cause.
 */

import { GraphEdge, RoutingOptions, RoutingStrategy } from "../types";
import {
  CorpusFile,
  DEFAULT_FEE_TOLERANCE,
  ExpectedOutcome,
  ExpectedRoute,
  GeneratedEdgeSpec,
  GraphSource,
  RegressionCase,
  RegressionRequest,
  SUPPORTED_SCHEMA_VERSIONS,
} from "./types";

export const CORPUS_LIMITS = {
  maxCasesPerFile: 500,
  maxGraphsPerFile: 100,
  maxEdgesPerGraph: 1000,
  maxStringLength: 256,
  maxHops: 16,
  maxResults: 20,
  maxTags: 16,
} as const;

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
const HOP_PATTERN = /^(.+)->(.+)@(.+)$/;
const STRATEGIES: readonly RoutingStrategy[] = ["cheapest", "fastest", "balanced"];
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Thrown when a corpus file fails validation; lists every problem found. */
export class CorpusValidationError extends Error {
  constructor(
    readonly source: string,
    readonly issues: string[],
  ) {
    super(`Invalid regression corpus "${source}":\n  - ${issues.join("\n  - ")}`);
    this.name = "CorpusValidationError";
  }
}

type Obj = Record<string, unknown>;

class Checker {
  readonly issues: string[] = [];

  fail(path: string, message: string): void {
    this.issues.push(`${path}: ${message}`);
  }

  object(value: unknown, path: string, allowed: readonly string[], required: readonly string[] = []): Obj | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      this.fail(path, "must be an object");
      return null;
    }
    const obj = value as Obj;
    for (const key of Object.keys(obj)) {
      if (!allowed.includes(key)) this.fail(`${path}.${key}`, "unknown key");
    }
    for (const key of required) {
      if (!(key in obj)) this.fail(`${path}.${key}`, "is required");
    }
    return obj;
  }

  array(value: unknown, path: string, max: number, min = 0): unknown[] | null {
    if (!Array.isArray(value)) {
      this.fail(path, "must be an array");
      return null;
    }
    if (value.length < min) this.fail(path, `must contain at least ${min} item(s)`);
    if (value.length > max) {
      this.fail(path, `must contain at most ${max} items (got ${value.length})`);
      return null;
    }
    return value;
  }

  string(value: unknown, path: string): string | null {
    if (typeof value !== "string" || value.length === 0) {
      this.fail(path, "must be a non-empty string");
      return null;
    }
    if (value.length > CORPUS_LIMITS.maxStringLength) {
      this.fail(path, `must be at most ${CORPUS_LIMITS.maxStringLength} characters`);
      return null;
    }
    return value;
  }

  number(value: unknown, path: string, opts: { min?: number; max?: number; integer?: boolean } = {}): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      this.fail(path, "must be a finite number");
      return null;
    }
    if (opts.integer && !Number.isInteger(value)) this.fail(path, "must be an integer");
    if (opts.min !== undefined && value < opts.min) this.fail(path, `must be >= ${opts.min}`);
    if (opts.max !== undefined && value > opts.max) this.fail(path, `must be <= ${opts.max}`);
    return value;
  }

  stringList(value: unknown, path: string, max: number): string[] {
    const arr = this.array(value, path, max);
    if (!arr) return [];
    return arr.map((v, i) => this.string(v, `${path}[${i}]`)).filter((v): v is string => v !== null);
  }
}

function validateEdge(c: Checker, raw: unknown, path: string): GraphEdge | null {
  const keys = ["sourceNode", "targetNode", "provider", "fee", "latencyMs", "liquidity", "isActive"];
  const o = c.object(raw, path, keys, keys);
  if (!o) return null;
  const sourceNode = c.string(o.sourceNode, `${path}.sourceNode`);
  const targetNode = c.string(o.targetNode, `${path}.targetNode`);
  const provider = c.string(o.provider, `${path}.provider`);
  const fee = c.number(o.fee, `${path}.fee`, { min: 0 });
  const latencyMs = c.number(o.latencyMs, `${path}.latencyMs`, { min: 0 });
  const liquidity = c.number(o.liquidity, `${path}.liquidity`);
  if (typeof o.isActive !== "boolean") c.fail(`${path}.isActive`, "must be a boolean");
  if (sourceNode === null || targetNode === null || provider === null) return null;
  if (fee === null || latencyMs === null || liquidity === null) return null;
  return { sourceNode, targetNode, provider, fee, latencyMs, liquidity, isActive: o.isActive === true };
}

function validateEdges(c: Checker, raw: unknown, path: string): GraphEdge[] {
  const arr = c.array(raw, path, CORPUS_LIMITS.maxEdgesPerGraph);
  if (!arr) return [];
  return arr.map((e, i) => validateEdge(c, e, `${path}[${i}]`)).filter((e): e is GraphEdge => e !== null);
}

function validateGenerated(c: Checker, raw: unknown, path: string): GeneratedEdgeSpec[] {
  const arr = c.array(raw, path, CORPUS_LIMITS.maxEdgesPerGraph, 1);
  if (!arr) return [];
  const specs: GeneratedEdgeSpec[] = [];
  arr.forEach((item, i) => {
    const p = `${path}[${i}]`;
    const o = c.object(item, p, ["asset", "sourceChain", "targetChain", "amount", "provider"], [
      "asset",
      "sourceChain",
      "targetChain",
      "amount",
    ]);
    if (!o) return;
    const asset = c.string(o.asset, `${p}.asset`);
    const sourceChain = c.string(o.sourceChain, `${p}.sourceChain`);
    const targetChain = c.string(o.targetChain, `${p}.targetChain`);
    const amount = c.number(o.amount, `${p}.amount`, { min: 0 });
    const provider = o.provider === undefined ? undefined : c.string(o.provider, `${p}.provider`) ?? undefined;
    if (asset && sourceChain && targetChain && amount !== null) {
      specs.push({ asset, sourceChain, targetChain, amount, ...(provider ? { provider } : {}) });
    }
  });
  return specs;
}

function validateGraphSource(c: Checker, raw: unknown, path: string, graphs: Record<string, GraphEdge[]>): GraphSource | null {
  if (typeof raw === "string") {
    if (!Object.prototype.hasOwnProperty.call(graphs, raw)) {
      c.fail(path, `references undeclared graph "${raw}"`);
      return null;
    }
    return raw;
  }
  const o = c.object(raw, path, ["edges", "generate"]);
  if (!o) return null;
  const hasEdges = "edges" in o;
  const hasGenerate = "generate" in o;
  if (hasEdges === hasGenerate) {
    c.fail(path, 'must declare exactly one of "edges" or "generate"');
    return null;
  }
  return hasEdges ? { edges: validateEdges(c, o.edges, `${path}.edges`) } : { generate: validateGenerated(c, o.generate, `${path}.generate`) };
}

function validateOptions(c: Checker, raw: unknown, path: string): RoutingOptions | null {
  const o = c.object(raw, path, ["strategy", "maxSlippageBps", "preferProviders", "excludeProviders", "maxHops"], ["strategy"]);
  if (!o) return null;
  if (!STRATEGIES.includes(o.strategy as RoutingStrategy)) {
    c.fail(`${path}.strategy`, `must be one of ${STRATEGIES.join(", ")}`);
    return null;
  }
  const options: RoutingOptions = { strategy: o.strategy as RoutingStrategy };
  if (o.maxSlippageBps !== undefined) {
    const v = c.number(o.maxSlippageBps, `${path}.maxSlippageBps`, { min: 0, max: 10000, integer: true });
    if (v !== null) options.maxSlippageBps = v;
  }
  if (o.maxHops !== undefined) {
    const v = c.number(o.maxHops, `${path}.maxHops`, { min: 1, max: CORPUS_LIMITS.maxHops, integer: true });
    if (v !== null) options.maxHops = v;
  }
  if (o.preferProviders !== undefined) options.preferProviders = c.stringList(o.preferProviders, `${path}.preferProviders`, 64);
  if (o.excludeProviders !== undefined) options.excludeProviders = c.stringList(o.excludeProviders, `${path}.excludeProviders`, 64);
  return options;
}

function validateRequest(c: Checker, raw: unknown, path: string): RegressionRequest | null {
  const o = c.object(raw, path, ["source", "target", "options", "maxResults"], ["source", "target", "options"]);
  if (!o) return null;
  const source = c.string(o.source, `${path}.source`);
  const target = c.string(o.target, `${path}.target`);
  const options = validateOptions(c, o.options, `${path}.options`);
  let maxResults: number | undefined;
  if (o.maxResults !== undefined) {
    maxResults = c.number(o.maxResults, `${path}.maxResults`, { min: 1, max: CORPUS_LIMITS.maxResults, integer: true }) ?? undefined;
  }
  if (!source || !target || !options) return null;
  return { source, target, options, ...(maxResults !== undefined ? { maxResults } : {}) };
}

function validateRoute(c: Checker, raw: unknown, path: string, request: RegressionRequest | null): ExpectedRoute | null {
  const o = c.object(raw, path, ["hops", "totalFee", "totalLatencyMs"], ["hops"]);
  if (!o) return null;
  const hops = c.array(o.hops, `${path}.hops`, CORPUS_LIMITS.maxHops, 1);
  if (!hops) return null;
  const parsed: string[] = [];
  let previousTarget = request?.source;
  hops.forEach((h, i) => {
    const hopPath = `${path}.hops[${i}]`;
    const s = c.string(h, hopPath);
    if (s === null) return;
    const match = HOP_PATTERN.exec(s);
    if (!match) {
      c.fail(hopPath, 'must match "<source>-><target>@<provider>"');
      return;
    }
    if (previousTarget !== undefined && match[1] !== previousTarget) {
      c.fail(hopPath, `must start at "${previousTarget}" to form a contiguous path`);
    }
    previousTarget = match[2];
    parsed.push(s);
  });
  if (request && previousTarget !== undefined && parsed.length === hops.length && previousTarget !== request.target) {
    c.fail(`${path}.hops`, `must end at request target "${request.target}"`);
  }
  const route: ExpectedRoute = { hops: parsed };
  if (o.totalFee !== undefined) {
    const v = c.number(o.totalFee, `${path}.totalFee`, { min: 0 });
    if (v !== null) route.totalFee = v;
  }
  if (o.totalLatencyMs !== undefined) {
    const v = c.number(o.totalLatencyMs, `${path}.totalLatencyMs`, { min: 0 });
    if (v !== null) route.totalLatencyMs = v;
  }
  return route;
}

function validateExpected(c: Checker, raw: unknown, path: string, request: RegressionRequest | null): ExpectedOutcome | null {
  const o = c.object(raw, path, ["kind", "route", "routes"], ["kind"]);
  if (!o) return null;
  switch (o.kind) {
    case "no-route":
      if ("route" in o || "routes" in o) c.fail(path, '"no-route" must not declare routes');
      return { kind: "no-route" };
    case "route": {
      if (request?.maxResults !== undefined) c.fail(path, 'use kind "routes" when request.maxResults is set');
      const route = validateRoute(c, o.route, `${path}.route`, request);
      return route ? { kind: "route", route } : null;
    }
    case "routes": {
      if (request && request.maxResults === undefined) c.fail(path, 'kind "routes" requires request.maxResults');
      const arr = c.array(o.routes, `${path}.routes`, CORPUS_LIMITS.maxResults, 1);
      if (!arr) return null;
      if (request?.maxResults !== undefined && arr.length > request.maxResults) {
        c.fail(`${path}.routes`, `cannot expect more routes than request.maxResults (${request.maxResults})`);
      }
      const routes = arr.map((r, i) => validateRoute(c, r, `${path}.routes[${i}]`, request)).filter((r): r is ExpectedRoute => r !== null);
      return { kind: "routes", routes };
    }
    default:
      c.fail(`${path}.kind`, 'must be "no-route", "route" or "routes"');
      return null;
  }
}

function validateCase(c: Checker, raw: unknown, path: string, graphs: Record<string, GraphEdge[]>): RegressionCase | null {
  const o = c.object(
    raw,
    path,
    ["id", "description", "tags", "status", "issue", "graph", "request", "expected"],
    ["id", "description", "graph", "request", "expected"],
  );
  if (!o) return null;
  const id = c.string(o.id, `${path}.id`);
  if (id !== null && !ID_PATTERN.test(id)) c.fail(`${path}.id`, "must be lowercase kebab-case (a-z, 0-9, -), max 80 chars");
  const description = c.string(o.description, `${path}.description`);
  const tags = o.tags === undefined ? [] : c.stringList(o.tags, `${path}.tags`, CORPUS_LIMITS.maxTags);
  const status = o.status ?? "active";
  if (status !== "active" && status !== "known-issue") c.fail(`${path}.status`, 'must be "active" or "known-issue"');
  let issue: string | undefined;
  if (o.issue !== undefined) issue = c.string(o.issue, `${path}.issue`) ?? undefined;
  if (status === "known-issue" && issue === undefined) c.fail(`${path}.issue`, 'is required when status is "known-issue"');
  const graph = validateGraphSource(c, o.graph, `${path}.graph`, graphs);
  const request = validateRequest(c, o.request, `${path}.request`);
  const expected = validateExpected(c, o.expected, `${path}.expected`, request);
  if (id === null || description === null || graph === null || request === null || expected === null) return null;
  return {
    id,
    description,
    tags,
    status: status as RegressionCase["status"],
    ...(issue !== undefined ? { issue } : {}),
    graph,
    request,
    expected,
  };
}

/**
 * Validate a parsed corpus file and return it in normalised form.
 *
 * @param raw - the value produced by `JSON.parse` on the file contents.
 * @param source - a label (usually the file name) used in error messages.
 * @throws {CorpusValidationError} listing every problem found.
 */
export function parseCorpusFile(raw: unknown, source: string): CorpusFile {
  const c = new Checker();
  const o = c.object(raw, "$", ["$schema", "schemaVersion", "suite", "description", "feeTolerance", "graphs", "cases"], [
    "schemaVersion",
    "suite",
    "description",
    "cases",
  ]);
  if (!o) throw new CorpusValidationError(source, c.issues);

  if (!(SUPPORTED_SCHEMA_VERSIONS as readonly unknown[]).includes(o.schemaVersion)) {
    c.fail("$.schemaVersion", `unsupported version ${String(o.schemaVersion)}; supported: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}`);
  }
  const suite = c.string(o.suite, "$.suite");
  if (suite !== null && !ID_PATTERN.test(suite)) c.fail("$.suite", "must be lowercase kebab-case");
  const description = c.string(o.description, "$.description");
  const feeTolerance =
    o.feeTolerance === undefined ? DEFAULT_FEE_TOLERANCE : c.number(o.feeTolerance, "$.feeTolerance", { min: 0, max: 1 }) ?? DEFAULT_FEE_TOLERANCE;

  const graphs: Record<string, GraphEdge[]> = Object.create(null);
  if (o.graphs !== undefined) {
    const g = c.object(o.graphs, "$.graphs", Object.keys((o.graphs as Obj) ?? {}));
    if (g) {
      const names = Object.keys(g);
      if (names.length > CORPUS_LIMITS.maxGraphsPerFile) c.fail("$.graphs", `must declare at most ${CORPUS_LIMITS.maxGraphsPerFile} graphs`);
      for (const name of names.slice(0, CORPUS_LIMITS.maxGraphsPerFile)) {
        if (FORBIDDEN_KEYS.has(name) || !ID_PATTERN.test(name)) {
          c.fail(`$.graphs.${name}`, "graph name must be lowercase kebab-case");
          continue;
        }
        graphs[name] = validateEdges(c, g[name], `$.graphs.${name}`);
      }
    }
  }

  const rawCases = c.array(o.cases, "$.cases", CORPUS_LIMITS.maxCasesPerFile, 1) ?? [];
  const cases: RegressionCase[] = [];
  const seen = new Set<string>();
  rawCases.forEach((rc, i) => {
    const parsed = validateCase(c, rc, `$.cases[${i}]`, graphs);
    if (!parsed) return;
    if (seen.has(parsed.id)) c.fail(`$.cases[${i}].id`, `duplicate case id "${parsed.id}"`);
    seen.add(parsed.id);
    cases.push(parsed);
  });

  if (c.issues.length > 0 || suite === null || description === null) {
    throw new CorpusValidationError(source, c.issues);
  }
  return {
    schemaVersion: o.schemaVersion as CorpusFile["schemaVersion"],
    suite,
    description,
    feeTolerance,
    graphs,
    cases,
    source,
  };
}

/**
 * Check invariants that span several corpus files (currently: suite names are
 * unique so result identifiers `<suite>/<case>` are unambiguous).
 *
 * @throws {CorpusValidationError}
 */
export function assertCorpusConsistent(files: CorpusFile[]): void {
  const bySuite = new Map<string, string>();
  const issues: string[] = [];
  for (const f of files) {
    const prior = bySuite.get(f.suite);
    if (prior) issues.push(`suite "${f.suite}" is declared in both ${prior} and ${f.source}`);
    else bySuite.set(f.suite, f.source);
  }
  if (issues.length > 0) throw new CorpusValidationError("<corpus>", issues);
}
