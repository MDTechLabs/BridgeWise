# Routing Regression Corpus

The routing regression corpus pins down how `@bridgewise/router` selects routes. It is a set of JSON files in
[`libs/router/corpus/`](../libs/router/corpus). Each file describes bridge graphs, the routing requests to replay
against them, and the routes the router must return. Any change to route selection makes a case fail. The change
then has to be either fixed or deliberately accepted by updating the corpus in the same pull request.

## Running

```bash
# Whole router test suite (unit tests + corpus); this is what CI runs
pnpm --filter @bridgewise/router test

# Corpus only
pnpm --filter @bridgewise/router test:regression
```

Each case appears as its own Jest test (`routing regression corpus › <suite> › <case-id>`), so failures name the
exact case. A final `reports ok overall` test prints a summary report on failure.

## Components and dependencies

| Component | Location | Role |
| --- | --- | --- |
| Corpus files | `libs/router/corpus/*.json` | Cases (data only; never executed) |
| Validator | `libs/router/src/regression/corpus-validator.ts` | Strict schema and limit checks (`parseCorpusFile`, `assertCorpusConsistent`) |
| Runner | `libs/router/src/regression/runner.ts` | Replays cases (`runRegressionCorpus`) and renders reports (`formatRegressionReport`) |
| Jest entry point | `libs/router/src/__tests__/regression-corpus.spec.ts` | Loads every corpus file and asserts each case |

Upstream dependencies: `PathFinder` and `CostCalculator` in `libs/router`. The corpus exercises them directly.
No network, database or other workspace package is involved. Downstream code that consumes router output (quote
services, route explainability in `tests/routing/`) relies on the behaviour the corpus pins down, but is not run
by it.

## File format

```jsonc
{
  "schemaVersion": 1,                  // required; only 1 is supported
  "suite": "core-strategies",          // required; kebab-case, unique across files
  "description": "…",                  // required
  "feeTolerance": 1e-9,                // optional absolute tolerance for totalFee (0..1)
  "graphs": {                          // optional named graphs shared by cases
    "usdc-mainnet": [ /* GraphEdge objects */ ]
  },
  "cases": [
    {
      "id": "cheapest-prefers-two-hop-over-direct",  // kebab-case, unique within the file
      "description": "…",
      "tags": ["strategy", "cheapest"],             // optional; used by includeTags filtering
      "status": "active",                           // optional: "active" (default) | "known-issue"
      "issue": "…",                                 // required when status is "known-issue"
      "graph": "usdc-mainnet",                      // a graph name, { "edges": [...] } or { "generate": [...] }
      "request": {
        "source": "USDC:stellar",
        "target": "USDC:ethereum",
        "options": { "strategy": "cheapest", "maxHops": 3, "preferProviders": [], "excludeProviders": [] },
        "maxResults": 3                             // optional; switches to findPaths
      },
      "expected": {
        "kind": "route",                            // "no-route" | "route" | "routes" (with maxResults)
        "route": {
          "hops": ["USDC:stellar->USDC:polygon@allbridge", "USDC:polygon->USDC:ethereum@stargate"],
          "totalFee": 0.7,                          // optional, compared within feeTolerance
          "totalLatencyMs": 420000                  // optional, compared exactly
        }
      }
    }
  ]
}
```

Hops are written as `"<sourceNode>-><targetNode>@<provider>"`. The validator checks that the hops form a contiguous
path from `request.source` to `request.target`, which catches typos in expectations before anything is run.

`{ "generate": [...] }` graphs are built by `CostCalculator.calculateEdges`. Cases using them test the fee and
latency model and path finding together.

### Secure defaults and limits

Corpus files are treated as untrusted data:

- They are parsed with `JSON.parse` only. No code in them is ever evaluated.
- Unknown keys are rejected, so a misspelled field (`"expectd"`) cannot silently disable an assertion.
- Numbers must be finite. Fees and latencies must be `>= 0`. Hop and result counts must be bounded integers.
- Graph names such as `__proto__` are rejected, and graphs are stored in a prototype-less map.
- Per-file limits (`CORPUS_LIMITS`): 500 cases, 100 graphs, 1000 edges per graph, 16 hops, 20 results, strings up
  to 256 characters.
- Every problem in a file is reported at once through `CorpusValidationError.issues`.

## Case statuses

| Status | Meaning | Reported as |
| --- | --- | --- |
| `active` | Must match | `pass` / `fail` |
| `known-issue` | `expected` holds the *correct* behaviour, and the router is known to deviate from it | `xfail` while broken; `xpass` (a failure) once it matches |

An `xpass` failure means the defect has been fixed. Change the case to `"status": "active"` and remove `issue`.

Current known issues:

- `graph-constraints/hop-limit-hides-valid-shortcut`: `PathFinder` tracks hop counts in one map keyed by node
  for the whole graph. A cheaper but longer partial path can therefore block a shorter path that satisfies `maxHops`.
- `graph-constraints/same-source-and-target-has-no-route`: `findPath(x, x)` returns a zero-hop result instead of
  `null`.

Some `active` cases are tagged `characterisation`. They lock in current behaviour that is debatable rather than
clearly correct, such as the balanced strategy's 60s latency cap, or `findPaths` only returning alternatives that
were queued before a better distance was recorded. Change them deliberately when that behaviour changes.

## Adding or updating cases

1. Add a case to the most relevant file, or create a new file with a new `suite` name.
2. Work out the expected route by hand and record it in `description`. Do not paste in whatever the router
   currently returns: an expectation that simply mirrors the output does not check anything.
3. Prefer small inline graphs for boundary cases. Use shared named graphs for realistic topologies.
4. Run `pnpm --filter @bridgewise/router test:regression`.
5. If a router change intentionally alters behaviour, update the affected expectations in the same PR and explain
   why in the PR description.

## Programmatic use, logging and metrics

The runner can be embedded, for example in a scheduled job that replays the corpus against a new build:

```ts
import { parseCorpusFile, runRegressionCorpus, formatRegressionReport } from "@bridgewise/router";

const report = await runRegressionCorpus([parseCorpusFile(JSON.parse(raw), "core.json")], {
  logger,              // { debug, warn, error }; defaults to a silent no-op
  metrics,             // { increment, timing }; defaults to a no-op
  includeTags: ["smoke"],
  caseTimeoutMs: 1000, // cases slower than this fail
});
if (!report.ok) console.error(formatRegressionReport(report));
```

Emitted metrics:

| Name | Type | Tags |
| --- | --- | --- |
| `router.regression.case` | counter | `suite`, `case`, `outcome` |
| `router.regression.case_duration_ms` | timing | `suite`, `case` |
| `router.regression.run` | counter | `ok` |
| `router.regression.run_duration_ms` | timing | — |

Logging: `warn` for `fail`/`xpass`, `error` for `error`, and `debug` for everything else. An exception thrown
inside one case is recorded as that case's `error` outcome and never stops the run.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Invalid regression corpus "x.json"` with a list of issues | Schema violation. Each entry gives a JSON path such as `$.cases[3].request.options.maxHops`. |
| `must start at "…" to form a contiguous path` | An expected hop does not continue from the previous hop's target. Check node IDs. |
| `route hops: expected [...], got [...]` | Route selection changed. Fix the regression, or update the case if the change is intended. |
| `totalFee: expected X (±tol), got Y` | The cost model or edge fees changed. Floating-point sums need `feeTolerance`; the default is `1e-9`. |
| `[xpass] … set status to "active"` | A known issue has been fixed. Promote the case. |
| `took Nms, exceeding the 1000ms budget` | Path finding became pathologically slow on that graph. Investigate before raising the budget. |
| `suite "x" is declared in both a.json and b.json` | Suite names must be unique across files. |
