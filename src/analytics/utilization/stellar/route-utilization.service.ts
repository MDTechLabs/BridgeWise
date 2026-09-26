/**
 * Stellar Route Utilization Analytics Service
 *
 * Tracks how frequently each bridge route is used, aggregates utilization
 * metrics over time, and generates usage reports so operators can identify
 * popular routes and trends.
 *
 * @see Issue #510 — Implement Stellar Route Utilization Analytics
 */

import type {
  RouteUsageEntry,
  RouteUtilizationMetrics,
  UtilizationReport,
  TrackUsageOptions,
  RouteUtilizationConfig,
} from './route-utilization.types';

const MS_PER_DAY = 86_400_000;

export class StellarRouteUtilizationService {
  private readonly usageMap = new Map<string, RouteUsageEntry>();
  private readonly now: () => number;

  constructor(config: RouteUtilizationConfig = {}) {
    this.now = config.now ?? (() => Date.now());
  }

  // ─── Tracking ──────────────────────────────────────────────────────────────

  /**
   * Record a single usage event for `routeId`.
   * Creates a new entry if the route has not been seen before.
   */
  trackRouteUsage(routeId: string, options: TrackUsageOptions = {}): void {
    const ts = this.now();
    const volumeUsd = options.volumeUsd ?? 0;
    const existing = this.usageMap.get(routeId);

    if (existing) {
      existing.usageCount++;
      existing.lastUsed = ts;
      existing.totalVolumeUsd += volumeUsd;
    } else {
      this.usageMap.set(routeId, {
        routeId,
        usageCount: 1,
        firstUsed: ts,
        lastUsed: ts,
        totalVolumeUsd: volumeUsd,
      });
    }
  }

  // ─── Aggregation ──────────────────────────────────────────────────────────

  /**
   * Return computed metrics for all tracked routes,
   * sorted by usageCount descending.
   */
  aggregateMetrics(): RouteUtilizationMetrics[] {
    return Array.from(this.usageMap.values())
      .map((entry) => this.toMetrics(entry))
      .sort((a, b) => b.usageCount - a.usageCount);
  }

  /**
   * Return metrics for a specific route, or `undefined` if not tracked.
   */
  getRouteMetrics(routeId: string): RouteUtilizationMetrics | undefined {
    const entry = this.usageMap.get(routeId);
    return entry ? this.toMetrics(entry) : undefined;
  }

  // ─── Reporting ────────────────────────────────────────────────────────────

  /**
   * Generate a full utilization report with aggregate totals and per-route
   * metrics sorted by popularity.
   */
  generateUtilizationReport(): UtilizationReport {
    const metrics = this.aggregateMetrics();
    return {
      generatedAt: this.now(),
      totalRoutes: metrics.length,
      totalUsageCount: metrics.reduce((sum, m) => sum + m.usageCount, 0),
      metrics,
    };
  }

  /** Reset all tracked usage data. */
  reset(): void {
    this.usageMap.clear();
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private toMetrics(entry: RouteUsageEntry): RouteUtilizationMetrics {
    const elapsedMs = Math.max(this.now() - entry.firstUsed, 1);
    const avgDailyUsage =
      (entry.usageCount / elapsedMs) * MS_PER_DAY;

    return { ...entry, avgDailyUsage };
  }
}
