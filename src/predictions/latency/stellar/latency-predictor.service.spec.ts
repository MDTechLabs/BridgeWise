import { clearHistory, predictLatency, recordLatency } from './latency-predictor.service';

beforeEach(() => clearHistory());

describe('predictLatency', () => {
  it('returns null when no history exists for route', () => {
    expect(predictLatency('route-1')).toBeNull();
  });

  it('returns null when only failed records exist', () => {
    recordLatency({ routeId: 'route-1', durationMs: 500, executedAt: new Date(), success: false });
    expect(predictLatency('route-1')).toBeNull();
  });

  it('returns a prediction for a route with successful records', () => {
    recordLatency({ routeId: 'route-1', durationMs: 400, executedAt: new Date(), success: true });
    recordLatency({ routeId: 'route-1', durationMs: 600, executedAt: new Date(), success: true });

    const result = predictLatency('route-1');
    expect(result).not.toBeNull();
    expect(result!.routeId).toBe('route-1');
    expect(result!.estimatedMs).toBeGreaterThan(0);
    expect(result!.sampleCount).toBe(2);
  });

  it('assigns low confidence with fewer than 3 samples', () => {
    recordLatency({ routeId: 'route-1', durationMs: 500, executedAt: new Date(), success: true });
    expect(predictLatency('route-1')!.confidence).toBe(0.3);
  });

  it('assigns medium confidence with 3-9 samples', () => {
    for (let i = 0; i < 5; i++) {
      recordLatency({ routeId: 'route-1', durationMs: 300 + i * 10, executedAt: new Date(), success: true });
    }
    expect(predictLatency('route-1')!.confidence).toBe(0.6);
  });

  it('assigns high confidence with 10+ samples', () => {
    for (let i = 0; i < 10; i++) {
      recordLatency({ routeId: 'route-1', durationMs: 200 + i * 5, executedAt: new Date(), success: true });
    }
    expect(predictLatency('route-1')!.confidence).toBe(0.9);
  });

  it('isolates predictions per route', () => {
    recordLatency({ routeId: 'route-A', durationMs: 100, executedAt: new Date(), success: true });
    recordLatency({ routeId: 'route-B', durationMs: 1000, executedAt: new Date(), success: true });

    const a = predictLatency('route-A')!;
    const b = predictLatency('route-B')!;
    expect(a.estimatedMs).toBeLessThan(b.estimatedMs);
  });
});
