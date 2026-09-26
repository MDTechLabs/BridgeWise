import { SorobanContractMetadataCache } from '../../cache/contracts/soroban-contract-metadata-cache';
import {
  ContractInterfaceMetadata,
  ContractFunctionSpec,
  ContractEventSpec,
  ContractErrorSpec,
  MetadataNetwork,
  MetadataResolverConfig,
  MetadataResolutionResult,
  MetadataStatus,
} from './soroban-metadata.types';

/**
 * Resolves and caches interface metadata for Soroban smart contracts.
 *
 * Provides a single entry point (`resolve`) that checks the local cache first,
 * then (when provided with a fetch function) retrieves fresh metadata from the
 * network or a registry, caches it, and returns the result.
 *
 * @example
 * const resolver = new SorobanContractMetadataResolver({
 *   rpcUrl: 'https://soroban-testnet.stellar.org',
 *   network: MetadataNetwork.TESTNET,
 * });
 *
 * const result = await resolver.resolve('CAU2YJ4XWQKZUADHZJ67H27NKAHQ3MK3NQRCMQKJ22RIRM32SFZKGGH');
 * if (result.metadata) {
 *   console.log(result.metadata.functions.map(f => f.name));
 * }
 */
export class SorobanContractMetadataResolver {
  private readonly config: Required<MetadataResolverConfig>;
  private readonly cache: SorobanContractMetadataCache;

  constructor(
    config: MetadataResolverConfig & { cache?: SorobanContractMetadataCache } = {} as any,
  ) {
    this.config = {
      rpcUrl: config.rpcUrl ?? 'https://soroban-testnet.stellar.org',
      cacheTtlMs: config.cacheTtlMs ?? 300_000,
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1000,
      network: config.network ?? MetadataNetwork.TESTNET,
    };
    this.cache =
      (config as any).cache ??
      new SorobanContractMetadataCache({ defaultTtlMs: this.config.cacheTtlMs });
  }

  /**
   * Resolve interface metadata for the given contract address.
   *
   * Priority order:
   * 1. In-memory cache (if still valid)
   * 2. Fetcher callback (if provided at construction)
   * 3. Return UNAVAILABLE
   */
  async resolve(
    contractAddress: string,
    options?: {
      network?: MetadataNetwork;
      forceRefresh?: boolean;
      fetcher?: (
        address: string,
        network: MetadataNetwork,
        rpcUrl: string,
      ) => Promise<ContractInterfaceMetadata | null>;
    },
  ): Promise<MetadataResolutionResult> {
    const network = options?.network ?? this.config.network;
    const resolvedAt = Date.now();

    // 1. Check cache (unless forced refresh)
    if (!options?.forceRefresh) {
      const cached = this.cache.get(contractAddress, network);
      if (cached) {
        return {
          contractAddress,
          network,
          metadata: cached,
          resolvedAt,
          fromCache: true,
        };
      }
    }

    // 2. Attempt to fetch via caller-provided fetcher
    if (options?.fetcher) {
      try {
        const metadata = await this.fetchWithRetry(
          options.fetcher,
          contractAddress,
          network,
        );
        if (metadata) {
          this.cache.set(contractAddress, network, metadata, this.config.cacheTtlMs);
          return {
            contractAddress,
            network,
            metadata,
            resolvedAt,
            fromCache: false,
          };
        }
      } catch (err: any) {
        return {
          contractAddress,
          network,
          metadata: null,
          resolvedAt,
          fromCache: false,
          error: err?.message ?? String(err),
        };
      }
    }

    // 3. No fetcher or fetcher returned null → unavailable
    return {
      contractAddress,
      network,
      metadata: null,
      resolvedAt,
      fromCache: false,
      error: 'Metadata unavailable: no fetcher provided or fetcher returned null',
    };
  }

  /**
   * Bulk-resolve metadata for multiple contract addresses in parallel.
   */
  async resolveBatch(
    contractAddresses: string[],
    options?: {
      network?: MetadataNetwork;
      forceRefresh?: boolean;
      fetcher?: (
        address: string,
        network: MetadataNetwork,
        rpcUrl: string,
      ) => Promise<ContractInterfaceMetadata | null>;
      concurrency?: number;
    },
  ): Promise<MetadataResolutionResult[]> {
    const concurrency = options?.concurrency ?? 10;
    const results: MetadataResolutionResult[] = [];
    const chunks: string[][] = [];

    for (let i = 0; i < contractAddresses.length; i += concurrency) {
      chunks.push(contractAddresses.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map((addr) => this.resolve(addr, options)),
      );
      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * Manually store metadata in the cache (e.g., from a pre-built registry).
   */
  cacheMetadata(metadata: ContractInterfaceMetadata, ttlMs?: number): void {
    this.cache.set(metadata.contractAddress, metadata.network, metadata, ttlMs);
  }

  /**
   * Detect whether the metadata for a contract has changed compared to what
   * is currently cached.
   *
   * Returns `null` if no previous metadata exists (first-time resolution).
   * Returns `{ changed: true, previous, current }` when a change is detected.
   */
  async detectChange(
    contractAddress: string,
    freshMetadata: ContractInterfaceMetadata,
    network?: MetadataNetwork,
  ): Promise<{
    changed: boolean;
    previous: ContractInterfaceMetadata | null;
    current: ContractInterfaceMetadata;
  } | null> {
    const net = network ?? freshMetadata.network;
    const previous = this.cache.get(contractAddress, net);

    if (!previous) return null;

    const changed =
      previous.specVersion !== freshMetadata.specVersion ||
      previous.functions.length !== freshMetadata.functions.length ||
      previous.events.length !== freshMetadata.events.length ||
      previous.errors.length !== freshMetadata.errors.length ||
      JSON.stringify(previous.functions) !== JSON.stringify(freshMetadata.functions) ||
      JSON.stringify(previous.events) !== JSON.stringify(freshMetadata.events) ||
      JSON.stringify(previous.errors) !== JSON.stringify(freshMetadata.errors);

    return { changed, previous, current: freshMetadata };
  }

  /**
   * Retrieve cached metadata without triggering a network fetch.
   */
  getCached(
    contractAddress: string,
    network?: MetadataNetwork,
  ): ContractInterfaceMetadata | null {
    return this.cache.get(contractAddress, network ?? this.config.network);
  }

  /** Invalidate cached metadata for a specific contract. */
  invalidate(contractAddress: string, network?: MetadataNetwork): boolean {
    return this.cache.invalidate(contractAddress, network ?? this.config.network);
  }

  /** Clear the entire metadata cache. */
  clearCache(): void {
    this.cache.clear();
  }

  /** Get cache statistics. */
  getCacheStats() {
    return this.cache.getStats();
  }

  // ---- internals ----

  /**
   * Execute a fetcher with retry + exponential back-off.
   */
  private async fetchWithRetry(
    fetcher: (
      address: string,
      network: MetadataNetwork,
      rpcUrl: string,
    ) => Promise<ContractInterfaceMetadata | null>,
    address: string,
    network: MetadataNetwork,
  ): Promise<ContractInterfaceMetadata | null> {
    let lastError: any;
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fetcher(address, network, this.config.rpcUrl);
      } catch (err) {
        lastError = err;
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
          await sleep(delay);
        }
      }
    }
    throw lastError;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
