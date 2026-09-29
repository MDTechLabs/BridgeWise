/**
 * Stellar Asset Registry versioning types.
 *
 * A registry version is an immutable record of a single registry mutation plus
 * the full asset snapshot produced by that mutation. Versions are numbered
 * sequentially and never mutated, which makes historical state reproducible.
 */

import { RegistryChangeType, StellarAssetDefinition } from '../types';

/** A single recorded registry mutation. */
export interface RegistryChange {
  /** Unique change id. */
  id: string;
  /** Registry version produced by this change. */
  version: number;
  /** Kind of mutation. */
  type: RegistryChangeType;
  /** Id of the asset that was mutated. */
  assetId: string;
  /** Asset symbol at the time of the change, when known. */
  symbol?: string;
  /** Fields that changed (all fields for `register`, none for `remove`). */
  changedFields: string[];
  /** Asset state before the change (undefined for `register`). */
  before?: StellarAssetDefinition;
  /** Asset state after the change (undefined for `remove`). */
  after?: StellarAssetDefinition;
  /** Optional human-provided reason for the change. */
  reason?: string;
  /** When the change was recorded. */
  timestamp: string;
}

/** Immutable map of asset id -> asset definition at a point in time. */
export interface RegistrySnapshot {
  assets: Record<string, StellarAssetDefinition>;
}

/** An immutable, numbered registry version. */
export interface RegistryVersion {
  /** Sequential version number, starting at 1. */
  version: number;
  /** Stable version id, e.g. `stellar-asset-registry-v3`. */
  id: string;
  /** Identifier of the owning registry. */
  registryId: string;
  /** Id of the change that produced this version. */
  changeId: string;
  /** Kind of change that produced this version. */
  changeType: RegistryChangeType;
  /** Short human-readable summary of the change. */
  summary: string;
  /** Reason supplied with the change, if any. */
  reason?: string;
  /** When the version was created. */
  createdAt: string;
  /** Number of assets in the snapshot. */
  assetCount: number;
  /** Deterministic checksum of the snapshot, for integrity checks. */
  checksum: string;
  /** Full asset snapshot after the change. */
  snapshot: RegistrySnapshot;
}

/** Difference between two registry versions. */
export interface RegistryVersionDiff {
  fromVersion: number;
  toVersion: number;
  changes: RegistryChange[];
  addedAssetIds: string[];
  removedAssetIds: string[];
  updatedAssetIds: string[];
}

/** Input used by the version store to record a change. */
export interface RecordChangeInput {
  type: RegistryChangeType;
  assetId: string;
  symbol?: string;
  changedFields: string[];
  before?: StellarAssetDefinition;
  after?: StellarAssetDefinition;
  reason?: string;
}

/** A routing decision that can be tied to a registry version. */
export interface RouteDecision {
  /** Unique id of the route/decision record. */
  routeId: string;
  /** The route the engine selected. */
  selectedRoute?: string;
  /** The bridge the engine selected. */
  selectedBridge?: string;
  sourceChain?: string;
  destinationChain?: string;
  /** Assets involved in the decision. */
  assetIds?: string[];
  /** When the decision was made. */
  decidedAt?: string;
}

/** Association between a route decision record and a registry version. */
export interface RouteRegistryLink {
  routeId: string;
  registryVersion: number;
  registryVersionId: string;
  linkedAt: string;
}
