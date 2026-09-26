import {
  RouteRecommendation,
  CacheMetrics,
  CacheOptions,
} from './soroban-cache.types';

interface CacheEntry {
  value: RouteRecommendation;
  expiresAt: number;
}

export class SorobanRecommendationCacheService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly defaultTtlMs: number;

  private hits = 0;
  private misses = 0;

  constructor(defaultTtlMs = 60_000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Generates a deterministic cache key based on recommendation parameters
   */
  public generateKey(
    sourceChain: string,
    targetChain: string,
    assetCode: string,
    amount?: string,
  ): string {
    const keyParts = [
      sourceChain.toLowerCase(),
      targetChain.toLowerCase(),
      assetCode.toUpperCase(),
      amount ?? 'any',
    ];
    return `soroban:route:${keyParts.join(':')}`;
  }

  /**
   * Retrieves cached recommendation result or null on miss/expiration
   */
  public get(key: string): RouteRecommendation | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.value;
  }

  /**
   * Sets recommendation in cache with optional TTL
   */
  public set(
    key: string,
    value: RouteRecommendation,
    options?: CacheOptions,
  ): void {
    const ttl = options?.ttlMs ?? this.defaultTtlMs;
    const expiresAt = Date.now() + ttl;

    this.cache.set(key, { value, expiresAt });
  }

  /**
   * Invalidates a specific key or all keys matching a prefix
   */
  public invalidate(keyOrPrefix: string): void {
    if (this.cache.has(keyOrPrefix)) {
      this.cache.delete(keyOrPrefix);
      return;
    }

    // Invalidate prefix-matched entries
    for (const key of this.cache.keys()) {
      if (key.startsWith(keyOrPrefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Flushes the entire cache and resets counters if requested
   */
  public clear(): void {
    this.cache.clear();
  }

  /**
   * Returns current cache hit rate statistics
   */
  public getMetrics(): CacheMetrics {
    const totalRequests = this.hits + this.misses;
    const hitRate =
      totalRequests === 0
        ? 0
        : Number(((this.hits / totalRequests) * 100).toFixed(2));

    return {
      hits: this.hits,
      misses: this.misses,
      hitRate,
      totalRequests,
    };
  }

  /**
   * Resets metrics counters
   */
  public resetMetrics(): void {
    this.hits = 0;
    this.misses = 0;
  }
}