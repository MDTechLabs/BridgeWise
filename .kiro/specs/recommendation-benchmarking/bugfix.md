# Bugfix Requirements Document

## Introduction

The route recommendation system in `bridge-recommendation.engine.ts` ranks bridge routes using a composite score across fee, slippage, estimated time, reliability, and historical success rate. However, there is no way to measure whether this ranking is actually correct — no standard benchmark datasets exist, no accuracy metrics are computed, and no reports are generated. This makes it impossible to validate, compare, or improve the recommendation algorithm. The bug manifests as an inability to determine ranking quality, meaning a broken or suboptimal scoring function could go undetected indefinitely.

The fix involves creating a benchmarking suite under `tests/benchmarks/recommendations/stellar/` that evaluates the recommendation engine against curated datasets and generates accuracy reports.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the recommendation engine ranks routes for a known dataset THEN the system produces no accuracy metrics, making ranking quality unmeasurable

1.2 WHEN the recommendation engine is evaluated THEN the system provides no comparison between predicted ranking and known-optimal ranking

1.3 WHEN benchmark evaluation is run THEN the system generates no report summarizing recommendation accuracy across different route scenarios

1.4 WHEN routes have missing metrics (no `reliabilityScore` or `historicalSuccessRate`) THEN the system silently falls back to fee-only ranking without any signal that accuracy has degraded

### Expected Behavior (Correct)

2.1 WHEN the recommendation engine ranks routes for a known benchmark dataset THEN the system SHALL compute ranking accuracy metrics (e.g., NDCG, top-1 accuracy) against the ground-truth optimal ordering

2.2 WHEN the recommendation engine is evaluated against a benchmark dataset THEN the system SHALL compare the predicted route ranking to the known-optimal ranking and report the degree of match

2.3 WHEN a benchmark evaluation run completes THEN the system SHALL generate a structured report containing dataset name, per-scenario results, and aggregate accuracy scores

2.4 WHEN routes have missing metrics in a benchmark scenario THEN the system SHALL flag the degraded evaluation in the report rather than silently falling back

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the recommendation engine receives a valid set of routes with complete metrics THEN the system SHALL CONTINUE TO return ranked routes sorted by composite score in descending order

3.2 WHEN the recommendation engine receives an empty routes array THEN the system SHALL CONTINUE TO return an empty `rankedRoutes` array with an appropriate error message

3.3 WHEN routes have all metrics present THEN the system SHALL CONTINUE TO include fee, slippage, estimated time, reliability score, and historical success rate in each route's score breakdown

3.4 WHEN the live benchmark service tracks transaction speed and success rates THEN the system SHALL CONTINUE TO record and query those metrics independently of the new benchmarking suite
