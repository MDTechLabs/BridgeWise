/**
 * StellarLatencyProfiler
 *
 * A lightweight utility for tracking and reporting the latency of named operations.
 * Useful for instrumenting async calls, API requests, or any timed operation where
 * you want to collect statistics (count, average, min, max) across multiple runs.
 */
export class StellarLatencyProfiler {
  // Maps an operation name to an array of recorded latencies (in ms) for that operation.
  // Using an array (rather than running stats) lets us compute accurate aggregates later.
  private records: Map<string, number[]> = new Map();

  /**
   * Marks the start of a timed operation.
   * @param operationName - Name used to group this timing under (currently unused here,
   *   but kept as a parameter for API symmetry with endOperation and for future use,
   *   e.g. logging or validation).
   * @returns The start timestamp (ms since epoch), to be passed into endOperation later.
   */
  startOperation(operationName: string): number {
    const startTime = Date.now();
    return startTime;
  }

  /**
   * Marks the end of a timed operation, computes the elapsed latency,
   * records it, and returns it.
   * @param operationName - Name to record this latency under.
   * @param startTime - The timestamp returned by the corresponding startOperation call.
   * @returns The measured latency in milliseconds.
   */
  endOperation(operationName: string, startTime: number): number {
    const endTime = Date.now();
    const latency = endTime - startTime;
    this.recordLatency(operationName, latency);
    return latency;
  }

  /**
   * Records a latency value for a given operation, creating a new entry
   * in the map if this is the first time the operation has been seen.
   * @param operationName - Name of the operation being recorded.
   * @param latency - Latency value in milliseconds to store.
   */
  recordLatency(operationName: string, latency: number): void {
    if (!this.records.has(operationName)) {
      this.records.set(operationName, []);
    }
    const latencies = this.records.get(operationName)!;
    latencies.push(latency);
  }

  /**
   * Builds a summary report of all recorded operations, computing
   * count, average, min, and max latency for each.
   * @returns A map of operation name -> aggregated latency stats.
   *   Average is rounded to 2 decimal places for readability.
   */
  getLatencyReport(): Record<
    string,
    { count: number; average: number; min: number; max: number }
  > {
    const report: Record<
      string,
      { count: number; average: number; min: number; max: number }
    > = {};

    for (const [operationName, latencies] of this.records.entries()) {
      // Sum all latencies so we can compute the average.
      const sum = latencies.reduce((acc, val) => acc + val, 0);

      // Spread into Math.min/max to get the extremes of the recorded values.
      // Note: this can throw a stack size error for extremely large arrays,
      // but is fine for typical profiling use cases.
      const min = Math.min(...latencies);
      const max = Math.max(...latencies);

      report[operationName] = {
        count: latencies.length,
        average: Number((sum / latencies.length).toFixed(2)),
        min,
        max,
      };
    }

    return report;
  }

  /**
   * Pretty-prints the latency report to the console, grouped by operation name.
   * Useful for quick debugging/inspection without needing to parse the raw report object.
   */
  printReport(): void {
    const report = this.getLatencyReport();
    console.log('Stellar Latency Profile Report:');
    for (const [operationName, metrics] of Object.entries(report)) {
      console.log(`  ${operationName}:`);
      console.log(`    Count: ${metrics.count}`);
      console.log(`    Average Latency: ${metrics.average}ms`);
      console.log(`    Min Latency: ${metrics.min}ms`);
      console.log(`    Max Latency: ${metrics.max}ms`);
    }
  }

  /**
   * Clears all recorded latency data, resetting the profiler to its initial state.
   */
  clear(): void {
    this.records.clear();
  }
}

// Export a singleton instance for convenience, so callers can import and use
// `stellarLatencyProfiler` directly without needing to instantiate the class themselves.
export const stellarLatencyProfiler = new StellarLatencyProfiler();
