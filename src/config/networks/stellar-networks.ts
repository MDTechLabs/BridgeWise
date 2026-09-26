/**
 * File: src/config/networks/stellar-networks.ts
 *
 * Stellar/Soroban network identifiers, configuration types, and per-network
 * defaults. These values are used by SorobanContractResolver to determine
 * which contract address to return for a given network.
 */

/**
 * Canonical identifiers for supported Stellar networks.
 */
export enum StellarNetwork {
  /** Stellar public (main) network */
  MAINNET = 'mainnet',
  /** Stellar testnet — free XLM, resets periodically */
  TESTNET = 'testnet',
  /** Futurenet — preview of upcoming protocol changes */
  FUTURENET = 'futurenet',
  /** Local development / standalone node */
  DEVELOPMENT = 'development',
}

/**
 * Configuration for a specific Stellar network.
 */
export interface StellarNetworkConfig {
  /** Canonical identifier for the network */
  network: StellarNetwork;
  /** Human-readable label */
  label: string;
  /** Network passphrase used for transaction signing */
  networkPassphrase: string;
  /** Default Horizon REST API URL */
  horizonUrl: string;
  /** Default Soroban RPC URL */
  sorobanRpcUrl: string;
  /** Whether this is a production (non-test) environment */
  isProduction: boolean;
}

/**
 * Well-known network passphrases as defined by the Stellar protocol.
 */
export const STELLAR_NETWORK_PASSPHRASES: Record<StellarNetwork, string> = {
  [StellarNetwork.MAINNET]: 'Public Global Stellar Network ; September 2015',
  [StellarNetwork.TESTNET]: 'Test SDF Network ; September 2015',
  [StellarNetwork.FUTURENET]: 'Test SDF Future Network ; October 2022',
  [StellarNetwork.DEVELOPMENT]: 'Standalone Network ; February 2017',
};

/**
 * Default configurations for each supported Stellar network.
 *
 * These can be overridden at runtime via environment variables:
 *   STELLAR_MAINNET_HORIZON_URL
 *   STELLAR_MAINNET_SOROBAN_RPC_URL
 *   STELLAR_TESTNET_HORIZON_URL
 *   STELLAR_TESTNET_SOROBAN_RPC_URL
 *   STELLAR_FUTURENET_HORIZON_URL
 *   STELLAR_FUTURENET_SOROBAN_RPC_URL
 *   STELLAR_DEVELOPMENT_HORIZON_URL
 *   STELLAR_DEVELOPMENT_SOROBAN_RPC_URL
 */
export const DEFAULT_NETWORK_CONFIGS: Record<StellarNetwork, StellarNetworkConfig> = {
  [StellarNetwork.MAINNET]: {
    network: StellarNetwork.MAINNET,
    label: 'Stellar Mainnet',
    networkPassphrase: STELLAR_NETWORK_PASSPHRASES[StellarNetwork.MAINNET],
    horizonUrl:
      process.env.STELLAR_MAINNET_HORIZON_URL ?? 'https://horizon.stellar.org',
    sorobanRpcUrl:
      process.env.STELLAR_MAINNET_SOROBAN_RPC_URL ??
      'https://soroban-rpc.stellar.org',
    isProduction: true,
  },

  [StellarNetwork.TESTNET]: {
    network: StellarNetwork.TESTNET,
    label: 'Stellar Testnet',
    networkPassphrase: STELLAR_NETWORK_PASSPHRASES[StellarNetwork.TESTNET],
    horizonUrl:
      process.env.STELLAR_TESTNET_HORIZON_URL ??
      'https://horizon-testnet.stellar.org',
    sorobanRpcUrl:
      process.env.STELLAR_TESTNET_SOROBAN_RPC_URL ??
      'https://soroban-testnet.stellar.org',
    isProduction: false,
  },

  [StellarNetwork.FUTURENET]: {
    network: StellarNetwork.FUTURENET,
    label: 'Stellar Futurenet',
    networkPassphrase: STELLAR_NETWORK_PASSPHRASES[StellarNetwork.FUTURENET],
    horizonUrl:
      process.env.STELLAR_FUTURENET_HORIZON_URL ??
      'https://horizon-futurenet.stellar.org',
    sorobanRpcUrl:
      process.env.STELLAR_FUTURENET_SOROBAN_RPC_URL ??
      'https://rpc-futurenet.stellar.org',
    isProduction: false,
  },

  [StellarNetwork.DEVELOPMENT]: {
    network: StellarNetwork.DEVELOPMENT,
    label: 'Local Development',
    networkPassphrase: STELLAR_NETWORK_PASSPHRASES[StellarNetwork.DEVELOPMENT],
    horizonUrl:
      process.env.STELLAR_DEVELOPMENT_HORIZON_URL ?? 'http://localhost:8000',
    sorobanRpcUrl:
      process.env.STELLAR_DEVELOPMENT_SOROBAN_RPC_URL ??
      'http://localhost:8000/soroban/rpc',
    isProduction: false,
  },
};

/**
 * Set of all supported network identifiers for fast membership checks.
 */
export const SUPPORTED_NETWORKS = new Set<string>(Object.values(StellarNetwork));

/**
 * Returns true when the provided string is a valid StellarNetwork value.
 */
export function isSupportedNetwork(value: string): value is StellarNetwork {
  return SUPPORTED_NETWORKS.has(value);
}

/**
 * Returns the StellarNetworkConfig for a given network identifier.
 * Throws UnsupportedNetworkError when the network is not recognized.
 */
export function getNetworkConfig(network: StellarNetwork): StellarNetworkConfig {
  const config = DEFAULT_NETWORK_CONFIGS[network];
  if (!config) {
    throw new Error(
      `[getNetworkConfig] Unsupported network: "${network}". ` +
        `Supported: ${[...SUPPORTED_NETWORKS].join(', ')}`,
    );
  }
  return config;
}
