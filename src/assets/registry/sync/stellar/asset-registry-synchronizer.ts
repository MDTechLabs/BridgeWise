import {
  AssetMetadataSource,
  AssetRegistryStore,
  AssetRejection,
  AssetSourceError,
  AssetSyncReport,
  StellarAssetMetadataInput,
  StellarAssetRecord,
  StellarAssetRegistrySyncOptions,
} from './types';
import {
  StellarAssetValidationError,
  validateStellarAssetMetadata,
} from './stellar-asset-validator';

/** Thrown when one or more metadata sources could not be reached. */
export class StellarAssetSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StellarAssetSyncError';
  }
}

/** Aggregated result of fetching from all configured sources. */
export interface FetchSupportedAssetsResult {
  assets: StellarAssetRecord[];
  rejected: AssetRejection[];
  sourceErrors: AssetSourceError[];
  sources: string[];
}

/**
 * Synchronizes a Stellar asset registry with configured metadata sources.
 *
 * The synchronizer fetches supported asset metadata, validates it (including
 * issuer information), compares it with the stored records and applies
 * additions, updates and removals. A report of what changed is returned.
 *
 * Usage:
 *   const store = new InMemoryAssetRegistry();
 *   const synchronizer = new StellarAssetRegistrySynchronizer({
 *     sources: [new StaticAssetMetadataSource('config', assets)],
 *     store,
 *   });
 *   const report = await synchronizer.sync();
 */
export class StellarAssetRegistrySynchronizer {
  private readonly sources: AssetMetadataSource[];
  private readonly store: AssetRegistryStore;
  private readonly network: string;
  private readonly removeMissing: boolean;
  private readonly continueOnSourceError: boolean;

  constructor(options: StellarAssetRegistrySyncOptions) {
    if (
      !options ||
      !Array.isArray(options.sources) ||
      options.sources.length === 0
    ) {
      throw new Error('At least one asset metadata source is required');
    }
    if (!options.store) {
      throw new Error('A target asset registry store is required');
    }

    this.sources = [...options.sources];
    this.store = options.store;
    this.network = options.network?.trim() || 'stellar';
    this.removeMissing = options.removeMissing ?? true;
    this.continueOnSourceError = options.continueOnSourceError ?? false;
  }

  /**
   * Fetch, validate and de-duplicate asset metadata from all sources.
   *
   * Invalid records are collected in `rejected`. A failing source is recorded
   * in `sourceErrors`, or thrown as `StellarAssetSyncError` when
   * `continueOnSourceError` is false.
   */
  async fetchSupportedAssets(): Promise<FetchSupportedAssetsResult> {
    const results = await Promise.all(
      this.sources.map(async (source) => {
        try {
          const raw = await source.fetchAssets();
          if (!Array.isArray(raw)) {
            throw new Error('source returned a non-array payload');
          }
          return { source, assets: raw, error: undefined };
        } catch (error) {
          return {
            source,
            assets: [] as StellarAssetMetadataInput[],
            error: error instanceof Error ? error : new Error(String(error)),
          };
        }
      }),
    );

    const assets: StellarAssetRecord[] = [];
    const rejected: AssetRejection[] = [];
    const sourceErrors: AssetSourceError[] = [];
    const seen = new Set<string>();

    for (const result of results) {
      if (result.error) {
        sourceErrors.push({
          source: result.source.name,
          message: result.error.message,
        });
        continue;
      }

      for (const item of result.assets) {
        try {
          const record = validateStellarAssetMetadata(item, this.network);
          if (!seen.has(record.id)) {
            seen.add(record.id);
            assets.push(record);
          }
        } catch (error) {
          if (error instanceof StellarAssetValidationError) {
            rejected.push({
              source: result.source.name,
              asset: item,
              issues: error.issues,
            });
          } else {
            throw error;
          }
        }
      }
    }

    if (sourceErrors.length > 0 && !this.continueOnSourceError) {
      const names = sourceErrors.map((entry) => entry.source).join(', ');
      throw new StellarAssetSyncError(
        `Failed to fetch asset metadata from source(s): ${names}`,
      );
    }

    return {
      assets,
      rejected,
      sourceErrors,
      sources: this.sources.map((source) => source.name),
    };
  }

  /**
   * Run a full synchronization: fetch, validate, diff and apply.
   *
   * Removals are only applied when the fetch completed without source errors,
   * so a partial outage cannot wipe the registry.
   */
  async sync(): Promise<AssetSyncReport> {
    const { assets, rejected, sourceErrors, sources } =
      await this.fetchSupportedAssets();

    const currentById = new Map(
      this.store.getAll().map((asset) => [asset.id, asset]),
    );
    const incomingById = new Map(assets.map((asset) => [asset.id, asset]));

    const added: string[] = [];
    const updated: string[] = [];
    const unchanged: string[] = [];

    for (const [id, record] of incomingById) {
      const existing = currentById.get(id);
      if (!existing) {
        this.store.add(record);
        added.push(id);
      } else if (areRecordsEqual(existing, record)) {
        unchanged.push(id);
      } else {
        this.store.update(record);
        updated.push(id);
      }
    }

    const removed: string[] = [];
    const completeFetch = sourceErrors.length === 0;
    if (this.removeMissing && completeFetch) {
      for (const id of currentById.keys()) {
        if (!incomingById.has(id)) {
          this.store.remove(id);
          removed.push(id);
        }
      }
    }

    return {
      added: added.sort(),
      updated: updated.sort(),
      removed: removed.sort(),
      unchanged: unchanged.sort(),
      rejected,
      sourceErrors,
      sources,
      syncedAt: new Date().toISOString(),
    };
  }
}

/** Content equality for two asset records (ids aside). */
export function areRecordsEqual(
  a: StellarAssetRecord,
  b: StellarAssetRecord,
): boolean {
  return (
    a.code === b.code &&
    a.name === b.name &&
    a.network === b.network &&
    a.issuer === b.issuer &&
    a.contractId === b.contractId &&
    a.decimals === b.decimals &&
    canonicalize(a.tags) === canonicalize(b.tags) &&
    canonicalize(a.metadata) === canonicalize(b.metadata)
  );
}

/** Deterministic JSON serialization with sorted object keys. */
function canonicalize(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(',')}}`;
}
