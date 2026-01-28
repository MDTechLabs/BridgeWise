export enum NetworkType {
  STELLAR = 'stellar',
  LAYERZERO = 'layerzero',
  HOP = 'hop',
}

export interface FeeLevel {
  slow: string;
  standard: string;
  fast: string;
}

export interface TimeEstimate {
  slow: number; // milliseconds
  standard: number;
  fast: number;
}

export interface FeeEstimate {
  network: NetworkType;
  available: boolean;
  fees: FeeLevel;
  currency: string;
  estimatedTime: TimeEstimate;
  lastUpdated: number;
  error?: string;
  additionalData?: Record<string, any>;
}

export interface NormalizedFeeData {
  timestamp: number;
  networks: {
    stellar: FeeEstimate;
    layerzero: FeeEstimate;
    hop: FeeEstimate;
  };
  metadata: {
    successfulProviders: number;
    totalProviders: number;
  };
}

// Adapter response interfaces
export interface StellarFeeResponse {
  min: string;
  mode: string;
  p10: string;
  p20: string;
  p30: string;
  p40: string;
  p50: string;
  p60: string;
  p70: string;
  p80: string;
  p90: string;
  p95: string;
  p99: string;
  decimals: number;
  symbol: string;
}

export interface LayerZeroFeeResponse {
  baseFee: string;
  standardFee: string;
  priorityFee: string;
  decimals: number;
  symbol: string;
  sourceChain: string;
  destinationChain: string;
}

export interface HopFeeResponse {
  lpFee: string;
  bonderFee: string;
  destinationTxFee: string;
  decimals: number;
  symbol: string;
  token: string;
  sourceChain: string;
  destinationChain: string;
  // New fields for enhanced route normalization
  estimatedReceived?: string;
  amountOutMin?: string;
  gasEstimate?: string;
  deadline?: number;
}