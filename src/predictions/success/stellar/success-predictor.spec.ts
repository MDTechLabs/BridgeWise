import {
  clearHistory,
  predictSuccess,
  recordRouteHistory,
} from './success-predictor';
import { RouteHistory } from './types';

function sampleRecord(overrides: Partial<RouteHistory> = {}): RouteHistory {
  return {
    routeId: 'stellar-ethereum-01',
    totalTransfers: 100,
    successfulTransfers: 95,
    failedTransfers: 5,
    averageAmountUsd: 1000,
    lastExecutedAt: new Date(),
    bridgeName: 'StellarBridge',
    sourceChain: 'stellar',
    destinationChain: 'ethereum',
    ...overrides,
  };
}

beforeEach(() => clearHistory());

describe('Stellar Transfer Success Predictor', () => {
  it('returns null when no history exists for the route', () => {
    expect(predictSuccess('unknown-route')).toBeNull();
  });

  it('returns a prediction for a route with history', () => {
    recordRouteHistory(sampleRecord());
    const result = predictSuccess('stellar-ethereum-01');
    expect(result).not.toBeNull();
    expect(result!.routeId).toBe('stellar-ethereum-01');
    expect(result!.probability).toBeGreaterThan(0);
    expect(result!.probability).toBeLessThanOrEqual(1);
    expect(result!.sampleSize).toBe(100);
    expect(result!.predictedAt).toBeInstanceOf(Date);
  });

  it('calculates high probability for a reliable route', () => {
    recordRouteHistory(sampleRecord({ successfulTransfers: 99, totalTransfers: 100 }));
    const result = predictSuccess('stellar-ethereum-01');
    expect(result!.probability).toBeGreaterThan(0.85);
    expect(result!.confidence).toBe('high');
  });

  it('assigns low confidence with fewer than 5 samples', () => {
    recordRouteHistory(
      sampleRecord({ totalTransfers: 2, successfulTransfers: 2 }),
    );
    expect(predictSuccess('stellar-ethereum-01')!.confidence).toBe('low');
  });

  it('assigns medium confidence with 5-19 samples', () => {
    recordRouteHistory(
      sampleRecord({ totalTransfers: 10, successfulTransfers: 8 }),
    );
    expect(predictSuccess('stellar-ethereum-01')!.confidence).toBe('medium');
  });

  it('assigns high confidence with 20+ samples', () => {
    recordRouteHistory(
      sampleRecord({ totalTransfers: 25, successfulTransfers: 23 }),
    );
    expect(predictSuccess('stellar-ethereum-01')!.confidence).toBe('high');
  });

  it('factors volume risk for large transfers', () => {
    recordRouteHistory(
      sampleRecord({
        totalTransfers: 30,
        successfulTransfers: 28,
        averageAmountUsd: 100000,
      }),
    );
    const result = predictSuccess('stellar-ethereum-01');
    expect(result!.factors.volumeRiskFactor).toBeLessThan(0.5);
  });

  it('factors volume risk for small transfers', () => {
    recordRouteHistory(
      sampleRecord({
        totalTransfers: 30,
        successfulTransfers: 28,
        averageAmountUsd: 10,
      }),
    );
    const result = predictSuccess('stellar-ethereum-01');
    expect(result!.factors.volumeRiskFactor).toBeGreaterThan(0.9);
  });

  it('includes all required success factors', () => {
    recordRouteHistory(sampleRecord());
    const result = predictSuccess('stellar-ethereum-01');
    expect(result!.factors).toMatchObject({
      historicalSuccessRate: expect.any(Number),
      routeReliabilityScore: expect.any(Number),
      bridgeHealthScore: expect.any(Number),
      volumeRiskFactor: expect.any(Number),
      timeBasedFactor: expect.any(Number),
    });
  });

  it('generates a recommendation', () => {
    recordRouteHistory(sampleRecord());
    const result = predictSuccess('stellar-ethereum-01');
    expect(result!.recommendation).toBeTruthy();
    expect(typeof result!.recommendation).toBe('string');
  });

  it('generates a cautious recommendation for low probability', () => {
    recordRouteHistory(
      sampleRecord({
        totalTransfers: 30,
        successfulTransfers: 5,
        averageAmountUsd: 100000,
      }),
    );
    const result = predictSuccess('stellar-ethereum-01');
    expect(result!.probability).toBeLessThan(0.5);
    expect(result!.recommendation.toLowerCase()).toContain('low');
  });

  it('isolates predictions per route', () => {
    recordRouteHistory(sampleRecord({ routeId: 'route-A', totalTransfers: 50, successfulTransfers: 48 }));
    recordRouteHistory(sampleRecord({ routeId: 'route-B', totalTransfers: 50, successfulTransfers: 20 }));
    const a = predictSuccess('route-A')!;
    const b = predictSuccess('route-B')!;
    expect(a.probability).toBeGreaterThan(b.probability);
  });

  it('clearHistory resets the state', () => {
    recordRouteHistory(sampleRecord());
    expect(predictSuccess('stellar-ethereum-01')).not.toBeNull();
    clearHistory();
    expect(predictSuccess('stellar-ethereum-01')).toBeNull();
  });

  it('handles zero total transfers gracefully', () => {
    recordRouteHistory(sampleRecord({ totalTransfers: 0, successfulTransfers: 0 }));
    expect(predictSuccess('stellar-ethereum-01')).toBeNull();
  });
});
