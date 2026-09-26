export interface SorobanRouteSnapshot {
  routeId: string;
  provider: string;
  sourceChain: string;
  destinationChain: string;
  estimatedFee: number;
  estimatedDurationMs: number;
  contractAddress?: string;
  capturedAt: Date;
}

export interface SorobanRouteSnapshotInput {
  routeId: string;
  provider: string;
  sourceChain: string;
  destinationChain: string;
  estimatedFee: number;
  estimatedDurationMs: number;
  contractAddress?: string;
  /** Defaults to current time when omitted. */
  capturedAt?: Date;
}

export interface SorobanSnapshotQuery {
  from?: Date;
  to?: Date;
  /** Return only the most recent N results within the time range. */
  limit?: number;
}

export interface SorobanRouteSnapshotStoreConfig {
  /** Maximum snapshots retained per route. Oldest are evicted first. Default: 1000. */
  maxSnapshotsPerRoute?: number;
  /** Snapshots older than this (ms) are pruned on write. 0 disables pruning. Default: 0. */
  retentionMs?: number;
}

export interface SorobanRouteSnapshotTrend {
  routeId: string;
  sampleCount: number;
  from?: Date;
  to?: Date;
  averageFee: number;
  minFee: number;
  maxFee: number;
  averageDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  feeTrend: 'rising' | 'falling' | 'stable';
  durationTrend: 'rising' | 'falling' | 'stable';
}

export class SorobanRouteSnapshotStore {
  private readonly config: Required<SorobanRouteSnapshotStoreConfig>;
  private readonly snapshots = new Map<string, SorobanRouteSnapshot[]>();

  constructor(config: SorobanRouteSnapshotStoreConfig = {}) {
    this.config = {
      maxSnapshotsPerRoute: config.maxSnapshotsPerRoute ?? 1000,
      retentionMs: config.retentionMs ?? 0,
    };
  }

  /** Records a route snapshot, evicting stale entries according to store config. */
  capture(input: SorobanRouteSnapshotInput): SorobanRouteSnapshot {
    const snapshot: SorobanRouteSnapshot = {
      routeId: input.routeId,
      provider: input.provider,
      sourceChain: input.sourceChain,
      destinationChain: input.destinationChain,
      estimatedFee: input.estimatedFee,
      estimatedDurationMs: input.estimatedDurationMs,
      contractAddress: input.contractAddress,
      capturedAt: input.capturedAt ?? new Date(),
    };

    const series = this.snapshots.get(input.routeId) ?? [];
    series.push(snapshot);
    series.sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
    this.prune(series);
    this.snapshots.set(input.routeId, series);

    return snapshot;
  }

  /** Returns stored snapshots for a route, optionally filtered by query. */
  getHistory(routeId: string, query: SorobanSnapshotQuery = {}): SorobanRouteSnapshot[] {
    const series = this.snapshots.get(routeId) ?? [];
    let result = series.filter((s) => withinRange(s.capturedAt, query));
    if (query.limit !== undefined && query.limit >= 0) {
      result = result.slice(-query.limit);
    }
    return result.map((s) => ({ ...s }));
  }

  /** Returns the most recent snapshot for a route, or null if none exists. */
  getLatest(routeId: string): SorobanRouteSnapshot | null {
    const series = this.snapshots.get(routeId);
    if (!series || series.length === 0) return null;
    return { ...series[series.length - 1] };
  }

  /** Lists all route IDs that have at least one recorded snapshot. */
  getTrackedRoutes(): string[] {
    return Array.from(this.snapshots.keys());
  }

  /**
   * Computes aggregated fee and duration trends for a route over a query window.
   * Returns null when no snapshots are found in range.
   */
  getTrend(routeId: string, query: SorobanSnapshotQuery = {}): SorobanRouteSnapshotTrend | null {
    const series = this.getHistory(routeId, query);
    if (series.length === 0) return null;

    let feeSum = 0;
    let minFee = Number.POSITIVE_INFINITY;
    let maxFee = Number.NEGATIVE_INFINITY;
    let durationSum = 0;
    let minDurationMs = Number.POSITIVE_INFINITY;
    let maxDurationMs = Number.NEGATIVE_INFINITY;

    for (const s of series) {
      feeSum += s.estimatedFee;
      minFee = Math.min(minFee, s.estimatedFee);
      maxFee = Math.max(maxFee, s.estimatedFee);
      durationSum += s.estimatedDurationMs;
      minDurationMs = Math.min(minDurationMs, s.estimatedDurationMs);
      maxDurationMs = Math.max(maxDurationMs, s.estimatedDurationMs);
    }

    return {
      routeId,
      sampleCount: series.length,
      from: series[0].capturedAt,
      to: series[series.length - 1].capturedAt,
      averageFee: feeSum / series.length,
      minFee,
      maxFee,
      averageDurationMs: durationSum / series.length,
      minDurationMs,
      maxDurationMs,
      feeTrend: computeTrend(series.map((s) => s.estimatedFee)),
      durationTrend: computeTrend(series.map((s) => s.estimatedDurationMs)),
    };
  }

  /** Removes all snapshots for a single route. Returns true if any were removed. */
  clearRoute(routeId: string): boolean {
    return this.snapshots.delete(routeId);
  }

  /** Removes all snapshots across every route. */
  clear(): void {
    this.snapshots.clear();
  }

  private prune(series: SorobanRouteSnapshot[]): void {
    if (this.config.retentionMs > 0) {
      const cutoff = Date.now() - this.config.retentionMs;
      let stale = 0;
      while (stale < series.length && series[stale].capturedAt.getTime() < cutoff) {
        stale += 1;
      }
      if (stale > 0) series.splice(0, stale);
    }

    const overflow = series.length - this.config.maxSnapshotsPerRoute;
    if (overflow > 0) series.splice(0, overflow);
  }
}

function withinRange(capturedAt: Date, query: SorobanSnapshotQuery): boolean {
  if (query.from && capturedAt < query.from) return false;
  if (query.to && capturedAt > query.to) return false;
  return true;
}

function computeTrend(values: number[]): 'rising' | 'falling' | 'stable' {
  if (values.length < 2) return 'stable';

  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);

  const firstAvg = avg(firstHalf);
  const secondAvg = avg(secondHalf);
  const delta = secondAvg - firstAvg;
  const threshold = firstAvg * 0.01;

  if (delta > threshold) return 'rising';
  if (delta < -threshold) return 'falling';
  return 'stable';
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
