/**
 * File: src/cache/routes/stellar/routeCache.ts
 *
 * Caches Stellar bridge route computations for faster queries.
 * Supports TTL-based expiry and manual cache invalidation.
 */

export interface RouteQuery {
  fromAsset: string;
  toAsset: string;
  fromNetwork: string;
  toNetwork: string;
  amount?: string;
}

export interface RouteResponse {
  path: string[];
  estimatedFee: number;
  estimatedTimeMs: number;
  bridgeId: string;
  metadata?: Record<string, unknown>;
}

export interface CacheEntry<T> {
  data: T;
  cachedAt: number; // Unix timestamp (ms)
  ttlMs: number;
}

export interface RouteCacheOptions {
  /** Default TTL for entries in milliseconds. Default: 30000 (30s) */
  defaultTtlMs?: number;
  /** Maximum number of entries. Default: 500 */
  maxEntries?: number;
}

function buildCacheKey(query: RouteQuery): string {
  return [
    query.fromAsset,
    query.toAsset,
    query.fromNetwork,
    query.toNetwork,
    query.amount ?? 'any',
  ]
    .join(':')
    .toLowerCase();
}

/**
 * RouteCacheStore
 *
 * In-memory LRU-style cache for Stellar bridge route computations.
 * Automatically evicts expired entries on read and enforces max capacity.
 */
export class RouteCacheStore {
  private cache: Map<string, CacheEntry<RouteResponse>> = new Map();
  private defaultTtlMs: number;
  private maxEntries: number;

  constructor(options: RouteCacheOptions = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? 30_000;
    this.maxEntries = options.maxEntries ?? 500;
  }

  /**
   * Store a route response in the cache.
   */
  set(query: RouteQuery, response: RouteResponse, ttlMs?: number): void {
    const key = buildCacheKey(query);

    // Evict oldest entry if at capacity
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data: response,
      cachedAt: Date.now(),
      ttlMs: ttlMs ?? this.defaultTtlMs,
    });
  }

  /**
   * Retrieve a cached route response.
   * Returns null if not found or expired.
   */
  get(query: RouteQuery): RouteResponse | null {
    const key = buildCacheKey(query);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }

    // Move to end to simulate LRU
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data;
  }

  /**
   * Check if a cache entry exists and is still valid.
   */
  has(query: RouteQuery): boolean {
    return this.get(query) !== null;
  }

  /**
   * Invalidate a specific route cache entry.
   */
  invalidate(query: RouteQuery): boolean {
    const key = buildCacheKey(query);
    return this.cache.delete(key);
  }

  /**
   * Invalidate all cache entries matching a bridge id.
   */
  invalidateByBridge(bridgeId: string): number {
    let count = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.data.bridgeId === bridgeId) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Purge all expired entries from the cache.
   */
  purgeExpired(): number {
    let count = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
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

  /**
   * Current number of entries (including possibly expired).
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Returns cache statistics.
   */
  stats(): { total: number; expired: number; valid: number } {
    let expired = 0;
    for (const entry of this.cache.values()) {
      if (this.isExpired(entry)) expired++;
    }
    return {
      total: this.cache.size,
      expired,
      valid: this.cache.size - expired,
    };
  }

  private isExpired(entry: CacheEntry<unknown>): boolean {
    return Date.now() - entry.cachedAt > entry.ttlMs;
  }
}

// Default shared instance
export const routeCache = new RouteCacheStore();

export default routeCache;
