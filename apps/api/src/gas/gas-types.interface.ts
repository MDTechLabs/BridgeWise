export interface BlockFeeSample {
  blockNumber: number;
  baseFee: bigint;
  priorityFee: bigint;
  timestamp: number;
}

export interface SorobanResourceFee {
  instructions: string;
  readBytes: string;
  writeBytes: string;
  totalFee: string;
}

export interface VolatilityMetrics {
  standardDeviation: number;
  mean: number;
  coefficientOfVariation: number;
  isVolatile: boolean;
}

export interface GasEstimateResponse {
  baseFee: string;
  priorityFee: string;
  totalGasEstimate: string;
  suggestedGas: string;
  buffer: number;
  chain: string;
  isVolatile: boolean;
  volatilityMetrics?: VolatilityMetrics;
  timestamp: number;
}

