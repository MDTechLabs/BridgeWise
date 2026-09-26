import type { RouteHealthStatus } from '../../../../monitoring/routes/stellar/stellar-route-health-monitor';

/**
 * A single point-in-time health observation for a Stellar route. These are the
 * raw records the tracker persists so that trends can be reconstructed later.
 */
export interface RouteHealthSnapshot {
  routeId: string;
  status: RouteHealthStatus;
  availability: number;
  latencyMs?: number;
  consecutiveFailures?: number;
  errorMessage?: string;
  recordedAt: Date;
}

/**
 * Input accepted when recording a snapshot. `recordedAt` is optional and
 * defaults to the current time so callers can simply forward a health state.
 */
export interface RouteHealthSample {
  routeId: string;
  status: RouteHealthStatus;
  availability: number;
  latencyMs?: number;
  consecutiveFailures?: number;
  errorMessage?: string;
  recordedAt?: Date;
}

export interface RouteHealthHistoryConfig {
  /** Maximum number of snapshots kept per route. Oldest are evicted first. */
  maxSnapshotsPerRoute?: number;
  /** Snapshots older than this (in ms) are pruned on write. 0 disables. */
  retentionMs?: number;
}

export interface HistoryQuery {
  from?: Date;
  to?: Date;
  /** When set, only the most recent N (within the range) are returned. */
  limit?: number;
}

/**
 * Aggregated view of a route's health over a window of snapshots. Used to
 * surface trends without forcing callers to crunch raw snapshots themselves.
 */
export interface RouteHealthTrend {
  routeId: string;
  sampleCount: number;
  from?: Date;
  to?: Date;
  averageAvailability: number;
  minAvailability: number;
  maxAvailability: number;
  averageLatencyMs: number | null;
  uptimeRatio: number;
  statusDistribution: Record<RouteHealthStatus, number>;
  currentStatus: RouteHealthStatus | null;
  /** Direction of availability change across the window. */
  availabilityTrend: 'improving' | 'declining' | 'stable';
}

export interface RouteHealthComparison {
  routeId: string;
  sampleCount: number;
  averageAvailability: number;
  uptimeRatio: number;
  averageLatencyMs: number | null;
  currentStatus: RouteHealthStatus | null;
  /** 1 = best ranked route in the comparison. */
  rank: number;
}

const ALL_STATUSES: RouteHealthStatus[] = [
  'healthy',
  'degraded',
  'unhealthy',
  'outage',
];

/**
 * Stores historical Stellar route health metrics and derives trends and
 * cross-route comparisons from them. Storage is in-memory and bounded by the
 * configured retention/size limits, mirroring the other in-memory history and
 * monitoring modules in the codebase.
 */
export class RouteHealthHistoryTracker {
  private readonly config: Required<RouteHealthHistoryConfig>;
  private readonly snapshots = new Map<string, RouteHealthSnapshot[]>();

  constructor(config: RouteHealthHistoryConfig = {}) {
    this.config = {
      maxSnapshotsPerRoute: config.maxSnapshotsPerRoute ?? 1000,
      retentionMs: config.retentionMs ?? 0,
    };
  }

  /** Records a single health observation for a route. */
  record(sample: RouteHealthSample): RouteHealthSnapshot {
    const snapshot: RouteHealthSnapshot = {
      routeId: sample.routeId,
      status: sample.status,
      availability: clampAvailability(sample.availability),
      latencyMs: sample.latencyMs,
      consecutiveFailures: sample.consecutiveFailures,
      errorMessage: sample.errorMessage,
      recordedAt: sample.recordedAt ?? new Date(),
    };

    const series = this.snapshots.get(sample.routeId) ?? [];
    series.push(snapshot);
    series.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
    this.prune(series);
    this.snapshots.set(sample.routeId, series);

    return snapshot;
  }

  /** Returns the raw snapshots for a route, optionally filtered by a query. */
  getHistory(routeId: string, query: HistoryQuery = {}): RouteHealthSnapshot[] {
    const series = this.snapshots.get(routeId) ?? [];
    let result = series.filter((s) => withinRange(s.recordedAt, query));
    if (query.limit !== undefined && query.limit >= 0) {
      result = result.slice(-query.limit);
    }
    return result.map((s) => ({ ...s }));
  }

  /** Returns the most recent snapshot recorded for a route, if any. */
  getLatest(routeId: string): RouteHealthSnapshot | null {
    const series = this.snapshots.get(routeId);
    if (!series || series.length === 0) {
      return null;
    }
    return { ...series[series.length - 1] };
  }

  /** Lists every route that has at least one recorded snapshot. */
  getTrackedRoutes(): string[] {
    return Array.from(this.snapshots.keys());
  }

  /**
   * Builds an aggregated health trend for a route over the given window.
   * Returns null when there are no snapshots in range.
   */
  getTrend(routeId: string, query: HistoryQuery = {}): RouteHealthTrend | null {
    const series = this.getHistory(routeId, query);
    if (series.length === 0) {
      return null;
    }

    const statusDistribution = emptyStatusDistribution();
    let availabilitySum = 0;
    let minAvailability = Number.POSITIVE_INFINITY;
    let maxAvailability = Number.NEGATIVE_INFINITY;
    let latencySum = 0;
    let latencyCount = 0;
    let healthyCount = 0;

    for (const snapshot of series) {
      statusDistribution[snapshot.status] += 1;
      availabilitySum += snapshot.availability;
      minAvailability = Math.min(minAvailability, snapshot.availability);
      maxAvailability = Math.max(maxAvailability, snapshot.availability);
      if (typeof snapshot.latencyMs === 'number') {
        latencySum += snapshot.latencyMs;
        latencyCount += 1;
      }
      if (snapshot.status === 'healthy') {
        healthyCount += 1;
      }
    }

    return {
      routeId,
      sampleCount: series.length,
      from: series[0].recordedAt,
      to: series[series.length - 1].recordedAt,
      averageAvailability: availabilitySum / series.length,
      minAvailability,
      maxAvailability,
      averageLatencyMs: latencyCount > 0 ? latencySum / latencyCount : null,
      uptimeRatio: healthyCount / series.length,
      statusDistribution,
      currentStatus: series[series.length - 1].status,
      availabilityTrend: computeAvailabilityTrend(series),
    };
  }

  /**
   * Ranks the supplied routes (or all tracked routes) by health over the
   * window. Routes are ordered by average availability, then uptime ratio,
   * then lower latency. Routes without snapshots in range are omitted.
   */
  compareRoutes(
    routeIds?: string[],
    query: HistoryQuery = {},
  ): RouteHealthComparison[] {
    const ids = routeIds ?? this.getTrackedRoutes();
    const comparisons: RouteHealthComparison[] = [];

    for (const routeId of ids) {
      const trend = this.getTrend(routeId, query);
      if (!trend) {
        continue;
      }
      comparisons.push({
        routeId,
        sampleCount: trend.sampleCount,
        averageAvailability: trend.averageAvailability,
        uptimeRatio: trend.uptimeRatio,
        averageLatencyMs: trend.averageLatencyMs,
        currentStatus: trend.currentStatus,
        rank: 0,
      });
    }

    comparisons.sort((a, b) => {
      if (b.averageAvailability !== a.averageAvailability) {
        return b.averageAvailability - a.averageAvailability;
      }
      if (b.uptimeRatio !== a.uptimeRatio) {
        return b.uptimeRatio - a.uptimeRatio;
      }
      const latencyA = a.averageLatencyMs ?? Number.POSITIVE_INFINITY;
      const latencyB = b.averageLatencyMs ?? Number.POSITIVE_INFINITY;
      return latencyA - latencyB;
    });

    comparisons.forEach((comparison, index) => {
      comparison.rank = index + 1;
    });

    return comparisons;
  }

  /** Removes history for a single route. Returns true if anything was removed. */
  clearRoute(routeId: string): boolean {
    return this.snapshots.delete(routeId);
  }

  /** Removes all recorded history across every route. */
  clear(): void {
    this.snapshots.clear();
  }

  private prune(series: RouteHealthSnapshot[]): void {
    if (this.config.retentionMs > 0) {
      const cutoff = Date.now() - this.config.retentionMs;
      let removable = 0;
      while (
        removable < series.length &&
        series[removable].recordedAt.getTime() < cutoff
      ) {
        removable += 1;
      }
      if (removable > 0) {
        series.splice(0, removable);
      }
    }

    const overflow = series.length - this.config.maxSnapshotsPerRoute;
    if (overflow > 0) {
      series.splice(0, overflow);
    }
  }
}

function clampAvailability(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function withinRange(recordedAt: Date, query: HistoryQuery): boolean {
  if (query.from && recordedAt < query.from) {
    return false;
  }
  if (query.to && recordedAt > query.to) {
    return false;
  }
  return true;
}

function emptyStatusDistribution(): Record<RouteHealthStatus, number> {
  return ALL_STATUSES.reduce(
    (acc, status) => {
      acc[status] = 0;
      return acc;
    },
    {} as Record<RouteHealthStatus, number>,
  );
}

function computeAvailabilityTrend(
  series: RouteHealthSnapshot[],
): 'improving' | 'declining' | 'stable' {
  if (series.length < 2) {
    return 'stable';
  }

  const mid = Math.floor(series.length / 2);
  const firstHalf = series.slice(0, mid);
  const secondHalf = series.slice(mid);

  const firstAvg = average(firstHalf.map((s) => s.availability));
  const secondAvg = average(secondHalf.map((s) => s.availability));
  const delta = secondAvg - firstAvg;

  const threshold = 0.01;
  if (delta > threshold) {
    return 'improving';
  }
  if (delta < -threshold) {
    return 'declining';
  }
  return 'stable';
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
