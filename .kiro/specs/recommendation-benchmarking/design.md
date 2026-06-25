# Recommendation Benchmarking Bugfix Design

## Overview

The `recommendBridgeRoutes` function in `bridge-recommendation.engine.ts` ranks bridge routes using a composite score across fee, slippage, estimated time, reliability, and historical success rate. No benchmark harness exists to validate whether this ranking is correct — there are no curated datasets, no accuracy metrics, and no reports. A broken or suboptimal scoring function could go undetected indefinitely.

The fix is purely additive: create a benchmarking suite under `tests/benchmarks/recommendations/stellar/` that evaluates the engine against curated datasets and generates structured accuracy reports. No changes are made to `bridge-recommendation.engine.ts` or `bridge-benchmark.service.ts`.

## Glossary

- **Bug_Condition (C)**: A benchmark evaluation is run but the system produces no accuracy metrics, no ranking comparison, and no structured report — leaving ranking quality unmeasurable.
- **Property (P)**: The desired behavior when a benchmark run completes — accuracy metrics (NDCG, top-1) are computed, predicted ranking is compared to ground truth, and a structured report is generated.
- **Preservation**: The existing behavior of `recommendBridgeRoutes` and `BridgeBenchmarkService` that must remain unchanged by this fix.
- **recommendBridgeRoutes**: The function in `apps/api/src/bridge-recommendation/bridge-recommendation.engine.ts` that ranks bridge routes by composite score and returns `{ rankedRoutes, errors }`.
- **BridgeBenchmarkService**: The service in `apps/api/src/bridge-benchmark/bridge-benchmark.service.ts` that records live transaction speed and success metrics — entirely separate from the new benchmarking suite.
- **NDCG (Normalized Discounted Cumulative Gain)**: A standard ranking quality metric in [0, 1] where 1.0 means perfect alignment with the ground-truth ordering.
- **Top-1 Accuracy**: Whether the route ranked first by the engine matches the ground-truth optimal route (0 or 1 per scenario).
- **Ground-truth ordering**: A curated, known-optimal ranking of routes for a given scenario, used as the reference for accuracy measurement.
- **Degraded evaluation**: A scenario where one or more routes are missing `reliabilityScore` or `historicalSuccessRate`, causing the engine to silently fall back to partial scoring.
- **BenchmarkScenario**: A single test case in a dataset — a `RecommendationInput` paired with a ground-truth ordered list of bridge names.
- **BenchmarkDataset**: A named collection of `BenchmarkScenario` entries.
- **BenchmarkReport**: The structured output of a benchmark run — contains dataset name, per-scenario results, and aggregate accuracy scores.

## Bug Details

### Bug Condition

The bug manifests when a benchmark evaluation is triggered against any dataset of routes. The benchmarking infrastructure does not exist: no function computes accuracy metrics, no function compares predicted ranking to ground truth, and no function generates a report. The engine's ranking quality is therefore completely unobservable.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type BenchmarkEvaluationRequest
         (a dataset with named scenarios and ground-truth orderings)
  OUTPUT: boolean

  RETURN NOT exists(accuracyMetricsFunction)
         OR NOT exists(rankingComparisonFunction)
         OR NOT exists(reportGenerationFunction)
         OR (hasMissingMetrics(input) AND NOT flaggedAsDegraded(output))
END FUNCTION
```

### Examples

- **Example 1**: Running any evaluation against a curated dataset with known-optimal ordering produces `undefined` accuracy metrics — there is no NDCG or top-1 score to inspect.
- **Example 2**: Given a 3-route scenario where ground truth is `[BridgeA, BridgeB, BridgeC]` and the engine returns `[BridgeC, BridgeA, BridgeB]`, no comparison is made and no mismatch is reported.
- **Example 3**: After running evaluations across 10 scenarios, no summary report is generated — there is nothing to review, compare across runs, or commit to a results file.
- **Edge case**: A scenario where routes have `reliabilityScore: undefined` causes the engine to silently fall back to fee-only ranking — the resulting lower accuracy goes unnoticed because no metrics exist to detect it.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `recommendBridgeRoutes` with complete metrics SHALL continue to return routes sorted by composite score in descending order, with a full breakdown containing `fee`, `slippage`, `estimatedTime`, `reliabilityScore`, and `historicalSuccessRate`.
- `recommendBridgeRoutes` with an empty `routes` array SHALL continue to return `{ rankedRoutes: [], errors: ['No bridge routes available'] }`.
- `BridgeBenchmarkService` methods (`initiate`, `confirm`, `updateStatus`, `getSpeedMetrics`, `getRankingMetrics`) SHALL continue to operate and record live transaction metrics independently of the new suite.

**Scope:**
All behavior of `recommendBridgeRoutes` for inputs that do NOT involve the benchmarking infrastructure should be completely unaffected. The new suite lives entirely in `tests/benchmarks/recommendations/stellar/` and imports the engine as a pure function — it adds no side effects and modifies no existing code.

## Hypothesized Root Cause

The benchmarking infrastructure was never built. The root causes are:

1. **No benchmark datasets exist**: There are no curated `BenchmarkDataset` fixtures with `RecommendationInput` + ground-truth orderings to drive evaluation.

2. **No accuracy metric implementation**: No function computes NDCG or top-1 accuracy by comparing the engine's ranked output against a ground-truth ordering.

3. **No report generator**: No function aggregates per-scenario results into a structured `BenchmarkReport` with dataset name, scenario outcomes, and aggregate scores.

4. **No degraded-evaluation detection**: The engine silently falls back when `reliabilityScore` or `historicalSuccessRate` is missing. No layer inspects routes before scoring to detect and flag this condition.

## Correctness Properties

Property 1: Bug Condition - Benchmark Evaluation Produces Accuracy Metrics and Report

_For any_ `BenchmarkDataset` containing at least one `BenchmarkScenario` with a ground-truth ordering, running the benchmark suite SHALL compute NDCG and top-1 accuracy for each scenario, compare predicted ranking to ground truth, and return a `BenchmarkReport` containing `datasetName`, per-scenario results, and aggregate accuracy scores — rather than producing no output.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Degraded Evaluation Flagging

_For any_ `BenchmarkScenario` where at least one route has `reliabilityScore === undefined` or `historicalSuccessRate === undefined` (isBugCondition sub-case for missing metrics), the benchmark suite SHALL set `degraded: true` and include a warning message on that scenario's result, rather than silently producing a potentially misleading accuracy score.

**Validates: Requirements 2.4**

Property 3: Preservation - Engine Ranking Unchanged

_For any_ `RecommendationInput` where the bug condition does NOT hold (i.e., all routes have complete metrics and the input is well-formed), the `recommendBridgeRoutes` function SHALL produce exactly the same `rankedRoutes` ordering and `breakdown` values as it did before the benchmarking suite was introduced, preserving all existing ranking behavior.

**Validates: Requirements 3.1, 3.2, 3.3**

## Fix Implementation

### Changes Required

The fix is entirely additive — new files only, no modifications to existing source files.

**Directory**: `tests/benchmarks/recommendations/stellar/`

**New Files**:

1. **`datasets/complete-metrics.dataset.ts`** — Curated benchmark dataset with scenarios that have all five metrics populated and a known-optimal ordering derived from manual score calculation.
   - At least 3 scenarios: standard 3-route scenario, tie-breaking scenario, single-route scenario
   - Ground truth orderings computed by applying the engine's scoring formula manually

2. **`datasets/missing-metrics.dataset.ts`** — Curated benchmark dataset with scenarios where one or more routes are missing `reliabilityScore` or `historicalSuccessRate`.
   - At least 2 scenarios to exercise the degraded-evaluation flag

3. **`metrics/ndcg.ts`** — Pure function implementing NDCG calculation:
   - `computeNDCG(predicted: string[], groundTruth: string[]): number`
   - Returns a value in [0, 1]
   - Returns 1.0 when predicted matches ground truth exactly
   - Returns 0.0 for worst-case inversion (where applicable)

4. **`metrics/top1-accuracy.ts`** — Pure function:
   - `computeTop1Accuracy(predicted: string[], groundTruth: string[]): 0 | 1`
   - Returns 1 if `predicted[0] === groundTruth[0]`, else 0

5. **`runner/benchmark-runner.ts`** — Core evaluation function:
   - `runBenchmark(dataset: BenchmarkDataset): BenchmarkReport`
   - For each scenario: calls `recommendBridgeRoutes`, extracts bridge name ordering, checks for missing metrics, computes NDCG and top-1, flags degraded if needed
   - Aggregates per-scenario results into overall mean NDCG and mean top-1

6. **`runner/benchmark-runner.test.ts`** — Test suite (vitest):
   - Exploratory tests (run against current engine to confirm/refute root cause)
   - Fix-checking tests (assert report structure and metric correctness)
   - Preservation tests using property-based testing (fast-check) to verify engine output is unchanged for non-buggy inputs

**Type definitions** (inline in runner or a shared `types.ts`):
```typescript
interface BenchmarkScenario {
  name: string;
  input: RecommendationInput;
  groundTruth: string[]; // bridge names in optimal order
}

interface BenchmarkDataset {
  name: string;
  scenarios: BenchmarkScenario[];
}

interface ScenarioResult {
  scenarioName: string;
  predictedOrder: string[];
  groundTruthOrder: string[];
  ndcg: number;
  top1Accuracy: 0 | 1;
  degraded: boolean;
  degradedWarning?: string;
}

interface BenchmarkReport {
  datasetName: string;
  scenarioResults: ScenarioResult[];
  aggregateNDCG: number;
  aggregateTop1Accuracy: number;
  generatedAt: Date;
}
```

## Testing Strategy

### Validation Approach

The testing strategy follows two phases: first, write exploratory tests that confirm the bug (no metrics, no report) on the current codebase; then implement the fix and verify correctness via fix-checking tests and preservation via property-based tests.

### Exploratory Bug Condition Checking

**Goal**: Confirm the bug — demonstrate that running any evaluation against a dataset currently produces no accuracy output. Validate or refute the root cause hypothesis before implementing the fix.

**Test Plan**: Write tests in `benchmark-runner.test.ts` that attempt to call a `runBenchmark` function. Before the function exists, these tests will fail to compile or will throw. Once the scaffolding exists but before metrics are implemented, tests asserting numeric NDCG values will fail, surfacing the root cause.

**Test Cases**:
1. **Complete dataset evaluation** — Call `runBenchmark` with the complete-metrics dataset and assert `report.scenarioResults.length > 0` (will fail on unfixed code: function does not exist)
2. **NDCG range check** — Assert `report.aggregateNDCG` is between 0 and 1 (will fail on unfixed code: metric not computed)
3. **Top-1 accuracy check** — Assert `report.aggregateTop1Accuracy` is 0 or 1 (will fail on unfixed code: metric not computed)
4. **Missing metrics flag** — Run with missing-metrics dataset and assert `scenarioResult.degraded === true` (will fail on unfixed code: no degradation detection)

**Expected Counterexamples**:
- `runBenchmark` does not exist — import fails
- `report.aggregateNDCG` is `undefined` — metric not computed
- `scenarioResult.degraded` is `undefined` or `false` — no degradation detection

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds (any benchmark evaluation), the fixed suite produces the expected output.

**Pseudocode:**
```
FOR ALL dataset WHERE isBugCondition(dataset) DO
  report := runBenchmark(dataset)
  ASSERT report.datasetName IS string
  ASSERT report.scenarioResults.length === dataset.scenarios.length
  ASSERT report.aggregateNDCG IN [0, 1]
  ASSERT report.aggregateTop1Accuracy IN [0, 1]
  ASSERT report.generatedAt IS Date
  FOR EACH scenarioResult IN report.scenarioResults DO
    ASSERT scenarioResult.ndcg IN [0, 1]
    ASSERT scenarioResult.top1Accuracy IN {0, 1}
    ASSERT scenarioResult.predictedOrder.length > 0
    ASSERT scenarioResult.groundTruthOrder.length > 0
  END FOR
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (direct calls to `recommendBridgeRoutes` outside the benchmarking suite), the function produces the same result as before.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT recommendBridgeRoutes_before(input) = recommendBridgeRoutes_after(input)
END FOR
```

**Testing Approach**: Property-based testing with `fast-check` is recommended because:
- It generates many random `RecommendationInput` configurations automatically
- It catches edge cases (extreme fee values, all routes with same score) that manual tests miss
- It provides strong guarantees that the engine's output is unchanged across the full input domain

**Test Plan**: Observe `recommendBridgeRoutes` behavior on unmodified code, capture invariants, then write property tests that assert those invariants hold after the suite is added.

**Test Cases**:
1. **Ranking order preservation** — For any input with ≥2 routes with complete metrics, assert `rankedRoutes` is sorted by `score` descending (property test with fast-check)
2. **Empty input preservation** — Assert `recommendBridgeRoutes({ ...input, routes: [] })` returns `{ rankedRoutes: [], errors: ['No bridge routes available'] }`
3. **Breakdown completeness preservation** — For any route with all five metrics defined, assert `breakdown` contains all five keys (property test)
4. **Score monotonicity** — For any two consecutive ranked routes, assert `route[i].score >= route[i+1].score` (property test)

### Unit Tests

- Test `computeNDCG` with a perfect ordering (expect 1.0), reverse ordering (expect < 1.0), and single-element list (expect 1.0)
- Test `computeTop1Accuracy` with matching top-1 (expect 1) and non-matching top-1 (expect 0)
- Test `runBenchmark` with the complete-metrics dataset and assert all required report fields are present
- Test `runBenchmark` with the missing-metrics dataset and assert `degraded: true` and a non-empty `degradedWarning` on affected scenarios
- Test `runBenchmark` with a single-scenario dataset and assert `aggregateNDCG === scenarioResults[0].ndcg`

### Property-Based Tests

- Generate random complete `RecommendationInput` arrays via fast-check and assert `recommendBridgeRoutes` output is sorted by score descending (preservation)
- Generate random `BenchmarkDataset` instances and assert `runBenchmark` always returns a `BenchmarkReport` with the correct number of `scenarioResults`
- Generate random predicted/ground-truth orderings and assert `computeNDCG` always returns a value in [0, 1]
- Generate random inputs where ground truth equals predicted order and assert `computeNDCG` returns 1.0 and `computeTop1Accuracy` returns 1

### Integration Tests

- Run `runBenchmark` with the complete-metrics dataset end-to-end and assert aggregate NDCG is 1.0 (since ground truth is derived from the engine's own formula, predictions should be perfect)
- Run `runBenchmark` with the missing-metrics dataset and assert all affected scenarios are flagged as degraded
- Run `recommendBridgeRoutes` directly before and after adding the benchmarking suite and assert identical output for the same inputs (confirms no regressions in existing code)
