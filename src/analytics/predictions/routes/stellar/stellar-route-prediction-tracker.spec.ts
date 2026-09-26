import {
  SorobanRoutePredictionTracker,
  SorobanRouteForecast,
  SorobanRouteOutcome,
} from './stellar-route-prediction-tracker';

describe('SorobanRoutePredictionTracker', () => {
  let tracker: SorobanRoutePredictionTracker;

  beforeEach(() => {
    tracker = new SorobanRoutePredictionTracker();
  });

  it('should store and evaluate a perfect forecast correctly', () => {
    const forecast: SorobanRouteForecast = {
      predictionId: 'pred-1',
      routeId: 'route-a',
      predictedDurationMs: 1000,
      predictedFee: 10,
      predictedSuccessRate: 0.9,
      predictedAt: new Date(Date.now() - 10000),
    };

    const outcome: SorobanRouteOutcome = {
      actualDurationMs: 1000,
      actualFee: 10,
      success: true,
      resolvedAt: new Date(),
    };

    tracker.recordForecast(forecast);
    const evalResult = tracker.recordOutcome('pred-1', outcome);

    expect(evalResult.accuracyScore).toBe(1);
    expect(evalResult.durationErrorMs).toBe(0);
    expect(evalResult.feeError).toBe(0);

    const metrics = tracker.getAccuracyMetrics('route-a');
    expect(metrics.totalEvaluated).toBe(1);
    expect(metrics.accuracyScore).toBe(1);
  });

  it('should calculate prediction drift when errors increase over time', () => {
    const routeId = 'route-b';
    const now = Date.now();

    // Historical predictions (highly accurate)
    for (let i = 0; i < 5; i++) {
      tracker.recordForecast({
        predictionId: `hist-${i}`,
        routeId,
        predictedDurationMs: 1000,
        predictedFee: 10,
        predictedSuccessRate: 0.9,
        predictedAt: new Date(now - 10000),
      });
      tracker.recordOutcome(`hist-${i}`, {
        actualDurationMs: 1000, // 0 error
        actualFee: 10, // 0 error
        success: true,
        resolvedAt: new Date(now - 5000 + i), // slight offset to order
      });
    }

    // Recent predictions (inaccurate)
    for (let i = 0; i < 5; i++) {
      tracker.recordForecast({
        predictionId: `rec-${i}`,
        routeId,
        predictedDurationMs: 1000,
        predictedFee: 10,
        predictedSuccessRate: 0.9,
        predictedAt: new Date(now - 2000),
      });
      tracker.recordOutcome(`rec-${i}`, {
        actualDurationMs: 2000, // 1000ms error (100%)
        actualFee: 20, // 10 fee error (100%)
        success: true,
        resolvedAt: new Date(now - 1000 + i),
      });
    }

    const metrics = tracker.getAccuracyMetrics(routeId);
    
    // Historical error was ~0 (accuracy 1)
    // Recent error is high (duration error 100%, fee error 100% -> accuracy drops)
    // Recent accuracy should be around 0.2 (only success matched)
    // Drift = recentError - historicalError = (1 - 0.2) - (1 - 1) = 0.8
    expect(metrics.predictionDrift).toBeGreaterThan(0.5);
    expect(metrics.predictionDrift).toBeCloseTo(0.8, 1);
  });

  it('should throw error when recording outcome for unknown prediction', () => {
    expect(() => {
      tracker.recordOutcome('unknown-pred', {
        actualDurationMs: 1000,
        actualFee: 10,
        success: true,
        resolvedAt: new Date(),
      });
    }).toThrow('Forecast not found for predictionId: unknown-pred');
  });

  it('should handle zero metrics correctly', () => {
    const metrics = tracker.getAccuracyMetrics('empty-route');
    expect(metrics.totalEvaluated).toBe(0);
    expect(metrics.accuracyScore).toBe(0);
    expect(metrics.predictionDrift).toBe(0);
  });
});
