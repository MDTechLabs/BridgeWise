export enum LayerZeroChainId {
  ETHEREUM = 101,
  BSC = 102,
  AVALANCHE = 106,
  POLYGON = 109,
  ARBITRUM = 110,
  OPTIMISM = 111,
  FANTOM = 112,
}

export interface LayerZeroConfig {
  endpoint: string;
  chainId: LayerZeroChainId;
  timeout: number;
  maxRetries: number;
}

export interface BridgeRoute {
  sourceChainId: LayerZeroChainId;
  destinationChainId: LayerZeroChainId;
  tokenAddress: string;
}

export interface FeeEstimate {
  nativeFee: string; // in wei
  zroFee: string; // ZRO token fee
  totalFeeUsd?: number;
  estimatedAt: Date;
}

export interface LatencyEstimate {
  estimatedSeconds: number;
  confidence: 'low' | 'medium' | 'high';
  lastUpdated: Date;
}

export interface BridgeEstimate {
  fee: FeeEstimate;
  latency: LatencyEstimate;
  route: BridgeRoute;
}

export interface HealthStatus {
  isHealthy: boolean;
  endpoint: string;
  chainId: LayerZeroChainId;
  latency: number;
  lastChecked: Date;
  errors?: string[];
}

export interface LayerZeroMessage {
  dstChainId: number;
  dstAddress: string;
  payload: string;
  refundAddress: string;
  zroPaymentAddress: string;
  adapterParams: string;
}