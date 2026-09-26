/**
 * Types for Soroban Bridge Discovery Service
 * @see Issue #511 — Implement Soroban Bridge Discovery Service
 */

export type BridgeProviderStatus = 'active' | 'inactive' | 'degraded';

export interface SorobanBridgeProviderMetadata {
  /** Unique provider identifier */
  id: string;
  /** Human-readable provider name */
  name: string;
  /** Soroban contract address or RPC endpoint for the bridge */
  endpoint: string;
  /** Current operational status */
  status: BridgeProviderStatus;
  /** Asset codes supported by this bridge (e.g. ["USDC", "XLM"]) */
  supportedAssets: string[];
  /** Unix timestamp (ms) when provider was registered */
  registeredAt: number;
}

/** Raw input for registering a provider (without server-set fields) */
export type BridgeProviderInput = Omit<
  SorobanBridgeProviderMetadata,
  'registeredAt'
>;

export interface BridgeProviderValidationResult {
  providerId: string;
  isValid: boolean;
  issues: string[];
}

export interface BridgeDiscoveryResult {
  discovered: number;
  registered: number;
  skipped: number;
}

export interface BridgeDiscoveryConfig {
  /** Maximum number of providers to hold in registry. Default 100. */
  maxProviders?: number;
  /** Injected clock for deterministic testing. Defaults to Date.now. */
  now?: () => number;
}
