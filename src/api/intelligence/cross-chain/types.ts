/**
 * Types for the Soroban Cross-Chain Intelligence API (#563).
 *
 * Defines the shapes for route, provider, and asset intelligence data
 * along with filter and response wrappers.
 */

export interface RouteIntelligence {
  routeId: string;
  sourceChain: string;
  destinationChain: string;
  bridge: string;
  available: boolean;
  feeUsd: number;
  estimatedTimeSeconds: number;
  reliabilityScore: number;
  minVolume: number;
  maxVolume: number;
}

export interface ProviderIntelligence {
  providerId: string;
  name: string;
  supportedChains: string[];
  supportedAssets: string[];
  reliabilityScore: number;
  averageFeeUsd: number;
  averageTimeSeconds: number;
  totalTransfers: number;
  successRate: number;
}

export interface AssetIntelligence {
  assetId: string;
  symbol: string;
  name: string;
  chains: string[];
  bridgeAvailability: { bridge: string; chain: string; available: boolean }[];
  totalLiquidityUsd: number;
  averageFeeUsd: number;
}

export interface IntelligenceFilter {
  chain?: string;
  token?: string;
  provider?: string;
  bridge?: string;
  sourceChain?: string;
  destinationChain?: string;
  minLiquidity?: number;
  maxFee?: number;
  minReliability?: number;
}

export interface IntelligenceResponse<T> {
  data: T[];
  total: number;
  filtered: number;
  timestamp: number;
}
