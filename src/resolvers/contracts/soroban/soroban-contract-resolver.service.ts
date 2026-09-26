/**
 * File: src/resolvers/contracts/soroban/soroban-contract-resolver.service.ts
 *
 * Resolves the correct Soroban contract address for a requested Stellar
 * network.  The resolver integrates with a simple in-process contract
 * registry and supports environment-variable overrides for each
 * contract/network pair, allowing zero-downtime address changes via
 * deployment configuration rather than code changes.
 *
 * @example
 * const resolver = new SorobanContractResolver();
 *
 * resolver.register({
 *   contractName: 'bridge_vault',
 *   network: StellarNetwork.TESTNET,
 *   address: 'CATEST...',
 *   envOverrideKey: 'BRIDGE_VAULT_TESTNET_ADDRESS',
 * });
 *
 * const result = resolver.resolve('bridge_vault', StellarNetwork.TESTNET);
 * console.log(result.address); // env override if set, otherwise 'CATEST...'
 */

import {
  StellarNetwork,
  isSupportedNetwork,
} from '../../../config/networks/stellar-networks';
import {
  ContractEntry,
  ResolveOptions,
  ResolveResult,
  UnsupportedNetworkError,
  ContractNotFoundError,
  DuplicateContractError,
} from './soroban-contract-resolver.types';

/** Internal map key format: "<normalised-name>@<network>" */
function registryKey(contractName: string, network: StellarNetwork): string {
  return `${contractName.toLowerCase().trim()}@${network}`;
}

export class SorobanContractResolver {
  private readonly registry = new Map<string, ContractEntry>();

  // ─── Registration ───────────────────────────────────────────────────────

  /**
   * Add a single contract entry to the registry.
   *
   * @throws {UnsupportedNetworkError} if `entry.network` is not a valid
   *   StellarNetwork value.
   * @throws {DuplicateContractError} if a registration for the same
   *   contractName/network pair already exists.
   */
  register(entry: ContractEntry): void {
    this.assertNetworkSupported(entry.network);

    const key = registryKey(entry.contractName, entry.network);
    if (this.registry.has(key)) {
      throw new DuplicateContractError(entry.contractName, entry.network);
    }

    this.registry.set(key, {
      ...entry,
      contractName: entry.contractName.toLowerCase().trim(),
    });
  }

  /**
   * Register multiple entries in a single call.
   * All entries are validated before any are written; on failure the
   * registry is left unchanged.
   *
   * @throws {UnsupportedNetworkError} for any entry with an invalid network.
   * @throws {DuplicateContractError} if any entry would overwrite an
   *   existing registration.
   */
  registerBatch(entries: ContractEntry[]): void {
    // Validate all first so the registry is never partially written
    for (const entry of entries) {
      this.assertNetworkSupported(entry.network);
      const key = registryKey(entry.contractName, entry.network);
      if (this.registry.has(key)) {
        throw new DuplicateContractError(entry.contractName, entry.network);
      }
    }
    for (const entry of entries) {
      this.register(entry);
    }
  }

  /**
   * Update the address (and optionally other fields) for an existing
   * registry entry.  This is intentionally separate from register() so
   * address changes require an explicit decision.
   *
   * @throws {ContractNotFoundError} if the entry does not exist yet.
   */
  update(
    contractName: string,
    network: StellarNetwork,
    changes: Partial<Pick<ContractEntry, 'address' | 'envOverrideKey' | 'description' | 'metadata'>>,
  ): ContractEntry {
    this.assertNetworkSupported(network);
    const key = registryKey(contractName, network);
    const existing = this.registry.get(key);
    if (!existing) {
      throw new ContractNotFoundError(contractName, network);
    }
    const updated: ContractEntry = { ...existing, ...changes };
    this.registry.set(key, updated);
    return updated;
  }

  /**
   * Remove an entry from the registry.
   * Returns true when the entry existed and was removed, false otherwise.
   */
  deregister(contractName: string, network: StellarNetwork): boolean {
    this.assertNetworkSupported(network);
    return this.registry.delete(registryKey(contractName, network));
  }

  // ─── Resolution ─────────────────────────────────────────────────────────

  /**
   * Resolve the contract address for a given name and network.
   *
   * Resolution order:
   *   1. If `entry.envOverrideKey` is set **and** options.ignoreEnvOverride
   *      is false, check `process.env[envOverrideKey]`.  If non-empty, use
   *      that address and set resolvedFromEnv = true.
   *   2. Otherwise return the static address stored in the registry entry.
   *
   * @throws {UnsupportedNetworkError} when `network` is not a recognised
   *   StellarNetwork value.
   * @throws {ContractNotFoundError} when no entry matches the name/network
   *   pair.
   */
  resolve(
    contractName: string,
    network: StellarNetwork,
    options: ResolveOptions = {},
  ): ResolveResult {
    this.assertNetworkSupported(network);

    const key = registryKey(contractName, network);
    const entry = this.registry.get(key);
    if (!entry) {
      throw new ContractNotFoundError(contractName, network);
    }

    let address = entry.address;
    let resolvedFromEnv = false;

    if (!options.ignoreEnvOverride && entry.envOverrideKey) {
      const envValue = process.env[entry.envOverrideKey];
      if (envValue && envValue.trim().length > 0) {
        address = envValue.trim();
        resolvedFromEnv = true;
      }
    }

    return {
      contractName: entry.contractName,
      network,
      address,
      resolvedFromEnv,
      entry,
    };
  }

  /**
   * Resolve all registered contracts for a given network.
   * Contracts with env overrides applied will have resolvedFromEnv = true.
   *
   * @throws {UnsupportedNetworkError} when `network` is invalid.
   */
  resolveAll(network: StellarNetwork, options: ResolveOptions = {}): ResolveResult[] {
    this.assertNetworkSupported(network);

    const results: ResolveResult[] = [];
    for (const entry of this.registry.values()) {
      if (entry.network === network) {
        results.push(this.resolve(entry.contractName, network, options));
      }
    }
    return results;
  }

  // ─── Introspection ───────────────────────────────────────────────────────

  /**
   * Return the raw registry entry for a contract/network pair without
   * applying env overrides.
   */
  getEntry(contractName: string, network: StellarNetwork): ContractEntry | undefined {
    if (!isSupportedNetwork(network)) return undefined;
    return this.registry.get(registryKey(contractName, network));
  }

  /**
   * Return all registered entries, optionally filtered by network.
   */
  listEntries(network?: StellarNetwork): ContractEntry[] {
    const all = Array.from(this.registry.values());
    return network ? all.filter((e) => e.network === network) : all;
  }

  /**
   * Returns true when a registration exists for the given name/network.
   */
  has(contractName: string, network: StellarNetwork): boolean {
    if (!isSupportedNetwork(network)) return false;
    return this.registry.has(registryKey(contractName, network));
  }

  /**
   * Clear all entries (useful in tests).
   */
  clear(): void {
    this.registry.clear();
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private assertNetworkSupported(network: string): asserts network is StellarNetwork {
    if (!isSupportedNetwork(network)) {
      throw new UnsupportedNetworkError(network);
    }
  }
}

/**
 * Default singleton resolver pre-seeded with well-known BridgeWise Soroban
 * contract addresses.
 *
 * Addresses can be overridden at deploy time via the documented environment
 * variables without touching this file.
 */
export const sorobanContractResolver = new SorobanContractResolver();

sorobanContractResolver.registerBatch([
  // ── Bridge Vault ──────────────────────────────────────────────────────
  {
    contractName: 'bridge_vault',
    network: StellarNetwork.MAINNET,
    address: 'CABRIDGE_VAULT_MAINNET_PLACEHOLDER_ADDRESS00000000000000000',
    envOverrideKey: 'SOROBAN_BRIDGE_VAULT_MAINNET_ADDRESS',
    description: 'Primary bridge vault on Stellar Mainnet',
  },
  {
    contractName: 'bridge_vault',
    network: StellarNetwork.TESTNET,
    address: 'CABRIDGE_VAULT_TESTNET_PLACEHOLDER_ADDRESS00000000000000000',
    envOverrideKey: 'SOROBAN_BRIDGE_VAULT_TESTNET_ADDRESS',
    description: 'Bridge vault on Stellar Testnet',
  },
  {
    contractName: 'bridge_vault',
    network: StellarNetwork.FUTURENET,
    address: 'CABRIDGE_VAULT_FUTURENET_PLACEHOLDER_ADDRESS0000000000000000',
    envOverrideKey: 'SOROBAN_BRIDGE_VAULT_FUTURENET_ADDRESS',
    description: 'Bridge vault on Stellar Futurenet',
  },
  {
    contractName: 'bridge_vault',
    network: StellarNetwork.DEVELOPMENT,
    address: 'CABRIDGE_VAULT_DEVELOPMENT_PLACEHOLDER_ADDRESS000000000000000',
    envOverrideKey: 'SOROBAN_BRIDGE_VAULT_DEVELOPMENT_ADDRESS',
    description: 'Bridge vault on local development node',
  },

  // ── Atomic Swap ───────────────────────────────────────────────────────
  {
    contractName: 'atomic_swap',
    network: StellarNetwork.MAINNET,
    address: 'CAATOMIC_SWAP_MAINNET_PLACEHOLDER_ADDRESS000000000000000000',
    envOverrideKey: 'SOROBAN_ATOMIC_SWAP_MAINNET_ADDRESS',
    description: 'Atomic swap contract on Stellar Mainnet',
  },
  {
    contractName: 'atomic_swap',
    network: StellarNetwork.TESTNET,
    address: 'CAATOMIC_SWAP_TESTNET_PLACEHOLDER_ADDRESS000000000000000000',
    envOverrideKey: 'SOROBAN_ATOMIC_SWAP_TESTNET_ADDRESS',
    description: 'Atomic swap contract on Stellar Testnet',
  },
  {
    contractName: 'atomic_swap',
    network: StellarNetwork.FUTURENET,
    address: 'CAATOMIC_SWAP_FUTURENET_PLACEHOLDER_ADDRESS00000000000000000',
    envOverrideKey: 'SOROBAN_ATOMIC_SWAP_FUTURENET_ADDRESS',
    description: 'Atomic swap contract on Stellar Futurenet',
  },
  {
    contractName: 'atomic_swap',
    network: StellarNetwork.DEVELOPMENT,
    address: 'CAATOMIC_SWAP_DEVELOPMENT_PLACEHOLDER_ADDRESS0000000000000000',
    envOverrideKey: 'SOROBAN_ATOMIC_SWAP_DEVELOPMENT_ADDRESS',
    description: 'Atomic swap contract on local development node',
  },
]);

export default sorobanContractResolver;
