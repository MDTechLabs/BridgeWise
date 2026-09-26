import {
  RoutePerformanceRecord,
  RouteStabilityResult,
} from "./types";

export class RouteStabilityAnalyzer {
  private history: RoutePerformanceRecord[] = [];

  addRecord(
    routeId: string,
    latency: number,
    success: boolean
  ) {
    this.history.push({
      routeId,
      latency,
      success,
      timestamp: Date.now(),
    });
  }

  getHistory(routeId?: string) {
    if (!routeId) return [...this.history];

    return this.history.filter(r => r.routeId === routeId);
  }

  clear() {
    this.history = [];
  }

  analyze(routeId: string): RouteStabilityResult {
    const records = this.getHistory(routeId);

    if (records.length === 0) {
      return {
        routeId,
        totalSamples: 0,
        averageLatency: 0,
        latencyVariance: 0,
        successRate: 0,
        stabilityScore: 0,
      };
    }

    const latencies = records.map(r => r.latency);

    const averageLatency =
      latencies.reduce((a, b) => a + b, 0) / latencies.length;

    const variance =
      latencies.reduce(
        (sum, value) => sum + Math.pow(value - averageLatency, 2),
        0
      ) / latencies.length;

    const successful =
      records.filter(r => r.success).length;

    const successRate =
      (successful / records.length) * 100;

    // Normalize latency consistency into a score
    const variabilityPenalty = Math.min(
      Math.sqrt(variance),
      100
    );

    const stabilityScore = Number(
      Math.max(
        0,
        Math.min(
          100,
          successRate - variabilityPenalty * 0.25
        )
      ).toFixed(2)
    );

    return {
      routeId,
      totalSamples: records.length,
      averageLatency: Number(
        averageLatency.toFixed(2)
      ),
      latencyVariance: Number(
        variance.toFixed(2)
      ),
      successRate: Number(successRate.toFixed(2)),
      stabilityScore,
    };
  }
}