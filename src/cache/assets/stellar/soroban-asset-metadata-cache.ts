/**
 * Soroban Asset Metadata Cache
 *
 * Caches asset metadata (decimals, name, symbol, issuer, etc.) from Soroban
 * contracts to avoid repeated RPC calls. Uses a Map-backed TTL cache with
 * LRU eviction and background cleanup.
 */

export interface SorobanAssetMetadata {
  contractId: string;
  name: string;
  symbol: string;
  decimals: number;
  issuer?: string;
  isNative: boolean;
  /** Unix timestamp when this metadata was fetched */
  fetchedAt: number;
}

export interface SorobanAssetMetadataCacheConfig {
  /** Maximum number of entries in the cache */
  maxEntries?: number;
  /** Time-to-live in milliseconds */
  ttlMs?: number;
  /** Background cleanup interval in milliseconds */
  cleanupIntervalMs?: number;
}

const DEFAULT_CONFIG: Required<SorobanAssetMetadataCacheConfig> = {
  maxEntries: 10_000,
  ttlMs: 24 * 60 * 60 * 1000, // 24 hours - asset metadata rarely changes
  cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
};

export class SorobanAssetMetadataCache {
  private cache: Map<string, SorobanAssetMetadata> = new Map();
  private accessOrder: string[] = [];
  private readonly config: Required<SorobanAssetMetadataCacheConfig>;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(config: SorobanAssetMetadataCacheConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanup();
  }

  /**
   * Get cached asset metadata by contract ID.
   * Returns null if not found or expired.
   */
  get(contractId: string): SorobanAssetMetadata | null {
    const entry = this.cache.get(contractId);
    if (!entry) return null;

    if (this.isExpired(entry)) {
      this.cache.delete(contractId);
      this.removeFromAccessOrder(contractId);
      return null;
    }

    // Update access order (LRU)
    this.updateAccessOrder(contractId);
    return entry;
  }

  /**
   * Check if fresh (non-expired) metadata exists for the contract ID.
   */
  has(contractId: string): boolean {
    const entry = this.cache.get(contractId);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.cache.delete(contractId);
      this.removeFromAccessOrder(contractId);
      return false;
    }
    return true;
  }

  /**
   * Store asset metadata in the cache.
   * Evicts oldest entry if cache is full.
   */
  set(metadata: SorobanAssetMetadata): void {
    if (!this.cache.has(metadata.contractId) && this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }
    this.cache.set(metadata.contractId, metadata);
    this.updateAccessOrder(metadata.contractId);
  }

  /**
   * Invalidate a specific contract ID.
   */
  invalidate(contractId: string): boolean {
    this.removeFromAccessOrder(contractId);
    return this.cache.delete(contractId);
  }

  /**
   * Invalidate all entries for a specific issuer.
   */
  invalidateByIssuer(issuer: string): number {
    let removed = 0;
    for (const [contractId, metadata] of this.cache) {
      if (metadata.issuer === issuer) {
        this.cache.delete(contractId);
        this.removeFromAccessOrder(contractId);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Invalidate all entries matching a predicate.
   */
  invalidateBy(predicate: (metadata: SorobanAssetMetadata) => boolean): number {
    let removed = 0;
    for (const [contractId, metadata] of this.cache) {
      if (predicate(metadata)) {
        this.cache.delete(contractId);
        this.removeFromAccessOrder(contractId);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder.length = 0;
  }

  /**
   * Get current cache size.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get all cached metadata (fresh only).
   */
  getAll(): SorobanAssetMetadata[] {
    const result: SorobanAssetMetadata[] = [];
    for (const [contractId] of this.accessOrder) {
      const entry = this.cache.get(contractId);
      if (entry && !this.isExpired(entry)) {
        result.push(entry);
      }
    }
    return result;
  }

  /**
   * Get cache statistics.
   */
  getStats(): SorobanAssetMetadataCacheStats {
    let fresh = 0;
    let expired = 0;
    for (const [, metadata] of this.cache) {
      if (this.isExpired(metadata)) {
        expired++;
      } else {
        fresh++;
      }
    }
    return {
      total: this.cache.size,
      fresh,
      expired,
      maxEntries: this.config.maxEntries,
      ttlMs: this.config.ttlMs,
    };
  }

  /**
   * Stop the background cleanup timer.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  private isExpired(metadata: SorobanAssetMetadata): boolean {
    return Date.now() - metadata.fetchedAt > this.config.ttlMs;
  }

  private updateAccessOrder(contractId: string): void {
    this.removeFromAccessOrder(contractId);
    this.accessOrder.push(contractId);
  }

  private removeFromAccessOrder(contractId: string): void {
    const index = this.accessOrder.indexOf(contractId);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  private evictOldest(): void {
    const oldest = this.accessOrder.shift();
    if (oldest) {
      this.cache.delete(oldest);
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);
    if (typeof (this.cleanupTimer as { unref?: () => void }).unref === 'function') {
      (this.cleanupTimer as { unref: () => void }).unref();
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [contractId, metadata] of this.cache) {
      if (now - metadata.fetchedAt > this.config.ttlMs) {
        this.cache.delete(contractId);
        this.removeFromAccessOrder(contractId);
      }
    }
  }
}

export interface SorobanAssetMetadataCacheStats {
  total: number;
  fresh: number;
  expired: number;
  maxEntries: number;
  ttlMs: number;
}

export const sorobanAssetMetadataCache = new SorobanAssetMetadataCache();