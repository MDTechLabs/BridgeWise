/**
 * Stellar Provider Capability Discovery Types
 *
 * Types for automated discovery, recording, and validation of Stellar bridge
 * provider capabilities.
 *
 * @see Issue #600 — Implement Stellar Provider Capability Discovery
 */

// ─── Core Types ───────────────────────────────────────────────────────────────

/** A capability that a provider may support. */
export interface ProviderCapability {
  /** Unique capability identifier (e.g. "soroban-rpc", "path-payments"). */
  id: string;
  /** Human-readable capability name. */
  name: string;
  /** Longer description of what this capability enables. */
  description: string;
  /** Category this capability falls under. */
  category: CapabilityCategory;
  /** Whether this capability is required for basic operation. */
  required: boolean;
  /** Version or protocol version, if applicable. */
  version?: string;
}

export type CapabilityCategory =
  | 'protocol'
  | 'rpc'
  | 'settlement'
  | 'routing'
  | 'security'
  | 'performance'
  | 'compliance';

/** Recorded capability status for a single provider capability. */
export interface CapabilityRecord {
  /** The capability definition. */
  capability: ProviderCapability;
  /** Whether the provider currently supports this capability. */
  supported: boolean;
  /** When this record was last updated (epoch ms). */
  lastChecked: number;
  /** When this capability was first detected (epoch ms). */
  firstDetected: number;
  /** Additional metadata about the detected capability. */
  metadata?: Record<string, unknown>;
  /** Whether this record has been validated. */
  validated: boolean;
  /** When this record was last validated (epoch ms). */
  lastValidated?: number;
}

/** A provider with its discovered capabilities. */
export interface ProviderCapabilityProfile {
  /** Provider identifier. */
  providerId: string;
  /** Provider display name. */
  providerName: string;
  /** Provider endpoint URL. */
  endpoint: string;
  /** All recorded capabilities for this provider. */
  capabilities: CapabilityRecord[];
  /** When this profile was last updated (epoch ms). */
  lastUpdated: number;
  /** How many capabilities are supported out of total tracked. */
  summary: CapabilitySummary;
}

/** Summary of capability coverage for a provider. */
export interface CapabilitySummary {
  /** Total number of tracked capabilities. */
  total: number;
  /** Number of supported capabilities. */
  supported: number;
  /** Number of unsupported capabilities. */
  unsupported: number;
  /** Number of validated capabilities. */
  validated: number;
  /** Number of required-but-unsupported capabilities (gaps). */
  gaps: number;
}

// ─── Discovery Configuration ──────────────────────────────────────────────────

/** Configuration for the capability discovery service. */
export interface CapabilityDiscoveryConfig {
  /** List of capabilities to track and discover. */
  trackedCapabilities?: ProviderCapability[];
  /** Maximum number of providers allowed. */
  maxProviders?: number;
  /** Injected clock for deterministic testing. */
  now?: () => number;
}

// ─── Discovery & Detection ────────────────────────────────────────────────────

/** Result of a discovery operation. */
export interface CapabilityDiscoveryResult {
  /** Provider ID that was discovered/updated. */
  providerId: string;
  /** Newly detected capabilities. */
  newlyDetected: ProviderCapability[];
  /** Capabilities that were previously supported but are now unsupported. */
  newlyUnsupported: ProviderCapability[];
  /** Capabilities that changed version. */
  versionChanges: Array<{ capability: ProviderCapability; oldVersion?: string; newVersion: string }>;
  /** Total capabilities now supported. */
  totalSupported: number;
  /** Timestamp of the discovery (epoch ms). */
  timestamp: number;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Result of validating a capability record. */
export interface CapabilityValidationResult {
  /** The capability that was validated. */
  capabilityId: string;
  /** Whether the capability is confirmed as valid. */
  valid: boolean;
  /** If invalid, the reason why. */
  reason?: string;
  /** Timestamp of validation (epoch ms). */
  timestamp: number;
}

/** A function that detects capabilities from a provider endpoint. */
export type CapabilityDetector = (
  providerId: string,
  endpoint: string,
) => Promise<ProviderCapability[]>;

/** A function that validates a detected capability. */
export type CapabilityValidator = (
  providerId: string,
  capabilityId: string,
) => Promise<CapabilityValidationResult>;

// ─── Pre-defined Stellar Provider Capabilities ────────────────────────────────

/** Standard Stellar/Soroban bridge provider capabilities. */
export const STELLAR_PROVIDER_CAPABILITIES: ProviderCapability[] = [
  {
    id: 'soroban-rpc',
    name: 'Soroban RPC',
    description: 'Supports Soroban RPC for smart contract interactions',
    category: 'rpc',
    required: true,
  },
  {
    id: 'path-payments',
    name: 'Stellar Path Payments',
    description: 'Supports Stellar path payment operations for asset conversion',
    category: 'protocol',
    required: true,
  },
  {
    id: 'claimable-balances',
    name: 'Claimable Balances',
    description: 'Supports claimable balance operations for atomic transfers',
    category: 'settlement',
    required: false,
  },
  {
    id: 'sponsored-reserves',
    name: 'Sponsored Reserves',
    description: 'Supports sponsored reserve operations to reduce user costs',
    category: 'performance',
    required: false,
  },
  {
    id: 'multi-hop-routing',
    name: 'Multi-Hop Routing',
    description: 'Supports multi-hop route discovery and execution',
    category: 'routing',
    required: false,
  },
  {
    id: 'fee-bump',
    name: 'Fee Bump Transactions',
    description: 'Supports fee bump transactions for flexible fee management',
    category: 'performance',
    required: false,
  },
  {
    id: 'muxed-accounts',
    name: 'Muxed Accounts',
    description: 'Supports multiplexed (M...) accounts',
    category: 'protocol',
    required: false,
  },
  {
    id: 'asset-clawback',
    name: 'Asset Clawback',
    description: 'Supports asset clawback for regulatory compliance',
    category: 'compliance',
    required: false,
  },
  {
    id: 'auth-required',
    name: 'Authorization Required',
    description: 'Supports authorization-required asset flags',
    category: 'security',
    required: false,
  },
  {
    id: 'auth-revocable',
    name: 'Authorization Revocable',
    description: 'Supports authorization-revocable asset flags',
    category: 'security',
    required: false,
  },
];
