/**
 * Stellar Asset Registry — core types.
 *
 * The registry stores canonical, versioned definitions of Stellar assets so
 * that route/execution decisions can be reproduced against the exact registry
 * state that was in effect when they were made.
 */

import type { RegistryChange, RegistryVersion } from './versioning/types';

/** The kind of mutation a registry version captures. */
export type RegistryChangeType = 'register' | 'update' | 'remove';

/** A canonical asset definition stored in the registry. */
export interface StellarAssetDefinition {
  /** Stable, unique id for the asset (derived when not supplied). */
  id: string;
  /** Uppercase asset code, e.g. `USDC` or `XLM`. */
  symbol: string;
  /** Human-readable asset name. */
  name: string;
  /** Network the asset lives on. Defaults to `stellar`. */
  network: string;
  /** Classic Stellar issuer account (G...), when applicable. */
  issuer?: string;
  /** Soroban contract id (C...), when applicable. */
  contractId?: string;
  /** Number of decimal places (Stellar assets use 7). */
  decimals: number;
  /** Free-form tags used for filtering/lookups. */
  tags: string[];
  /** Arbitrary metadata carried with the definition. */
  metadata: Record<string, unknown>;
  /** When the asset was first registered. */
  createdAt: string;
  /** When the asset was last mutated. */
  updatedAt: string;
}

/** Input accepted when registering a new asset. */
export interface RegisterAssetInput {
  /** Optional explicit id. Derived from network/issuer/symbol when omitted. */
  id?: string;
  symbol: string;
  name: string;
  network?: string;
  issuer?: string;
  contractId?: string;
  decimals?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  /** Optional reason recorded in the registry change log. */
  reason?: string;
}

/** Input accepted when updating an existing asset. */
export interface UpdateAssetInput {
  symbol?: string;
  name?: string;
  network?: string;
  issuer?: string;
  contractId?: string;
  decimals?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  /** Reason the asset was updated (recorded in the change log). */
  reason: string;
}

/** Result of a mutating registry operation. */
export interface AssetMutationResult {
  /** The asset after the mutation (the removed asset for `remove`). */
  asset: StellarAssetDefinition;
  /** Whether the registry state actually changed. */
  changed: boolean;
  /** The change that was recorded, if the state changed. */
  change?: RegistryChange;
  /** The registry version produced by the change, if any. */
  version?: RegistryVersion;
}

/** Thrown when an operation targets an asset that is not registered. */
export class UnknownAssetError extends Error {
  constructor(id: string) {
    super(`Unknown asset in registry: "${id}"`);
    this.name = 'UnknownAssetError';
  }
}

/** Thrown when an asset definition is invalid. */
export class AssetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetValidationError';
  }
}

/** Thrown when an asset is registered more than once. */
export class DuplicateAssetError extends Error {
  constructor(id: string) {
    super(`Asset "${id}" is already registered`);
    this.name = 'DuplicateAssetError';
  }
}
