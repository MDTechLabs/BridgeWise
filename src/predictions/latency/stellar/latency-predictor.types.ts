export interface RouteLatencyRecord {
  routeId: string;
  durationMs: number;
  executedAt: Date;
  success: boolean;
}

export interface LatencyPrediction {
  routeId: string;
  estimatedMs: number;
  confidence: number; // 0-1
  sampleCount: number;
  predictedAt: Date;
}
