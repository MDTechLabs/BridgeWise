/**
 * Stellar Bridge Liquidity Monitor.
 *
 * Monitors available liquidity across Stellar bridge providers by fetching
 * liquidity metrics from each registered provider, caching results, and
 * emitting events when liquidity drops below configurable thresholds.
 *
 * @see Issue #297 — Implement Stellar Bridge Liquidity Monitor
 */

import { EventEmitter } from 'events';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StellarLiquiditySnapshot {
  /** Provider/bridge identifier. */
  provider: string;
  /** Asset symbol (e.g. USDC, XLM). */
  asset: string;
  /** Available liquidity amount as a string to preserve precision. */
  availableAmount: string;
  /** Total liquidity cap if applicable, or the same as availableAmount. */
  totalAmount: string;
  /** Timestamp of the snapshot. */
  timestamp: number;
  /** Source chain identifier. */
  sourceChain: string;
  /** Destination chain identifier. */
  destinationChain: string;
  /** Optional human-readable status. */
  status?: 'active' | 'low' | 'depleted' | 'unknown';
}

export interface StellarLiquidityQuery {
  asset: string;
  sourceChain?: string;
  destinationChain?: string;
  provider?: string;
}

export interface LiquidityThreshold {
  /** Asset symbol this threshold applies to. */
  asset: string;
  /** Minimum amount before emitting a 'low_liquidity' alert. */
  lowThreshold: string;
  /** Minimum amount before emitting a 'depleted' alert. */
  criticalThreshold: string;
}

export interface StellarLiquidityProviderConfig {
  /** Provider name. */
  name: string;
  /** Function that fetches the current liquidity snapshot from this provider. */
  fetchFn: (asset: string) => Promise<StellarLiquiditySnapshot>;
  /** Cache TTL for this provider's data in milliseconds (default: 60000). */
  cacheTtlMs?: number;
  /** Maximum accepted age of the provider-reported snapshot timestamp. */
  maxSnapshotAgeMs?: number;
}

export interface StellarBridgeLiquidityMonitorConfig {
  /** Registered liquidity providers. */
  providers?: StellarLiquidityProviderConfig[];
  /** Refresh interval for periodic polling in milliseconds (default: 30000). */
  refreshIntervalMs?: number;
  /** Default thresholds for low/critical liquidity alerts. */
  thresholds?: LiquidityThreshold[];
  /** Maximum age of cached data before forced refresh in ms (default: 60000). */
  cacheTtlMs?: number;
  /** Maximum age of provider-reported liquidity data in ms (default: 60000). */
  maxSnapshotAgeMs?: number;
}

export interface LiquidityAlertEvent {
  provider: string;
  asset: string;
  availableAmount: string;
  threshold: string;
  level: 'low' | 'critical' | 'recovered';
  snapshot: StellarLiquiditySnapshot;
  timestamp: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<StellarBridgeLiquidityMonitorConfig> = {
  providers: [],
  refreshIntervalMs: 30_000,
  cacheTtlMs: 60_000,
  maxSnapshotAgeMs: 60_000,
  thresholds: [
    { asset: 'USDC', lowThreshold: '50000', criticalThreshold: '10000' },
    { asset: 'USDT', lowThreshold: '50000', criticalThreshold: '10000' },
    { asset: 'XLM', lowThreshold: '100000', criticalThreshold: '25000' },
    { asset: 'ETH', lowThreshold: '50', criticalThreshold: '10' },
  ],
};

// ─── Monitor ──────────────────────────────────────────────────────────────────

export class StellarBridgeLiquidityMonitor extends EventEmitter {
  private readonly config: Required<StellarBridgeLiquidityMonitorConfig>;
  private readonly cache = new Map<string, StellarLiquiditySnapshot>();
  private readonly cacheTimestamps = new Map<string, number>();
  private readonly providerMap = new Map<string, StellarLiquidityProviderConfig>();
  private readonly previousAlerts = new Map<string, boolean>(); // key -> wasLow
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: StellarBridgeLiquidityMonitorConfig = {}) {
    super();
    this.config = {
      providers: config.providers ? [...config.providers] : [],
      refreshIntervalMs:
        config.refreshIntervalMs ?? DEFAULT_CONFIG.refreshIntervalMs,
      cacheTtlMs: config.cacheTtlMs ?? DEFAULT_CONFIG.cacheTtlMs,
      maxSnapshotAgeMs:
        config.maxSnapshotAgeMs ?? DEFAULT_CONFIG.maxSnapshotAgeMs,
      thresholds: config.thresholds
        ? [...config.thresholds]
        : [...DEFAULT_CONFIG.thresholds],
    };

    for (const provider of this.config.providers) {
      this.providerMap.set(provider.name, provider);
    }
  }

  // ─── Provider Registration ─────────────────────────────────────────────────

  /**
   * Register a liquidity provider for monitoring.
   * Duplicate provider names will be overwritten.
   */
  registerProvider(provider: StellarLiquidityProviderConfig): void {
    this.providerMap.set(provider.name, provider);
    this.config.providers.push(provider);
  }

  /**
   * Remove a previously registered provider.
   */
  unregisterProvider(name: string): boolean {
    const idx = this.config.providers.findIndex((p) => p.name === name);
    if (idx === -1) return false;
    this.config.providers.splice(idx, 1);
    this.providerMap.delete(name);

    // Clear cached data for this provider
    const keysToDelete: string[] = [];
    for (const [key, snapshot] of this.cache) {
      if (snapshot.provider === name) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.cache.delete(key);
      this.cacheTimestamps.delete(key);
    }

    return true;
  }

  /** Get list of registered provider names. */
  getRegisteredProviders(): string[] {
    return Array.from(this.providerMap.keys());
  }

  // ─── Liquidity Fetching ─────────────────────────────────────────────────────

  /**
   * Fetch liquidity for a specific asset from all registered providers.
   * Uses cached data when available and still fresh.
   */
  async getLiquidity(
    query: StellarLiquidityQuery,
  ): Promise<StellarLiquiditySnapshot[]> {
    const providers = query.provider
      ? [query.provider]
      : Array.from(this.providerMap.keys());

    const results: StellarLiquiditySnapshot[] = [];
    const errors: string[] = [];

    for (const providerName of providers) {
      const providerConfig = this.providerMap.get(providerName);
      if (!providerConfig) {
        errors.push(`Unknown provider: ${providerName}`);
        continue;
      }

      const cacheKey = this.buildCacheKey(providerName, query.asset);
      const cached = this.cache.get(cacheKey);
      const cachedAt = this.cacheTimestamps.get(cacheKey) ?? 0;

      const effectiveTtl = providerConfig.cacheTtlMs ?? this.config.cacheTtlMs;
      const maxSnapshotAge =
        providerConfig.maxSnapshotAgeMs ?? this.config.maxSnapshotAgeMs;
      // Return cached data if still fresh
      const now = Date.now();
      if (
        cached &&
        now - cachedAt < effectiveTtl &&
        this.isFreshSnapshot(cached, now, maxSnapshotAge)
      ) {
        results.push(cached);
        continue;
      }

      try {
        const snapshot = await providerConfig.fetchFn(query.asset);
        const fetchedAt = Date.now();
        if (!this.isFreshSnapshot(snapshot, fetchedAt, maxSnapshotAge)) {
          throw new Error(`Provider ${providerName} returned stale liquidity data`);
        }
        const enriched: StellarLiquiditySnapshot = {
          ...snapshot,
          sourceChain: query.sourceChain ?? snapshot.sourceChain,
          destinationChain: query.destinationChain ?? snapshot.destinationChain,
        };

        this.cache.set(cacheKey, enriched);
        this.cacheTimestamps.set(cacheKey, fetchedAt);
        this.evaluateThresholds(enriched);
        results.push(enriched);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Provider ${providerName} failed: ${message}`);

      }
    }

    return results;
  }

  /**
   * Get liquidity for all tracked assets from all providers.
   */
  async getAllLiquidity(): Promise<StellarLiquiditySnapshot[]> {
    const allAssets = new Set<string>();
    for (const snapshot of this.cache.values()) {
      allAssets.add(snapshot.asset);
    }

    // Add assets from thresholds that might not be cached yet
    for (const t of this.config.thresholds) {
      allAssets.add(t.asset);
    }

    const results: StellarLiquiditySnapshot[] = [];
    for (const asset of allAssets) {
      const snapshots = await this.getLiquidity({ asset });
      results.push(...snapshots);
    }

    return results;
  }

  // ─── Cache Management ───────────────────────────────────────────────────────

  /**
   * Invalidate the cache for a specific provider and asset, forcing a refresh
   * on the next query.
   */
  invalidateCache(provider: string, asset: string): void {
    const key = this.buildCacheKey(provider, asset);
    this.cache.delete(key);
    this.cacheTimestamps.delete(key);
  }

  /** Clear the entire cache. */
  clearCache(): void {
    this.cache.clear();
    this.cacheTimestamps.clear();
  }

  // ─── Threshold Evaluation ───────────────────────────────────────────────────

  /**
   * Evaluate the current snapshot against configured thresholds and emit
   * alerts if conditions are met.
   */
  private evaluateThresholds(snapshot: StellarLiquiditySnapshot): void {
    const threshold = this.config.thresholds.find(
      (t) => t.asset === snapshot.asset,
    );
    if (!threshold) return;

    const available = BigInt(snapshot.availableAmount);
    const lowThreshold = BigInt(threshold.lowThreshold);
    const criticalThreshold = BigInt(threshold.criticalThreshold);

    const alertKey = `${snapshot.provider}:${snapshot.asset}`;
    const wasLow = this.previousAlerts.get(alertKey) ?? false;

    if (available <= criticalThreshold) {
      // Critical — depleted, only alert if transitioning into this state
      snapshot.status = 'depleted';
      if (!wasLow) {
        this.emitAlert('critical', snapshot, threshold.criticalThreshold);
      }
      this.previousAlerts.set(alertKey, true);
    } else if (available <= lowThreshold) {
      // Low liquidity — only alert if transitioning into this state
      snapshot.status = 'low';
      if (!wasLow) {
        this.emitAlert('low', snapshot, threshold.lowThreshold);
      }
      this.previousAlerts.set(alertKey, true);
    } else {
      // Healthy — mark recovered if previously low
      snapshot.status = 'active';
      if (wasLow) {
        this.emitAlert('recovered', snapshot, threshold.lowThreshold);
      }
      this.previousAlerts.set(alertKey, false);
    }
  }

  private emitAlert(
    level: 'low' | 'critical' | 'recovered',
    snapshot: StellarLiquiditySnapshot,
    threshold: string,
  ): void {
    const event: LiquidityAlertEvent = {
      provider: snapshot.provider,
      asset: snapshot.asset,
      availableAmount: snapshot.availableAmount,
      threshold,
      level,
      snapshot,
      timestamp: Date.now(),
    };

    this.emit(level === 'critical' ? 'depleted' : level, event);
    this.emit('alert', event);
  }

  // ─── Threshold Management ───────────────────────────────────────────────────

  /** Get all configured thresholds. */
  getThresholds(): LiquidityThreshold[] {
    return [...this.config.thresholds];
  }

  /** Set or update a threshold for a given asset. */
  setThreshold(threshold: LiquidityThreshold): void {
    const idx = this.config.thresholds.findIndex(
      (t) => t.asset === threshold.asset,
    );
    if (idx !== -1) {
      this.config.thresholds[idx] = threshold;
    } else {
      this.config.thresholds.push(threshold);
    }
  }

  /** Remove threshold for a given asset. */
  removeThreshold(asset: string): boolean {
    const idx = this.config.thresholds.findIndex((t) => t.asset === asset);
    if (idx === -1) return false;
    this.config.thresholds.splice(idx, 1);
    return true;
  }

  // ─── Query Helpers ─────────────────────────────────────────────────────────

  /**
   * Get all providers with liquidity below the low threshold for a given asset.
   */
  getLowLiquidityProviders(asset: string): StellarLiquiditySnapshot[] {
    const results: StellarLiquiditySnapshot[] = [];
    for (const snapshot of this.cache.values()) {
      if (snapshot.asset !== asset) continue;
      if (snapshot.status === 'low' || snapshot.status === 'depleted') {
        results.push(snapshot);
      }
    }
    return results;
  }

  /** Get a summary of liquidity status across all tracked assets. */
  getStatusSummary(): Record<string, { providers: number; low: number; depleted: number }> {
    const summary = new Map<
      string,
      { providers: number; low: number; depleted: number }
    >();

    for (const snapshot of this.cache.values()) {
      const asset = snapshot.asset;
      if (!summary.has(asset)) {
        summary.set(asset, { providers: 0, low: 0, depleted: 0 });
      }
      const entry = summary.get(asset)!;
      entry.providers++;
      if (snapshot.status === 'low') entry.low++;
      if (snapshot.status === 'depleted') entry.depleted++;
    }

    const result: Record<string, { providers: number; low: number; depleted: number }> = {};
    for (const [asset, entry] of summary) {
      result[asset] = entry;
    }
    return result;
  }

  // ─── Polling ────────────────────────────────────────────────────────────────

  /**
   * Start periodic refresh of all liquidity data.
   * Idempotent — calling twice has no effect.
   */
  startMonitoring(): void {
    if (this.refreshTimer) return;

    void this.refreshAll();

    this.refreshTimer = setInterval(() => {
      void this.refreshAll();
    }, this.config.refreshIntervalMs);
  }

  /** Stop periodic refresh. Idempotent. */
  stopMonitoring(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  get isMonitoring(): boolean {
    return this.refreshTimer !== null;
  }

  /**
   * Force refresh all cached liquidity data from all providers.
   */
  async refreshAll(): Promise<void> {
    const allAssets = new Set<string>();
    for (const snapshot of this.cache.values()) {
      allAssets.add(snapshot.asset);
    }
    // Also refresh assets with configured thresholds
    for (const t of this.config.thresholds) {
      allAssets.add(t.asset);
    }

    if (allAssets.size === 0) return;

    const promises: Array<Promise<void>> = [];
    for (const asset of allAssets) {
      // Invalidate cache for this asset to force refresh
      for (const providerName of this.providerMap.keys()) {
        this.invalidateCache(providerName, asset);
      }
      promises.push(
        this.getLiquidity({ asset }).then(() => {}), // discard return value
      );
    }

    await Promise.allSettled(promises);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private buildCacheKey(provider: string, asset: string): string {
    return `${provider}:${asset}`;
  }

  private isFreshSnapshot(
    snapshot: StellarLiquiditySnapshot,
    now: number,
    maxAgeMs: number,
  ): boolean {
    const ageMs = now - snapshot.timestamp;
    return Number.isFinite(snapshot.timestamp) && ageMs >= 0 && ageMs <= maxAgeMs;
  }
}
