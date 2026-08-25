/**
 * Soroban contract interface metadata types.
 *
 * Describes the interface surface of a Soroban smart contract —
 * its spec version, functions, events, and associated errors.
 */

/** Supported Stellar network environments for metadata resolution */
export enum MetadataNetwork {
  TESTNET = 'testnet',
  PUBLIC = 'public',
  FUTURENET = 'futurenet',
  STANDALONE = 'standalone',
}

/** Status of a metadata entry */
export enum MetadataStatus {
  RESOLVED = 'resolved',
  STALE = 'stale',
  UNAVAILABLE = 'unavailable',
  PENDING = 'pending',
  ERROR = 'error',
}

/** A single function spec entry from a Soroban contract spec */
export interface ContractFunctionSpec {
  name: string;
  doc?: string;
  parameters: ContractParameterSpec[];
  returnType?: string;
}

/** A parameter in a contract function spec */
export interface ContractParameterSpec {
  name: string;
  type: string;
  doc?: string;
}

/** An event spec entry from a Soroban contract spec */
export interface ContractEventSpec {
  name: string;
  doc?: string;
  fields: ContractEventFieldSpec[];
}

/** A field in a contract event spec */
export interface ContractEventFieldSpec {
  name: string;
  type: string;
  doc?: string;
}

/** An error spec entry from a Soroban contract spec */
export interface ContractErrorSpec {
  code: number;
  name: string;
  doc?: string;
}

/** Core contract interface metadata resolved from the network or registry */
export interface ContractInterfaceMetadata {
  /** Contract address (C… public key) */
  contractAddress: string;
  /** Network where this metadata was resolved */
  network: MetadataNetwork;
  /** Optional human-readable contract name */
  contractName?: string;
  /** Spec version the contract was compiled with */
  specVersion?: string;
  /** Timestamp when this metadata was first resolved */
  resolvedAt: number;
  /** Timestamp when this metadata should be considered stale */
  expiresAt?: number;
  /** Current status */
  status: MetadataStatus;
  /** Contract function specs */
  functions: ContractFunctionSpec[];
  /** Contract event specs */
  events: ContractEventSpec[];
  /** Contract error specs */
  errors: ContractErrorSpec[];
  /** Arbitrary extra metadata (compiler info, auth requirements, etc.) */
  extra?: Record<string, unknown>;
}

/** Result returned by the metadata resolver */
export interface MetadataResolutionResult {
  contractAddress: string;
  network: MetadataNetwork;
  metadata: ContractInterfaceMetadata | null;
  resolvedAt: number;
  fromCache: boolean;
  error?: string;
}

/** Configuration for the metadata resolver */
export interface MetadataResolverConfig {
  /** Horizon RPC URL for the network */
  rpcUrl: string;
  /** Default cache TTL in milliseconds (default: 5 min) */
  cacheTtlMs?: number;
  /** Maximum retry attempts for network calls (default: 3) */
  maxRetries?: number;
  /** Base delay between retries in ms (default: 1000) */
  retryDelayMs?: number;
  /** Network environment (default: TESTNET) */
  network?: MetadataNetwork;
}

/** Configuration for the metadata cache */
export interface MetadataCacheConfig {
  /** Maximum number of entries (default: 500) */
  maxSize?: number;
  /** Default TTL in milliseconds (default: 300000 — 5 min) */
  defaultTtlMs?: number;
  /** Whether to track access frequency for eviction (default: true) */
  trackAccessFrequency?: boolean;
}

/** Cache statistics */
export interface MetadataCacheStats {
  totalEntries: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
  oldestEntryAge?: number;
  newestEntryAge?: number;
}
