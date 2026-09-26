/**
 * Types for the Stellar Transfer Success Predictor (#484).
 *
 * Defines the shapes for success predictions, route history,
 * prediction results, and contributing success factors.
 */

export interface RouteHistory {
  routeId: string;
  totalTransfers: number;
  successfulTransfers: number;
  failedTransfers: number;
  averageAmountUsd: number;
  lastExecutedAt: Date;
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
}

export interface SuccessFactors {
  historicalSuccessRate: number;
  routeReliabilityScore: number;
  bridgeHealthScore: number;
  volumeRiskFactor: number;
  timeBasedFactor: number;
}

export interface PredictionResult {
  routeId: string;
  probability: number;
  confidence: 'low' | 'medium' | 'high';
  factors: SuccessFactors;
  recommendation: string;
  sampleSize: number;
  predictedAt: Date;
}

export interface SuccessPrediction {
  routeId: string;
  probability: number;
  confidence: 'low' | 'medium' | 'high';
  factors: SuccessFactors;
  recommendation: string;
  sampleSize: number;
  predictedAt: Date;
}
