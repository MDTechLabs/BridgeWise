import { createHash } from 'crypto';
import {
  RecordChangeInput,
  RegistryChange,
  RegistrySnapshot,
  RegistryVersion,
  RegistryVersionDiff,
} from './types';

/**
 * Stores the version history of a Stellar asset registry.
 *
 * Every mutation records a change and produces a new numbered, immutable
 * version containing a full snapshot of the registry. The store supports
 * version lookup, historical retrieval, point-in-time queries and diffs.
 *
 * Usage:
 *   const store = new RegistryVersionStore('stellar-asset-registry');
 *   const version = store.recordChange({ type: 'register', ... }, snapshot);
 *   store.getVersion(version.version);
 *   store.diff(1, version.version);
 */
export class RegistryVersionStore {
  private readonly versions = new Map<number, RegistryVersion>();
  private readonly changes = new Map<number, RegistryChange>();
  private readonly changesById = new Map<string, RegistryChange>();
  private latestVersion = 0;
  private changeCounter = 0;

  constructor(private readonly registryId: string = 'stellar-asset-registry') {}

  // ─── Recording ─────────────────────────────────────────────────────────

  /**
   * Record a change and produce the next registry version.
   *
   * @param input Description of the mutation.
   * @param snapshot Full asset snapshot after the mutation.
   */
  recordChange(
    input: RecordChangeInput,
    snapshot: RegistrySnapshot,
  ): RegistryVersion {
    const versionNumber = this.latestVersion + 1;
    const now = new Date().toISOString();

    const change: RegistryChange = {
      id: `${this.registryId}-change-${++this.changeCounter}`,
      version: versionNumber,
      type: input.type,
      assetId: input.assetId,
      symbol: input.symbol,
      changedFields: [...input.changedFields],
      before: input.before ? cloneAsset(input.before) : undefined,
      after: input.after ? cloneAsset(input.after) : undefined,
      reason: input.reason,
      timestamp: now,
    };

    const version: RegistryVersion = {
      version: versionNumber,
      id: `${this.registryId}-v${versionNumber}`,
      registryId: this.registryId,
      changeId: change.id,
      changeType: change.type,
      summary: this.summarize(change),
      reason: change.reason,
      createdAt: now,
      assetCount: Object.keys(snapshot.assets).length,
      checksum: checksumSnapshot(snapshot),
      snapshot: cloneSnapshot(snapshot),
    };

    this.versions.set(versionNumber, version);
    this.changes.set(versionNumber, change);
    this.changesById.set(change.id, change);
    this.latestVersion = versionNumber;

    return cloneVersion(version);
  }

  // ─── Lookup ────────────────────────────────────────────────────────────

  /** Get a version by number. Returns undefined when absent. */
  getVersion(version: number): RegistryVersion | undefined {
    const found = this.versions.get(version);
    return found ? cloneVersion(found) : undefined;
  }

  /** Get a version by number, throwing when absent. */
  getVersionOrThrow(version: number): RegistryVersion {
    const found = this.getVersion(version);
    if (!found) {
      throw new Error(
        `Registry version ${version} does not exist in "${this.registryId}"`,
      );
    }
    return found;
  }

  /** Get a version by the id of the change that produced it. */
  getVersionByChangeId(changeId: string): RegistryVersion | undefined {
    const change = this.changesById.get(changeId);
    return change ? this.getVersion(change.version) : undefined;
  }

  /** Get the most recent version, if any. */
  getLatestVersion(): RegistryVersion | undefined {
    return this.getVersion(this.latestVersion);
  }

  /** Get the most recent version number (0 when no versions exist). */
  getLatestVersionNumber(): number {
    return this.latestVersion;
  }

  /** Get the full version history, oldest first. */
  listVersions(): RegistryVersion[] {
    return Array.from(this.versions.keys())
      .sort((a, b) => a - b)
      .map((v) => this.getVersion(v))
      .filter((v): v is RegistryVersion => Boolean(v));
  }

  /**
   * Get the version history, newest first.
   *
   * @param limit Optional maximum number of versions to return.
   */
  getVersionHistory(limit?: number): RegistryVersion[] {
    const history = this.listVersions().reverse();
    return limit === undefined ? history : history.slice(0, limit);
  }

  /**
   * Get the latest version created at or before the given timestamp.
   */
  getVersionAt(timestamp: string | Date): RegistryVersion | undefined {
    const target =
      timestamp instanceof Date ? timestamp.getTime() : Date.parse(timestamp);
    if (Number.isNaN(target)) return undefined;

    let result: RegistryVersion | undefined;
    for (const version of this.listVersions()) {
      if (Date.parse(version.createdAt) <= target) {
        result = version;
      } else {
        break;
      }
    }
    return result;
  }

  // ─── Changes ───────────────────────────────────────────────────────────

  /** Get the change that produced a version, if any. */
  getChangeForVersion(version: number): RegistryChange | undefined {
    const change = this.changes.get(version);
    return change ? cloneChange(change) : undefined;
  }

  /** Get the change history, optionally filtered to a single asset. */
  getChangeHistory(assetId?: string): RegistryChange[] {
    const all = Array.from(this.changes.keys())
      .sort((a, b) => a - b)
      .map((v) => this.changes.get(v))
      .filter((c): c is RegistryChange => Boolean(c));

    const filtered = assetId ? all.filter((c) => c.assetId === assetId) : all;
    return filtered.map(cloneChange);
  }

  /** Number of recorded changes. */
  get changeCount(): number {
    return this.changes.size;
  }

  // ─── Historical state ──────────────────────────────────────────────────

  /** Get the snapshot stored for a version. */
  getSnapshotAtVersion(version: number): RegistrySnapshot {
    return cloneSnapshot(this.getVersionOrThrow(version).snapshot);
  }

  /** Get an asset as it existed at a given version. */
  getAssetAtVersion(
    version: number,
    assetId: string,
  ): RegistrySnapshot['assets'][string] | undefined {
    const asset = this.getVersionOrThrow(version).snapshot.assets[assetId];
    return asset ? cloneAsset(asset) : undefined;
  }

  // ─── Diffing ───────────────────────────────────────────────────────────

  /** Compute the changes between two versions (exclusive of `from`). */
  diff(fromVersion: number, toVersion: number): RegistryVersionDiff {
    const from = this.getVersionOrThrow(fromVersion);
    const to = this.getVersionOrThrow(toVersion);

    if (to.version < from.version) {
      throw new Error(
        `Cannot diff backwards: from ${fromVersion} to ${toVersion}`,
      );
    }

    const changes = this.getVersionHistory()
      .filter((v) => v.version > from.version && v.version <= to.version)
      .map((v) => this.changes.get(v.version))
      .filter((c): c is RegistryChange => Boolean(c))
      .sort((a, b) => a.version - b.version)
      .map(cloneChange);

    const addedAssetIds: string[] = [];
    const removedAssetIds: string[] = [];
    const updatedAssetIds: string[] = [];

    for (const change of changes) {
      if (change.type === 'register') addedAssetIds.push(change.assetId);
      else if (change.type === 'remove') removedAssetIds.push(change.assetId);
      else updatedAssetIds.push(change.assetId);
    }

    // An asset removed after being added within the range should not appear.
    const addedSet = new Set(addedAssetIds);
    const removedSet = new Set(removedAssetIds);

    return {
      fromVersion: from.version,
      toVersion: to.version,
      changes,
      addedAssetIds: addedAssetIds.filter((id) => !removedSet.has(id)),
      removedAssetIds: removedAssetIds.filter((id) => !addedSet.has(id)),
      updatedAssetIds: updatedAssetIds.filter(
        (id) => !addedSet.has(id) && !removedSet.has(id),
      ),
    };
  }

  /** Number of stored versions. */
  get size(): number {
    return this.versions.size;
  }

  // ─── Private ───────────────────────────────────────────────────────────

  private summarize(change: RegistryChange): string {
    const label = change.symbol ?? change.assetId;
    switch (change.type) {
      case 'register':
        return `Registered asset ${label}`;
      case 'remove':
        return `Removed asset ${label}`;
      case 'update':
        return change.changedFields.length > 0
          ? `Updated asset ${label} (${change.changedFields.join(', ')})`
          : `Updated asset ${label}`;
      default:
        return `Changed asset ${label}`;
    }
  }
}

/** Deterministic JSON serialization with sorted object keys. */
export function canonicalize(value: unknown): string {
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

/** Compute a deterministic sha256 checksum for a snapshot. */
export function checksumSnapshot(snapshot: RegistrySnapshot): string {
  return createHash('sha256')
    .update(canonicalize(snapshot.assets))
    .digest('hex');
}

function cloneAsset<T>(asset: T): T {
  return JSON.parse(JSON.stringify(asset)) as T;
}

function cloneSnapshot(snapshot: RegistrySnapshot): RegistrySnapshot {
  return { assets: cloneAsset(snapshot.assets) };
}

function cloneChange(change: RegistryChange): RegistryChange {
  return cloneAsset(change);
}

function cloneVersion(version: RegistryVersion): RegistryVersion {
  return cloneAsset(version);
}
