/**
 * Stellar Asset Registry Synchronization — core types.
 *
 * The synchronizer keeps a registry store in sync with one or more metadata
 * sources: it fetches supported asset metadata, validates it, compares it with
 * the stored records and applies additions, updates and removals.
 */

/** A canonical, validated asset record as stored in the registry. */
export interface StellarAssetRecord {
  /** Stable, unique id for the asset (derived when not supplied). */
  id: string;
  /** Uppercase asset code, e.g. `USDC` or `XLM`. */
  code: string;
  /** Human-readable asset name. */
  name: string;
  /** Network the asset lives on, e.g. `stellar`, `testnet`. */
  network: string;
  /** Classic Stellar issuer account (G...), when applicable. */
  issuer?: string;
  /** Soroban contract id (C...), when applicable. */
  contractId?: string;
  /** Number of decimal places (Stellar assets use 7). */
  decimals: number;
  /** Free-form tags used for filtering/lookups. */
  tags: string[];
  /** Arbitrary metadata carried with the record. */
  metadata: Record<string, unknown>;
}

/** Raw asset metadata as returned by a source, before validation. */
export interface StellarAssetMetadataInput {
  /** Optional explicit id. Derived from network/issuer/code when omitted. */
  id?: string;
  code: string;
  name: string;
  network?: string;
  issuer?: string;
  contractId?: string;
  decimals?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/** A configured source of supported Stellar asset metadata. */
export interface AssetMetadataSource {
  /** Human-readable source name, used in reports. */
  name: string;
  /** Fetch the current set of supported asset metadata records. */
  fetchAssets(): Promise<StellarAssetMetadataInput[]>;
}

/** The registry store the synchronizer writes to. */
export interface AssetRegistryStore {
  /** Snapshot of all currently stored records. */
  getAll(): StellarAssetRecord[];
  /** Add a new record. */
  add(asset: StellarAssetRecord): void;
  /** Replace an existing record. */
  update(asset: StellarAssetRecord): void;
  /** Remove a record by id. */
  remove(id: string): void;
}

/** An incoming asset that failed validation. */
export interface AssetRejection {
  /** Name of the source the asset came from. */
  source: string;
  /** The raw asset metadata that was rejected. */
  asset: unknown;
  /** Validation issues that caused the rejection. */
  issues: string[];
}

/** Error raised when a configured source could not be reached. */
export interface AssetSourceError {
  source: string;
  message: string;
}

/** Result of a synchronization run. */
export interface AssetSyncReport {
  /** Ids of newly detected assets that were added. */
  added: string[];
  /** Ids of existing assets whose metadata changed. */
  updated: string[];
  /** Ids of stored assets no longer present in the sources. */
  removed: string[];
  /** Ids of assets that matched the stored record. */
  unchanged: string[];
  /** Incoming records that failed validation. */
  rejected: AssetRejection[];
  /** Sources that failed during the run (when continuing on error). */
  sourceErrors: AssetSourceError[];
  /** Names of the sources that were queried. */
  sources: string[];
  /** When the synchronization completed. */
  syncedAt: string;
}

/** Options for the synchronizer. */
export interface StellarAssetRegistrySyncOptions {
  /** Metadata sources to pull from (at least one). */
  sources: AssetMetadataSource[];
  /** Registry store to keep in sync. */
  store: AssetRegistryStore;
  /** Default network applied to records that omit one. Defaults to `stellar`. */
  network?: string;
  /** Remove stored assets that are absent from the incoming data. Defaults to true. */
  removeMissing?: boolean;
  /**
   * Continue when a source fails, recording the error instead of throwing.
   * When enabled, removals are skipped for the run because the incoming data
   * is incomplete. Defaults to false.
   */
  continueOnSourceError?: boolean;
}
