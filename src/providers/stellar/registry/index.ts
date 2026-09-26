/**
 * Stellar Bridge Provider Registry (issue #445).
 *
 * Centralized catalog of known Stellar bridge providers. Use as the single
 * source of truth when callers need to "find a Stellar bridge provider that
 * supports this asset / chain / network".
 */

export {
  StellarBridgeProviderRegistry,
  defaultStellarBridgeProviderRegistry,
} from './stellar-bridge-provider-registry';

export type {
  HealthSnapshotInput,
  StellarBridgeProviderRegistryOptions,
} from './stellar-bridge-provider-registry';

export * from './types';
