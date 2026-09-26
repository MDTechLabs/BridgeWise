import { performance } from 'node:perf_hooks';
import { RouteRanker } from '../../../../src/services/route-ranker';
import { BenchmarkDataset } from './dataset-generator';
import { Evaluator, EvaluationResult } from './evaluator';

export interface BenchmarkMetrics {
  scenario: string;
  executionTimeMs: number;
  memoryUsedMb: number;
  evaluation: EvaluationResult;
}

export class BenchmarkRunner {
  private ranker: RouteRanker;
  private readonly ITERATIONS = 1000;
  private readonly WARMUP_ITERATIONS = 100;

  constructor() {
    // We instantiate our own so we don't pollute singletons or rely on global state.
    // However, RouteRanker is a singleton in this codebase.
    // We can use the public getInstance.
    this.ranker = (RouteRanker as any).getInstance();
  }

  private forceGC() {
    if (global.gc) {
      global.gc();
    }
  }

  public runScenario(dataset: BenchmarkDataset): BenchmarkMetrics {
    // 1. Warm-up Phase (JIT compilation of hot paths)
    for (let i = 0; i < this.WARMUP_ITERATIONS; i++) {
      this.ranker.rankRoutes(dataset.routes);
    }

    this.forceGC();
    
    // 2. Measure Memory and Time
    const startMemory = process.memoryUsage().heapUsed;
    const startTime = performance.now();

    for (let i = 0; i < this.ITERATIONS; i++) {
      // Re-run the ranker repeatedly to average out the execution time
      this.ranker.rankRoutes(dataset.routes);
    }

    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;

    // Calculate averages and diffs
    const totalTimeMs = endTime - startTime;
    const avgExecutionTimeMs = totalTimeMs / this.ITERATIONS;
    
    // Memory used during the entire run block (could be garbage collected later)
    // We max with 0 to avoid negative values if GC happened during the loop
    const memoryDiff = Math.max(0, endMemory - startMemory);
    const memoryUsedMb = memoryDiff / 1024 / 1024;

    // 3. Single run for evaluation
    const finalRankedRoutes = this.ranker.rankRoutes(dataset.routes);
    const evaluation = Evaluator.evaluate(dataset, finalRankedRoutes);

    return {
      scenario: dataset.scenario,
      executionTimeMs: avgExecutionTimeMs,
      memoryUsedMb,
      evaluation,
    };
  }
}
