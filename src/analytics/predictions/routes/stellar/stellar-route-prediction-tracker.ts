export interface SorobanRouteForecast {
  predictionId: string;
  routeId: string;
  predictedDurationMs: number;
  predictedFee: number;
  predictedSuccessRate: number;
  predictedAt: Date;
}

export interface SorobanRouteOutcome {
  actualDurationMs: number;
  actualFee: number;
  success: boolean;
  resolvedAt: Date;
}

export interface SorobanPredictionEvaluation {
  forecast: SorobanRouteForecast;
  outcome: SorobanRouteOutcome;
  durationErrorMs: number;
  feeError: number;
  accuracyScore: number;
}

export interface SorobanPredictionMetrics {
  routeId: string;
  accuracyScore: number;
  durationErrorMs: number;
  feeError: number;
  predictionDrift: number;
  totalEvaluated: number;
}

export class SorobanRoutePredictionTracker {
  private readonly forecasts = new Map<string, SorobanRouteForecast>();
  private readonly evaluations: SorobanPredictionEvaluation[] = [];
  
  constructor(private readonly maxEvaluations: number = 10_000) {}

  recordForecast(forecast: SorobanRouteForecast): void {
    if (!forecast.predictionId?.trim()) {
      throw new Error('predictionId must be a non-empty string');
    }
    this.forecasts.set(forecast.predictionId, forecast);
  }

  recordOutcome(predictionId: string, outcome: SorobanRouteOutcome): SorobanPredictionEvaluation {
    const forecast = this.forecasts.get(predictionId);
    if (!forecast) {
      throw new Error(`Forecast not found for predictionId: ${predictionId}`);
    }

    const durationErrorMs = Math.abs(forecast.predictedDurationMs - outcome.actualDurationMs);
    const feeError = Math.abs(forecast.predictedFee - outcome.actualFee);
    
    // A simple accuracy score from 0 to 1 based on relative error
    // For duration: cap at 100% error. For fees: cap at 100% error.
    // Also factor in success prediction.
    const durationAccuracy = Math.max(0, 1 - durationErrorMs / Math.max(forecast.predictedDurationMs, 1));
    const feeAccuracy = Math.max(0, 1 - feeError / Math.max(forecast.predictedFee, 1));
    
    const predictedSuccessBool = forecast.predictedSuccessRate > 0.5;
    const successAccuracy = predictedSuccessBool === outcome.success ? 1 : 0;
    
    // Aggregate score: 40% duration, 40% fee, 20% success prediction
    const accuracyScore = (durationAccuracy * 0.4) + (feeAccuracy * 0.4) + (successAccuracy * 0.2);

    const evaluation: SorobanPredictionEvaluation = {
      forecast,
      outcome,
      durationErrorMs,
      feeError,
      accuracyScore,
    };

    this.evaluations.push(evaluation);
    if (this.evaluations.length > this.maxEvaluations) {
      this.evaluations.splice(0, this.evaluations.length - this.maxEvaluations);
    }

    // Clean up the forecast once resolved to save memory
    this.forecasts.delete(predictionId);

    return evaluation;
  }

  getAccuracyMetrics(routeId: string, windowMs: number = 3600_000): SorobanPredictionMetrics {
    const now = Date.now();
    const routeEvals = this.evaluations.filter(
      (e) => e.forecast.routeId === routeId && (now - e.outcome.resolvedAt.getTime()) <= windowMs
    );

    const totalEvaluated = routeEvals.length;
    if (totalEvaluated === 0) {
      return {
        routeId,
        accuracyScore: 0,
        durationErrorMs: 0,
        feeError: 0,
        predictionDrift: 0,
        totalEvaluated: 0,
      };
    }

    const avgDurationError = routeEvals.reduce((sum, e) => sum + e.durationErrorMs, 0) / totalEvaluated;
    const avgFeeError = routeEvals.reduce((sum, e) => sum + e.feeError, 0) / totalEvaluated;
    const avgAccuracyScore = routeEvals.reduce((sum, e) => sum + e.accuracyScore, 0) / totalEvaluated;

    const predictionDrift = this.calculateDrift(routeEvals);

    return {
      routeId,
      accuracyScore: avgAccuracyScore,
      durationErrorMs: avgDurationError,
      feeError: avgFeeError,
      predictionDrift,
      totalEvaluated,
    };
  }

  private calculateDrift(routeEvals: SorobanPredictionEvaluation[]): number {
    if (routeEvals.length < 4) {
      return 0; // Not enough data to calculate drift
    }

    // Sort chronologically
    const sorted = [...routeEvals].sort(
      (a, b) => a.outcome.resolvedAt.getTime() - b.outcome.resolvedAt.getTime()
    );

    const half = Math.floor(sorted.length / 2);
    const historical = sorted.slice(0, half);
    const recent = sorted.slice(half);

    const historicalError = historical.reduce((sum, e) => sum + (1 - e.accuracyScore), 0) / historical.length;
    const recentError = recent.reduce((sum, e) => sum + (1 - e.accuracyScore), 0) / recent.length;

    // Drift is positive if recent error is higher than historical error (model degradation)
    return recentError - historicalError;
  }

  getEvaluations(): SorobanPredictionEvaluation[] {
    return [...this.evaluations];
  }
}
