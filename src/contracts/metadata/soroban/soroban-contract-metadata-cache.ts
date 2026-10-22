import {
  ContractInterfaceMetadata,
  MetadataCacheConfig,
  MetadataCacheStats,
} from './soroban-metadata.types';

interface CacheEntry {
  metadata: ContractInterfaceMetadata;
  expiresAt: number;
  insertedAt: number;
  lastAccessedAt: number;
  accessCount: number;
}

const DEFAULT_CONFIG: Required<MetadataCacheConfig> = {
  maxSize: 500,
  defaultTtlMs: 300_000,
  trackAccessFrequency: true,
};

export class SorobanContractMetadataCache {
  private readonly config: Required<MetadataCacheConfig>;
  private readonly entries = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private readonly now: () => number;

  constructor(
    config: MetadataCacheConfig = {},
    now: () => number = () => Date.now(),
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.now = now;
  }

  get size(): number {
    this.pruneExpired();
    return this.entries.size;
  }

  set(
    contractAddress: string,
    network: string,
    metadata: ContractInterfaceMetadata,
    ttlMs?: number,
  ): void {
    const key = this.key(contractAddress, network);
    const timestamp = this.now();

    if (!this.entries.has(key) && this.entries.size >= this.config.maxSize) {
      this.evictLeastUsed();
    }

    const existing = this.entries.get(key);
    this.entries.set(key, {
      metadata,
      expiresAt: timestamp + (ttlMs ?? this.config.defaultTtlMs),
      insertedAt: existing?.insertedAt ?? timestamp,
      lastAccessedAt: timestamp,
      accessCount: existing?.accessCount ?? 0,
    });
  }

  get(
    contractAddress: string,
    network: string,
  ): ContractInterfaceMetadata | null {
    const key = this.key(contractAddress, network);
    const entry = this.entries.get(key);

    if (!entry || this.isExpired(entry)) {
      if (entry) this.entries.delete(key);
      this.misses += 1;
      return null;
    }

    this.hits += 1;
    if (this.config.trackAccessFrequency) {
      entry.accessCount += 1;
    }
    entry.lastAccessedAt = this.now();
    return entry.metadata;
  }

  has(contractAddress: string, network: string): boolean {
    const entry = this.entries.get(this.key(contractAddress, network));
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.entries.delete(this.key(contractAddress, network));
      return false;
    }
    return true;
  }

  invalidate(contractAddress: string, network: string): boolean {
    return this.entries.delete(this.key(contractAddress, network));
  }

  clear(): void {
    this.entries.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  getStats(): MetadataCacheStats {
    this.pruneExpired();
    const timestamp = this.now();
    const ages = Array.from(this.entries.values()).map((entry) =>
      Math.max(0, timestamp - entry.insertedAt),
    );
    const totalLookups = this.hits + this.misses;

    return {
      totalEntries: this.entries.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: totalLookups === 0 ? 0 : this.hits / totalLookups,
      oldestEntryAge: ages.length > 0 ? Math.max(...ages) : undefined,
      newestEntryAge: ages.length > 0 ? Math.min(...ages) : undefined,
    };
  }

  private key(contractAddress: string, network: string): string {
    return `${network}:${contractAddress}`;
  }

  private isExpired(entry: CacheEntry): boolean {
    return entry.expiresAt <= this.now();
  }

  private pruneExpired(): void {
    const timestamp = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= timestamp) {
        this.entries.delete(key);
      }
    }
  }

  private evictLeastUsed(): void {
    let victimKey: string | undefined;
    let victim: CacheEntry | undefined;

    for (const [key, entry] of this.entries) {
      if (
        !victim ||
        entry.accessCount < victim.accessCount ||
        (entry.accessCount === victim.accessCount &&
          entry.lastAccessedAt < victim.lastAccessedAt)
      ) {
        victimKey = key;
        victim = entry;
      }
    }

    if (victimKey) {
      this.entries.delete(victimKey);
      this.evictions += 1;
    }
  }
}
