import {
  AssetMutationResult,
  AssetValidationError,
  DuplicateAssetError,
  RegisterAssetInput,
  StellarAssetDefinition,
  UnknownAssetError,
  UpdateAssetInput,
} from './types';
import {
  RegistryVersionStore,
  canonicalize,
} from './versioning/registry-version-store';
import { RouteRegistryLinker } from './versioning/route-registry-linker';
import {
  RegistryChange,
  RegistrySnapshot,
  RegistryVersion,
  RegistryVersionDiff,
  RouteDecision,
  RouteRegistryLink,
} from './versioning/types';

const COMPARABLE_FIELDS: (keyof StellarAssetDefinition)[] = [
  'symbol',
  'name',
  'network',
  'issuer',
  'contractId',
  'decimals',
  'tags',
  'metadata',
];

const DEFAULT_NETWORK = 'stellar';
const DEFAULT_DECIMALS = 7;
const MAX_DECIMALS = 77;

/**
 * A Stellar asset registry with built-in versioning.
 *
 * Every mutation (register/update/remove) is recorded as a change and produces
 * an immutable, numbered registry version containing a full asset snapshot.
 * Route decisions can be linked to the version they were computed against so
 * that routing behaviour can be reproduced and audited.
 *
 * Usage:
 *   const registry = new StellarAssetRegistry();
 *   registry.registerAsset({ symbol: 'USDC', name: 'USD Coin', issuer: 'G...' });
 *   registry.linkRouteDecision({ routeId: 'route-1' });
 *   registry.getVersion(1);
 *   registry.diffVersions(1, 2);
 */
export class StellarAssetRegistry {
  private readonly assets = new Map<string, StellarAssetDefinition>();

  /** Version history store for this registry. */
  readonly versions: RegistryVersionStore;

  /** Associates route decisions with registry versions. */
  readonly routes: RouteRegistryLinker;

  constructor(options: { registryId?: string } = {}) {
    this.versions = new RegistryVersionStore(
      options.registryId ?? 'stellar-asset-registry',
    );
    this.routes = new RouteRegistryLinker(this.versions);
  }

  // ─── Mutations ─────────────────────────────────────────────────────────

  /**
   * Register a new asset and assign it a registry version.
   *
   * @throws AssetValidationError when the definition is invalid.
   * @throws DuplicateAssetError when the asset id is already registered.
   */
  registerAsset(input: RegisterAssetInput): AssetMutationResult {
    const asset = this.normalize(input, new Date().toISOString());

    if (this.assets.has(asset.id)) {
      throw new DuplicateAssetError(asset.id);
    }

    this.assets.set(asset.id, asset);

    const version = this.versions.recordChange(
      {
        type: 'register',
        assetId: asset.id,
        symbol: asset.symbol,
        changedFields: [...COMPARABLE_FIELDS],
        after: asset,
        reason: input.reason,
      },
      this.snapshot(),
    );

    return this.result(asset, version);
  }

  /**
   * Update an existing asset, recording a new registry version.
   *
   * When nothing actually changes, no version is produced.
   *
   * @throws UnknownAssetError when the asset is not registered.
   */
  updateAsset(id: string, input: UpdateAssetInput): AssetMutationResult {
    const existing = this.getAssetOrThrow(id);
    const changedFields: string[] = [];
    const updated: StellarAssetDefinition = { ...existing };
    const inputRecord = input as unknown as Record<string, unknown>;
    const updatedRecord = updated as unknown as Record<string, unknown>;

    for (const field of COMPARABLE_FIELDS) {
      const next = inputRecord[field];
      if (next === undefined) continue;
      if (canonicalize(next) !== canonicalize(existing[field])) {
        updatedRecord[field] = next;
        changedFields.push(field);
      }
    }

    if (changedFields.length === 0) {
      return {
        asset: clone(existing),
        changed: false,
        version: this.versions.getLatestVersion(),
      };
    }

    // Normalize derived values after a change.
    updated.symbol = updated.symbol.toUpperCase();
    updated.network = updated.network?.trim() || DEFAULT_NETWORK;
    updated.tags = updated.tags ?? [];
    updated.metadata = updated.metadata ?? {};
    validate(updated);

    updated.updatedAt = new Date().toISOString();
    this.assets.set(updated.id, updated);

    const version = this.versions.recordChange(
      {
        type: 'update',
        assetId: updated.id,
        symbol: updated.symbol,
        changedFields,
        before: existing,
        after: updated,
        reason: input.reason,
      },
      this.snapshot(),
    );

    return this.result(updated, version);
  }

  /**
   * Remove an asset, recording a new registry version.
   *
   * @throws UnknownAssetError when the asset is not registered.
   */
  removeAsset(id: string, reason?: string): AssetMutationResult {
    const existing = this.getAssetOrThrow(id);
    this.assets.delete(id);

    const version = this.versions.recordChange(
      {
        type: 'remove',
        assetId: existing.id,
        symbol: existing.symbol,
        changedFields: [],
        before: existing,
        reason,
      },
      this.snapshot(),
    );

    return this.result(existing, version);
  }

  // ─── Asset lookup ──────────────────────────────────────────────────────

  /** Get an asset by id. */
  getAsset(id: string): StellarAssetDefinition | undefined {
    const asset = this.assets.get(id);
    return asset ? clone(asset) : undefined;
  }

  /** Get an asset by id, throwing when absent. */
  getAssetOrThrow(id: string): StellarAssetDefinition {
    const asset = this.getAsset(id);
    if (!asset) throw new UnknownAssetError(id);
    return asset;
  }

  /** Whether an asset is registered. */
  hasAsset(id: string): boolean {
    return this.assets.has(id);
  }

  /** Get all registered assets. */
  getAllAssets(): StellarAssetDefinition[] {
    return Array.from(this.assets.values()).map(clone);
  }

  /** Get assets matching a symbol (case-insensitive). */
  getAssetsBySymbol(symbol: string): StellarAssetDefinition[] {
    const upper = symbol.toUpperCase();
    return this.getAllAssets().filter((a) => a.symbol === upper);
  }

  /** Get assets on a network. */
  getAssetsByNetwork(network: string): StellarAssetDefinition[] {
    const target = network.toLowerCase();
    return this.getAllAssets().filter(
      (a) => a.network.toLowerCase() === target,
    );
  }

  /** Number of registered assets. */
  get size(): number {
    return this.assets.size;
  }

  // ─── Versioning ────────────────────────────────────────────────────────

  /** Current (latest) registry version number, or 0 when empty. */
  getCurrentVersion(): number {
    return this.versions.getLatestVersionNumber();
  }

  /** Get a registry version by number. */
  getVersion(version: number): RegistryVersion | undefined {
    return this.versions.getVersion(version);
  }

  /** Get the latest registry version. */
  getLatestVersion(): RegistryVersion | undefined {
    return this.versions.getLatestVersion();
  }

  /** Get version history, newest first. */
  getVersionHistory(limit?: number): RegistryVersion[] {
    return this.versions.getVersionHistory(limit);
  }

  /** Get all versions, oldest first. */
  listVersions(): RegistryVersion[] {
    return this.versions.listVersions();
  }

  /** Get the full change log, optionally filtered to one asset. */
  getChangeHistory(assetId?: string): RegistryChange[] {
    return this.versions.getChangeHistory(assetId);
  }

  /** Get the change log for a single asset. */
  getAssetHistory(assetId: string): RegistryChange[] {
    return this.versions.getChangeHistory(assetId);
  }

  /** Get an asset as it existed at a given registry version. */
  getAssetAtVersion(
    version: number,
    assetId: string,
  ): StellarAssetDefinition | undefined {
    return this.versions.getAssetAtVersion(version, assetId) as
      | StellarAssetDefinition
      | undefined;
  }

  /** Compute the diff between two registry versions. */
  diffVersions(fromVersion: number, toVersion: number): RegistryVersionDiff {
    return this.versions.diff(fromVersion, toVersion);
  }

  // ─── Route association ─────────────────────────────────────────────────

  /**
   * Associate a route decision with a registry version.
   *
   * @param decision Route decision record.
   * @param version Registry version to link. Defaults to the current version.
   */
  linkRouteDecision(
    decision: RouteDecision,
    version?: number,
  ): RouteRegistryLink {
    return this.routes.linkRouteDecision(decision, version);
  }

  /** Get the registry version a route decision was based on. */
  getRegistryVersionForRoute(routeId: string): number | undefined {
    return this.routes.getRegistryVersionForRoute(routeId);
  }

  /** Whether a route decision is based on an outdated registry version. */
  isRouteDecisionStale(routeId: string): boolean {
    return this.routes.isRouteStale(routeId);
  }

  /** Get all route decisions linked to a registry version. */
  getRoutesForVersion(version: number): RouteRegistryLink[] {
    return this.routes.getRoutesForVersion(version);
  }

  // ─── Private ───────────────────────────────────────────────────────────

  private result(
    asset: StellarAssetDefinition,
    version: RegistryVersion,
  ): AssetMutationResult {
    return {
      asset: clone(asset),
      changed: true,
      change: this.versions.getChangeForVersion(version.version),
      version,
    };
  }

  private snapshot(): RegistrySnapshot {
    const assets: Record<string, StellarAssetDefinition> = {};
    for (const asset of this.getAllAssets()) {
      assets[asset.id] = asset;
    }
    return { assets };
  }

  private normalize(
    input: RegisterAssetInput,
    now: string,
  ): StellarAssetDefinition {
    const symbol = input.symbol?.trim().toUpperCase();
    const network = input.network?.trim() || DEFAULT_NETWORK;
    const id =
      input.id?.trim() ||
      `${network.toLowerCase()}:${input.issuer ?? input.contractId ?? 'native'}:${symbol}`;

    const asset: StellarAssetDefinition = {
      id,
      symbol,
      name: input.name?.trim(),
      network,
      issuer: input.issuer,
      contractId: input.contractId,
      decimals: input.decimals ?? DEFAULT_DECIMALS,
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };

    validate(asset);
    return asset;
  }
}

function validate(asset: StellarAssetDefinition): void {
  if (!asset.symbol?.trim()) {
    throw new AssetValidationError('Asset symbol must be a non-empty string');
  }
  if (!asset.name?.trim()) {
    throw new AssetValidationError(
      `Asset "${asset.symbol}": name must be a non-empty string`,
    );
  }
  if (!asset.network?.trim()) {
    throw new AssetValidationError(
      `Asset "${asset.symbol}": network must be a non-empty string`,
    );
  }
  if (
    !Number.isInteger(asset.decimals) ||
    asset.decimals < 0 ||
    asset.decimals > MAX_DECIMALS
  ) {
    throw new AssetValidationError(
      `Asset "${asset.symbol}": decimals must be an integer between 0 and ${MAX_DECIMALS}`,
    );
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
