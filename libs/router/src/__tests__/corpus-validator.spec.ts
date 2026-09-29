import { assertCorpusConsistent, CORPUS_LIMITS, CorpusValidationError, parseCorpusFile } from "../regression/corpus-validator";
import { DEFAULT_FEE_TOLERANCE } from "../regression/types";

const edge = (overrides: Record<string, unknown> = {}) => ({
  sourceNode: "A",
  targetNode: "B",
  provider: "p",
  fee: 1,
  latencyMs: 1000,
  liquidity: 100,
  isActive: true,
  ...overrides,
});

const baseCase = (overrides: Record<string, unknown> = {}) => ({
  id: "case-one",
  description: "a case",
  graph: { edges: [edge()] },
  request: { source: "A", target: "B", options: { strategy: "cheapest" } },
  expected: { kind: "route", route: { hops: ["A->B@p"] } },
  ...overrides,
});

const corpus = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  suite: "unit",
  description: "unit corpus",
  cases: [baseCase()],
  ...overrides,
});

function issuesOf(raw: unknown): string[] {
  try {
    parseCorpusFile(raw, "test.json");
  } catch (err) {
    if (err instanceof CorpusValidationError) return err.issues;
    throw err;
  }
  return [];
}

describe("parseCorpusFile", () => {
  describe("valid input", () => {
    it("parses a minimal file and applies defaults", () => {
      const file = parseCorpusFile(corpus(), "test.json");
      expect(file.suite).toBe("unit");
      expect(file.source).toBe("test.json");
      expect(file.feeTolerance).toBe(DEFAULT_FEE_TOLERANCE);
      expect(file.cases[0].status).toBe("active");
      expect(file.cases[0].tags).toEqual([]);
    });

    it("resolves named graph references", () => {
      const file = parseCorpusFile(corpus({ graphs: { "g-one": [edge()] }, cases: [baseCase({ graph: "g-one" })] }), "t");
      expect(file.graphs["g-one"]).toHaveLength(1);
      expect(file.cases[0].graph).toBe("g-one");
    });

    it("accepts generated graphs, multi-route expectations and known issues", () => {
      const file = parseCorpusFile(
        corpus({
          cases: [
            baseCase({
              status: "known-issue",
              issue: "tracked",
              graph: { generate: [{ asset: "USDC", sourceChain: "stellar", targetChain: "ethereum", amount: 10 }] },
              request: { source: "A", target: "B", options: { strategy: "fastest", maxHops: 1 }, maxResults: 2 },
              expected: { kind: "routes", routes: [{ hops: ["A->B@p"], totalFee: 0, totalLatencyMs: 0 }] },
            }),
          ],
        }),
        "t",
      );
      expect(file.cases[0].status).toBe("known-issue");
    });

    it("accepts the documented upper bounds", () => {
      const hops = Array.from({ length: CORPUS_LIMITS.maxHops }, (_, i) => `N${i}->N${i + 1}@p`);
      const issues = issuesOf(
        corpus({
          cases: [
            baseCase({
              request: {
                source: "N0",
                target: `N${CORPUS_LIMITS.maxHops}`,
                options: { strategy: "balanced", maxHops: CORPUS_LIMITS.maxHops, maxSlippageBps: 10000 },
                maxResults: CORPUS_LIMITS.maxResults,
              },
              expected: { kind: "routes", routes: [{ hops }] },
            }),
          ],
        }),
      );
      expect(issues).toEqual([]);
    });
  });

  describe("invalid input", () => {
    it.each([
      ["non-object root", null, "$: must be an object"],
      ["unsupported schema", corpus({ schemaVersion: 2 }), "$.schemaVersion: unsupported version 2"],
      ["missing cases", { schemaVersion: 1, suite: "unit", description: "d" }, "$.cases: is required"],
      ["empty cases", corpus({ cases: [] }), "$.cases: must contain at least 1 item(s)"],
      ["unknown root key", corpus({ extra: 1 }), "$.extra: unknown key"],
      ["bad suite name", corpus({ suite: "Has Spaces" }), "$.suite: must be lowercase kebab-case"],
      ["bad case id", corpus({ cases: [baseCase({ id: "Bad_ID" })] }), "$.cases[0].id: must be lowercase kebab-case"],
      ["unknown case key", corpus({ cases: [baseCase({ expectd: {} })] }), "$.cases[0].expectd: unknown key"],
      ["undeclared graph", corpus({ cases: [baseCase({ graph: "nope" })] }), 'references undeclared graph "nope"'],
      ["both graph kinds", corpus({ cases: [baseCase({ graph: { edges: [], generate: [] } })] }), 'exactly one of "edges" or "generate"'],
      ["negative fee", corpus({ cases: [baseCase({ graph: { edges: [edge({ fee: -1 })] } })] }), "fee: must be >= 0"],
      ["NaN-like latency", corpus({ cases: [baseCase({ graph: { edges: [edge({ latencyMs: "fast" })] } })] }), "latencyMs: must be a finite number"],
      ["non-boolean isActive", corpus({ cases: [baseCase({ graph: { edges: [edge({ isActive: 1 })] } })] }), "isActive: must be a boolean"],
      [
        "unknown strategy",
        corpus({ cases: [baseCase({ request: { source: "A", target: "B", options: { strategy: "cheap" } } })] }),
        "strategy: must be one of",
      ],
      [
        "maxHops zero",
        corpus({ cases: [baseCase({ request: { source: "A", target: "B", options: { strategy: "cheapest", maxHops: 0 } } })] }),
        "maxHops: must be >= 1",
      ],
      [
        "fractional maxHops",
        corpus({ cases: [baseCase({ request: { source: "A", target: "B", options: { strategy: "cheapest", maxHops: 1.5 } } })] }),
        "maxHops: must be an integer",
      ],
      ["malformed hop", corpus({ cases: [baseCase({ expected: { kind: "route", route: { hops: ["A to B"] } } })] }), "must match"],
      [
        "non-contiguous hops",
        corpus({ cases: [baseCase({ expected: { kind: "route", route: { hops: ["A->C@p", "D->B@p"] } } })] }),
        'must start at "C"',
      ],
      ["route ends elsewhere", corpus({ cases: [baseCase({ expected: { kind: "route", route: { hops: ["A->C@p"] } } })] }), 'must end at request target "B"'],
      ["unknown expected kind", corpus({ cases: [baseCase({ expected: { kind: "maybe" } })] }), 'must be "no-route", "route" or "routes"'],
      [
        "routes without maxResults",
        corpus({ cases: [baseCase({ expected: { kind: "routes", routes: [{ hops: ["A->B@p"] }] } })] }),
        'kind "routes" requires request.maxResults',
      ],
      [
        "route with maxResults",
        corpus({ cases: [baseCase({ request: { source: "A", target: "B", options: { strategy: "cheapest" }, maxResults: 2 } })] }),
        'use kind "routes"',
      ],
      ["known issue without reason", corpus({ cases: [baseCase({ status: "known-issue" })] }), '$.cases[0].issue: is required when status is "known-issue"'],
      ["unknown status", corpus({ cases: [baseCase({ status: "flaky" })] }), '$.cases[0].status: must be "active" or "known-issue"'],
      ["duplicate ids", corpus({ cases: [baseCase(), baseCase()] }), 'duplicate case id "case-one"'],
      ["prototype graph name", JSON.parse('{"schemaVersion":1,"suite":"u","description":"d","graphs":{"__proto__":[]},"cases":[]}'), "graph name must be lowercase kebab-case"],
      ["fee tolerance out of range", corpus({ feeTolerance: 5 }), "$.feeTolerance: must be <= 1"],
    ])("rejects %s", (_label, raw, fragment) => {
      const issues = issuesOf(raw);
      expect(issues.some((i) => i.includes(fragment))).toBe(true);
    });

    it("rejects files exceeding the case limit", () => {
      const cases = Array.from({ length: CORPUS_LIMITS.maxCasesPerFile + 1 }, (_, i) => baseCase({ id: `c-${i}` }));
      expect(issuesOf(corpus({ cases }))).toEqual([expect.stringContaining(`must contain at most ${CORPUS_LIMITS.maxCasesPerFile} items`)]);
    });

    it("rejects over-long strings", () => {
      const issues = issuesOf(corpus({ description: "x".repeat(CORPUS_LIMITS.maxStringLength + 1) }));
      expect(issues).toEqual([expect.stringContaining("must be at most")]);
    });

    it("reports every issue at once", () => {
      const err = (() => {
        try {
          parseCorpusFile(corpus({ suite: "BAD", cases: [baseCase({ id: "BAD" })] }), "multi.json");
        } catch (e) {
          return e as CorpusValidationError;
        }
        throw new Error("expected failure");
      })();
      expect(err).toBeInstanceOf(CorpusValidationError);
      expect(err.source).toBe("multi.json");
      expect(err.issues.length).toBeGreaterThanOrEqual(2);
      expect(err.message).toContain("multi.json");
    });
  });
});

describe("assertCorpusConsistent", () => {
  it("accepts distinct suites", () => {
    const a = parseCorpusFile(corpus({ suite: "a" }), "a.json");
    const b = parseCorpusFile(corpus({ suite: "b" }), "b.json");
    expect(() => assertCorpusConsistent([a, b])).not.toThrow();
  });

  it("rejects duplicate suite names across files", () => {
    const a = parseCorpusFile(corpus(), "a.json");
    const b = parseCorpusFile(corpus(), "b.json");
    expect(() => assertCorpusConsistent([a, b])).toThrow(/suite "unit" is declared in both a.json and b.json/);
  });
});
