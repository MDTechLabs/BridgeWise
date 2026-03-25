/**
 * Bridge Configuration and Metadata Interface
 *
 * Defines bridge capabilities, supported chains, and metadata
 */

import { ChainId, BridgeProvider } from '../types';

/**
 * Bridge capabilities and features
 */
export interface BridgeCapabilities {
  /** Bridge supports atomic swaps */
  atomicSwaps: boolean;
  /** Bridge supports multi-hop routing */
  multiHop: boolean;
  /** Bridge requires recipient address */
  requiresRecipient: boolean;
  /** Bridge supports custom slippage configuration */
  supportsSlippageConfig: boolean;
  /** Bridge supports fee estimation */
  canEstimateFees: boolean;
  /** Bridge supports token mapping */
  hasTokenMapping: boolean;
  /** Maximum number of hops supported */
  maxHops?: number;
}

/**
 * Bridge provider metadata
 */
export interface AdapterMetadata {
  /** Provider name */
  name: string;
  /** Provider version */
  version: string;
  /** Provider description */
  description: string;
  /** Documentation URL */
  docsUrl?: string;
  /** API documentation URL */
  apiDocsUrl?: string;
  /** Support contact */
  support?: {
    email?: string;
    discord?: string;
    telegram?: string;
    twitter?: string;
    website?: string;
  };
  /** Last updated timestamp */
  lastUpdated: number;
}

/**
 * Chain support information for a bridge
 */
export interface ChainSupport {
  /** Chain identifier */
  chain: ChainId;
  /** Is this chain supported */
  supported: boolean;
  /** RPC endpoint for this chain (if applicable) */
  rpcUrl?: string;
  /** Native token symbol */
  nativeToken?: string;
  /** Chain-specific configuration */
  config?: Record<string, unknown>;
}

/**
 * Complete bridge configuration
 */
export interface BridgeConfig {
  /** Bridge provider identifier */
  provider: BridgeProvider;
  /** Bridge metadata */
  metadata: AdapterMetadata;
  /** Bridge capabilities */
  capabilities: BridgeCapabilities;
  /** List of supported chains */
  chains: ChainSupport[];
  /** Supported chain pairs (if empty, all combinations are supported) */
  supportedPairs?: Array<{
    source: ChainId;
    destination: ChainId;
  }>;
  /** Supported tokens per chain */
  supportedTokens?: Record<ChainId, string[]>;
  /** Fee structure configuration */
  fees?: {
    /** Standard fee percentage */
    standardFee: number;
    /** Partner/referral fee */
    partnerFee?: number;
    /** Minimum fee amount */
    minFee?: string;
    /** Maximum fee amount */
    maxFee?: string;
  };
  /** Bridge-specific settings */
  settings?: Record<string, unknown>;
}
