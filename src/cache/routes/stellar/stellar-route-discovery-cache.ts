/**
 * Stellar Route Discovery Cache
 *
 * Caches discovered Stellar bridge routes to reduce repeated route discovery
 * latency. Supports configurable expiration policies, stale entry refresh,
 * and background cleanup.
 *
 * Features:
 * - TTL-based cache expiration with configurable policies
 * - Stale entry detection and refresh callbacks
 * - LRU eviction when cache reaches capacity
 * - Background cleanup of expired entries
 * - Multiple invalidation strategies (by route, provider, network)
 * - Cache statistics and monitoring
 *
 * Usage:
 *   const cache = new StellarRouteDiscoveryCache({
 *     defaultTtlMs: 60_000,
 *     staleThresholdMs: 45_000,
 *     maxEntries: 1000,
 *     onStale: async (key, entry) => refreshRoute(key)
 *   });
 *
 *   // Cache a discovered route
 *   cache.set('stellar-ethereum-usdc', routeData);
 *
 *   // Retrieve with automatic stale handling
 *   const route = await cache.get('stellar-ethereum-usdc');
 */

import type { BridgeRoute } from '../../../matrix/assets/routes/stellar/types';

/** Cache entry with metadata for expiration and staleness tracking */
export interface RouteDiscoveryCacheEntry {
  /** Unique cache key for the route */
  key: string;
  /** The cached route data */
  route: BridgeRoute | BridgeRoute[];
  /** Timestamp when entry was cached (ms since epoch) */
  cachedAt: number;
  /** Time-to-live in milliseconds */
  ttlMs: number;
  /** Timestamp when entry becomes stale (before expiry) */
  staleAt: number;
  /** Number of times this entry has been accessed */
  accessCount: number;
  /** Last access timestamp */
  lastAccessedAt: number;
  /** Optional metadata about the discovery source */
  metadata?: {
    /** Source of the route discovery (e.g., 'provider-api', 'on-chain') */
    discoverySource?: string;
    /** Version of the route data */
    version?: string;
    /** Additional provider-specific metadata */
    [key: string]: string | undefined;
  };
}

/** Configuration for the route discovery cache */
export interface RouteDiscoveryCacheConfig {
  /** Default TTL for cache entries in milliseconds. Default: 60000 (1 min) */
  defaultTtlMs?: number;
  /** Threshold before TTL when entry is considered stale. Default: 75% of TTL */
  staleThresholdPercent?: number;
  /** Maximum number of entries in cache. Default: 1000 */
  maxEntries?: number;
  /** Background cleanup interval in milliseconds. Default: 120000 (2 min) */
  cleanupIntervalMs?: number;
  /** Callback invoked when a stale entry is accessed */
  onStale?: (key: string, entry: RouteDiscoveryCacheEntry) => Promise<void>;
  /** Enable background cleanup timer. Default: true */
  enableCleanup?: boolean;
  /** Injected clock for deterministic testing */
  now?: () => number;
}

/** Statistics about cache state */
export interface RouteDiscoveryCacheStats {
  /** Total number of entries in cache */
  totalEntries: number;
  /** Number of valid (non-expired) entries */
  validEntries: number;
  /** Number of expired entries */
  expiredEntries: number;
  /** Number of stale (not expired but past stale threshold) entries */
  staleEntries: number;
  /** Cache hit count */
  hits: number;
  /** Cache miss count */
  misses: number;
  /** Hit rate (hits / (hits + misses)) */
  hitRate: number;
  /** Size of largest entry in bytes (approximate) */
  estimatedMemoryBytes: number;
}

/** Query parameters for route cache lookup */
export interface RouteDiscoveryQuery {
  /** Source chain identifier */
  fromChain: string;
  /** Destination chain identifier */
  toChain: string;
  /** Asset code being transferred */
  asset?: string;
  /** Bridge provider identifier */
  provider?: string;
  /** Bridge protocol name */
  protocol?: string;
}

const DEFAULT_CONFIG: Required<Omit<RouteDiscoveryCacheConfig, 'onStale'>> = {
  defaultTtlMs: 60_000,
  staleThresholdPercent: 0.75,
  maxEntries: 1000,
  cleanupIntervalMs: 120_000,
  enableCleanup: true,
  now: () => Date.now(),
};

/**
 * Build a deterministic cache key from route discovery query parameters.
 * Exported for testing.
 */
export function buildRouteDiscoveryKey(query: RouteDiscoveryQuery): string {
  const parts = [
    query.fromChain.toLowerCase(),
    query.toChain.toLowerCase(),
    query.asset?.toLowerCase() ?? '*',
    query.provider?.toLowerCase() ?? '*',
    query.protocol?.toLowerCase() ?? '*',
  ];
  return parts.join(':');
}

/**
 * Build a cache key from a route identifier or custom string.
 */
export function buildRouteKey(routeId: string): string {
  return `route:${routeId}`;
}

/**
 * StellarRouteDiscoveryCache
 *
 * High-performance in-memory cache for discovered Stellar bridge routes.
 * Implements LRU eviction, TTL-based expiration, stale entry detection,
 * and background cleanup to minimize route discovery latency.
 */
export class StellarRouteDiscoveryCache {
  private cache: Map<string, RouteDiscoveryCacheEntry> = new Map();
  private config: Required<RouteDiscoveryCacheConfig>;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // Cache access tracking
  private hits = 0;
  private misses = 0;

  constructor(config: RouteDiscoveryCacheConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      onStale: config.onStale,
    };

    if (this.config.enableCleanup) {
      this.startCleanup();
    }
  }

  // ─── Core Cache Operations ────────────────────────────────────────────────

  /**
   * Store a discovered route in the cache.
   *
   * @param key Cache key (use buildRouteDiscoveryKey or buildRouteKey)
   * @param route Route data to cache (single route or array)
   * @param options Optional TTL and metadata overrides
   */
  set(
    key: string,
    route: BridgeRoute | BridgeRoute[],
    options?: {
      ttlMs?: number;
      metadata?: RouteDiscoveryCacheEntry['metadata'];
    },
  ): void {
    const now = this.config.now();
    const ttlMs = options?.ttlMs ?? this.config.defaultTtlMs;
    const staleAt = now + Math.floor(ttlMs * this.config.staleThresholdPercent);

    // Evict oldest entry if at capacity and key doesn't exist
    if (!this.cache.has(key) && this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    const entry: RouteDiscoveryCacheEntry = {
      key,
      route,
      cachedAt: now,
      ttlMs,
      staleAt,
      accessCount: 0,
      lastAccessedAt: now,
      metadata: options?.metadata,
    };

    this.cache.set(key, entry);
  }

  /**
   * Retrieve a cached route with automatic expiration and stale detection.
   *
   * Returns null if:
   * - Entry doesn't exist
   * - Entry has expired
   *
   * If entry is stale (past stale threshold but not expired), triggers
   * onStale callback if configured, but still returns the data.
   *
   * @param key Cache key
   * @returns Cached route data or null
   */
  async get(key: string): Promise<BridgeRoute | BridgeRoute[] | null> {
    const now = this.config.now();
    const entry = this.cache.get(key);

    // Cache miss
    if (!entry) {
      this.misses++;
      return null;
    }

    // Check expiration
    if (this.isExpired(entry, now)) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Cache hit - update access tracking
    this.hits++;
    entry.accessCount++;
    entry.lastAccessedAt = now;

    // Move to end for LRU tracking
    this.cache.delete(key);
    this.cache.set(key, entry);

    // Check if stale and trigger callback
    if (this.isStale(entry, now) && this.config.onStale) {
      try {
        await this.config.onStale(key, entry);
      } catch (error) {
        // Don't let stale callback failures affect cache retrieval
        console.error('RouteDiscoveryCache: onStale callback failed:', error);
      }
    }

    return entry.route;
  }

  /**
   * Synchronous get without stale callback trigger.
   * Use when you don't need async stale handling.
   */
  getSync(key: string): BridgeRoute | BridgeRoute[] | null {
    const now = this.config.now();
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    if (this.isExpired(entry, now)) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    entry.accessCount++;
    entry.lastAccessedAt = now;

    // LRU update
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.route;
  }

  /**
   * Check if a cache entry exists and is valid (non-expired).
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    return !this.isExpired(entry, this.config.now());
  }

  /**
   * Peek at a cached entry without updating access tracking or triggering stale callbacks.
   */
  peek(key: string): RouteDiscoveryCacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (this.isExpired(entry, this.config.now())) return null;
    return entry;
  }

  // ─── Invalidation Strategies ──────────────────────────────────────────────

  /**
   * Invalidate a specific cache entry.
   */
  invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Invalidate all entries matching a predicate.
   */
  invalidateBy(
    predicate: (entry: RouteDiscoveryCacheEntry) => boolean,
  ): number {
    let count = 0;
    for (const [key, entry] of this.cache) {
      if (predicate(entry)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Invalidate all routes from a specific provider.
   */
  invalidateByProvider(provider: string): number {
    const providerLower = provider.toLowerCase();
    return this.invalidateBy(
      (entry) =>
        entry.metadata?.provider?.toLowerCase() === providerLower ||
        this.routeContainsProvider(entry.route, providerLower),
    );
  }

  /**
   * Invalidate all routes for a specific chain pair.
   */
  invalidateByChainPair(fromChain: string, toChain: string): number {
    const fromLower = fromChain.toLowerCase();
    const toLower = toChain.toLowerCase();
    return this.invalidateBy(
      (entry) =>
        entry.key.includes(`${fromLower}:${toLower}`) ||
        this.routeContainsChainPair(entry.route, fromLower, toLower),
    );
  }

  /**
   * Invalidate all routes for a specific asset.
   */
  invalidateByAsset(asset: string): number {
    const assetLower = asset.toLowerCase();
    return this.invalidateBy(
      (entry) =>
        entry.key.includes(`:${assetLower}:`) ||
        this.routeContainsAsset(entry.route, assetLower),
    );
  }

  /**
   * Invalidate all expired entries.
   */
  purgeExpired(): number {
    const now = this.config.now();
    let count = 0;
    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry, now)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Invalidate all stale entries (past stale threshold but not expired).
   */
  purgeStale(): number {
    const now = this.config.now();
    let count = 0;
    for (const [key, entry] of this.cache) {
      if (!this.isExpired(entry, now) && this.isStale(entry, now)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.cache.clear();
  }

  // ─── Cache Statistics ─────────────────────────────────────────────────────

  /**
   * Get comprehensive cache statistics.
   */
  stats(): RouteDiscoveryCacheStats {
    const now = this.config.now();
    let expired = 0;
    let stale = 0;

    for (const entry of this.cache.values()) {
      if (this.isExpired(entry, now)) {
        expired++;
      } else if (this.isStale(entry, now)) {
        stale++;
      }
    }

    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? this.hits / totalRequests : 0;

    return {
      totalEntries: this.cache.size,
      validEntries: this.cache.size - expired,
      expiredEntries: expired,
      staleEntries: stale,
      hits: this.hits,
      misses: this.misses,
      hitRate,
      estimatedMemoryBytes: this.estimateMemoryUsage(),
    };
  }

  /** Reset cache hit/miss counters */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }

  /** Current number of cache entries */
  get size(): number {
    return this.cache.size;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Stop background cleanup and release resources.
   * Call this when shutting down the application.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // ─── Internal Methods ─────────────────────────────────────────────────────

  private isExpired(entry: RouteDiscoveryCacheEntry, now: number): boolean {
    return now - entry.cachedAt > entry.ttlMs;
  }

  private isStale(entry: RouteDiscoveryCacheEntry, now: number): boolean {
    return now > entry.staleAt && !this.isExpired(entry, now);
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestAccessTime = Infinity;

    for (const [key, entry] of this.cache) {
      // Use lastAccessedAt for LRU, fallback to cachedAt
      const accessTime = entry.lastAccessedAt || entry.cachedAt;
      if (accessTime < oldestAccessTime) {
        oldestAccessTime = accessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.purgeExpired();
    }, this.config.cleanupIntervalMs);

    // Don't hold the event loop open for cleanup timer
    if (
      typeof (this.cleanupTimer as { unref?: () => void }).unref === 'function'
    ) {
      (this.cleanupTimer as { unref: () => void }).unref();
    }
  }

  private estimateMemoryUsage(): number {
    let totalBytes = 0;
    for (const entry of this.cache.values()) {
      // Rough estimation: key length + route JSON size + metadata
      const keySize = entry.key.length * 2; // UTF-16
      const routeSize = JSON.stringify(entry.route).length * 2;
      const metadataSize = entry.metadata
        ? JSON.stringify(entry.metadata).length * 2
        : 0;
      totalBytes += keySize + routeSize + metadataSize + 256; // overhead
    }
    return totalBytes;
  }

  private routeContainsProvider(
    route: BridgeRoute | BridgeRoute[],
    provider: string,
  ): boolean {
    const routes = Array.isArray(route) ? route : [route];
    return routes.some((r) => r.provider?.toLowerCase() === provider);
  }

  private routeContainsChainPair(
    route: BridgeRoute | BridgeRoute[],
    fromChain: string,
    toChain: string,
  ): boolean {
    const routes = Array.isArray(route) ? route : [route];
    return routes.some(
      (r) =>
        r.fromChain?.toLowerCase() === fromChain &&
        r.toChain?.toLowerCase() === toChain,
    );
  }

  private routeContainsAsset(
    route: BridgeRoute | BridgeRoute[],
    asset: string,
  ): boolean {
    const routes = Array.isArray(route) ? route : [route];
    return routes.some((r) =>
      r.supportedAssets?.some((a) => a.toLowerCase() === asset),
    );
  }
}

/** Default shared cache instance with sensible defaults */
export const routeDiscoveryCache = new StellarRouteDiscoveryCache();

export default routeDiscoveryCache;
