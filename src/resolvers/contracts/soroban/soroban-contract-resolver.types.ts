/**
 * File: src/resolvers/contracts/soroban/soroban-contract-resolver.types.ts
 *
 * Type definitions for the Soroban contract address resolver.
 */

import { StellarNetwork } from '../../../config/networks/stellar-networks';

/**
 * A single entry in the contract registry describing one contract
 * deployment for a specific network.
 */
export interface ContractEntry {
  /**
   * Logical name / identifier for this contract (e.g. "bridge_vault",
   * "atomic_swap").  Case-insensitive during lookups.
   */
  contractName: string;

  /** The Stellar network where this contract is deployed. */
  network: StellarNetwork;

  /**
   * The on-chain Soroban contract address (C… StrKey).
   * May be overridden at runtime via an environment variable whose name is
   * stored in envOverrideKey.
   */
  address: string;

  /**
   * Optional name of an environment variable whose value, if present,
   * supersedes `address` at resolution time.
   *
   * Example: `"BRIDGE_VAULT_MAINNET_ADDRESS"`
   */
  envOverrideKey?: string;

  /** Human-readable description of the contract's purpose. */
  description?: string;

  /** Arbitrary metadata attached to this contract entry. */
  metadata?: Record<string, unknown>;
}

/**
 * Options accepted by SorobanContractResolver.resolve().
 */
export interface ResolveOptions {
  /**
   * When true, bypass the environment-variable override and return the
   * static `address` stored in the registry entry.
   * Default: false.
   */
  ignoreEnvOverride?: boolean;
}

/**
 * Result returned by SorobanContractResolver.resolve().
 */
export interface ResolveResult {
  /** Logical name of the contract that was resolved. */
  contractName: string;

  /** Stellar network on which the address is valid. */
  network: StellarNetwork;

  /**
   * The resolved contract address.
   * This will be the env-override value when one is set, otherwise the
   * static address from the registry.
   */
  address: string;

  /** True when the address came from an environment variable override. */
  resolvedFromEnv: boolean;

  /** Full registry entry for this contract/network pair. */
  entry: ContractEntry;
}

/**
 * Error thrown when a caller requests an address for a network that is
 * not in the set of supported StellarNetwork values.
 */
export class UnsupportedNetworkError extends Error {
  constructor(network: string) {
    super(
      `[SorobanContractResolver] Unsupported network: "${network}". ` +
        `Supported networks: ${Object.values(StellarNetwork).join(', ')}`,
    );
    this.name = 'UnsupportedNetworkError';
  }
}

/**
 * Error thrown when no contract entry matches the requested name/network
 * combination.
 */
export class ContractNotFoundError extends Error {
  constructor(contractName: string, network: StellarNetwork) {
    super(
      `[SorobanContractResolver] No contract registered for ` +
        `"${contractName}" on network "${network}".`,
    );
    this.name = 'ContractNotFoundError';
  }
}

/**
 * Error thrown when a duplicate contract entry is registered for the same
 * name/network pair.
 */
export class DuplicateContractError extends Error {
  constructor(contractName: string, network: StellarNetwork) {
    super(
      `[SorobanContractResolver] A contract entry for ` +
        `"${contractName}" on network "${network}" is already registered.`,
    );
    this.name = 'DuplicateContractError';
  }
}
