import {
  SorobanRouteSnapshotStore,
  type SorobanRouteSnapshotInput,
} from './soroban-route-snapshot-store';

function input(overrides: Partial<SorobanRouteSnapshotInput> = {}): SorobanRouteSnapshotInput {
  return {
    routeId: 'XLM->USDC',
    provider: 'soroban-provider-a',
    sourceChain: 'stellar',
    destinationChain: 'ethereum',
    estimatedFee: 0.5,
    estimatedDurationMs: 30_000,
    capturedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('SorobanRouteSnapshotStore', () => {
  describe('capture / getHistory', () => {
    it('stores a route snapshot', () => {
      const store = new SorobanRouteSnapshotStore();
      store.capture(input());

      const history = store.getHistory('XLM->USDC');
      expect(history).toHaveLength(1);
      expect(history[0].estimatedFee).toBe(0.5);
      expect(history[0].estimatedDurationMs).toBe(30_000);
      expect(history[0].provider).toBe('soroban-provider-a');
    });

    it('defaults capturedAt to current time when omitted', () => {
      const store = new SorobanRouteSnapshotStore();
      const before = Date.now();
      const snapshot = store.capture(input({ capturedAt: undefined }));
      expect(snapshot.capturedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('preserves contractAddress when provided', () => {
      const store = new SorobanRouteSnapshotStore();
      const snapshot = store.capture(input({ contractAddress: 'CABC123' }));
      expect(snapshot.contractAddress).toBe('CABC123');
    });

    it('keeps snapshots ordered chronologically even when inserted out of order', () => {
      const store = new SorobanRouteSnapshotStore();
      store.capture(input({ capturedAt: new Date('2026-01-03T00:00:00Z') }));
      store.capture(input({ capturedAt: new Date('2026-01-01T00:00:00Z') }));
      store.capture(input({ capturedAt: new Date('2026-01-02T00:00:00Z') }));

      const times = store
        .getHistory('XLM->USDC')
        .map((s) => s.capturedAt.toISOString());
      expect(times).toEqual([
        '2026-01-01T00:00:00.000Z',
        '2026-01-02T00:00:00.000Z',
        '2026-01-03T00:00:00.000Z',
      ]);
    });

    it('isolates snapshots per route', () => {
      const store = new SorobanRouteSnapshotStore();
      store.capture(input({ routeId: 'A' }));
      store.capture(input({ routeId: 'B' }));
      store.capture(input({ routeId: 'B' }));

      expect(store.getHistory('A')).toHaveLength(1);
      expect(store.getHistory('B')).toHaveLength(2);
      expect(store.getTrackedRoutes().sort()).toEqual(['A', 'B']);
    });

    it('returns copies so callers cannot mutate stored snapshots', () => {
      const store = new SorobanRouteSnapshotStore();
      store.capture(input());
      const history = store.getHistory('XLM->USDC');
      history[0].estimatedFee = 999;
      expect(store.getHistory('XLM->USDC')[0].estimatedFee).toBe(0.5);
    });

    it('returns empty array for unknown route', () => {
      const store = new SorobanRouteSnapshotStore();
      expect(store.getHistory('UNKNOWN')).toEqual([]);
    });
  });

  describe('historical queries', () => {
    function buildMultiDay(): SorobanRouteSnapshotStore {
      const store = new SorobanRouteSnapshotStore();
      for (let day = 1; day <= 5; day++) {
        store.capture(
          input({ capturedAt: new Date(`2026-01-0${day}T00:00:00Z`) }),
        );
      }
      return store;
    }

    it('filters by date range', () => {
      const store = buildMultiDay();
      const result = store.getHistory('XLM->USDC', {
        from: new Date('2026-01-02T00:00:00Z'),
        to: new Date('2026-01-04T00:00:00Z'),
      });
      expect(result).toHaveLength(3);
    });

    it('limits to the most recent N within range', () => {
      const store = buildMultiDay();
      const result = store.getHistory('XLM->USDC', { limit: 2 });
      expect(result.map((s) => s.capturedAt.toISOString())).toEqual([
        '2026-01-04T00:00:00.000Z',
        '2026-01-05T00:00:00.000Z',
      ]);
    });

    it('returns the latest snapshot', () => {
      const store = buildMultiDay();
      expect(store.getLatest('XLM->USDC')?.capturedAt.toISOString()).toBe(
        '2026-01-05T00:00:00.000Z',
      );
    });

    it('returns null for getLatest on unknown route', () => {
      const store = new SorobanRouteSnapshotStore();
      expect(store.getLatest('UNKNOWN')).toBeNull();
    });
  });

  describe('getTrend', () => {
    it('returns null when there are no snapshots in range', () => {
      const store = new SorobanRouteSnapshotStore();
      expect(store.getTrend('UNKNOWN')).toBeNull();
    });

    it('aggregates fee and duration statistics', () => {
      const store = new SorobanRouteSnapshotStore();
      store.capture(input({ estimatedFee: 0.2, estimatedDurationMs: 10_000, capturedAt: new Date('2026-01-01T00:00:00Z') }));
      store.capture(input({ estimatedFee: 0.6, estimatedDurationMs: 50_000, capturedAt: new Date('2026-01-02T00:00:00Z') }));
      store.capture(input({ estimatedFee: 1.0, estimatedDurationMs: 30_000, capturedAt: new Date('2026-01-03T00:00:00Z') }));

      const trend = store.getTrend('XLM->USDC');
      expect(trend).not.toBeNull();
      expect(trend!.sampleCount).toBe(3);
      expect(trend!.averageFee).toBeCloseTo((0.2 + 0.6 + 1.0) / 3);
      expect(trend!.minFee).toBe(0.2);
      expect(trend!.maxFee).toBe(1.0);
      expect(trend!.averageDurationMs).toBeCloseTo((10_000 + 50_000 + 30_000) / 3);
      expect(trend!.minDurationMs).toBe(10_000);
      expect(trend!.maxDurationMs).toBe(50_000);
    });

    it('reports trend window boundaries', () => {
      const store = new SorobanRouteSnapshotStore();
      store.capture(input({ capturedAt: new Date('2026-01-01T00:00:00Z') }));
      store.capture(input({ capturedAt: new Date('2026-01-03T00:00:00Z') }));

      const trend = store.getTrend('XLM->USDC');
      expect(trend!.from?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(trend!.to?.toISOString()).toBe('2026-01-03T00:00:00.000Z');
    });

    it('detects a rising fee trend', () => {
      const store = new SorobanRouteSnapshotStore();
      [0.1, 0.2, 0.8, 1.0].forEach((fee, i) =>
        store.capture(input({ estimatedFee: fee, capturedAt: new Date(`2026-01-0${i + 1}T00:00:00Z`) })),
      );
      expect(store.getTrend('XLM->USDC')!.feeTrend).toBe('rising');
    });

    it('detects a falling fee trend', () => {
      const store = new SorobanRouteSnapshotStore();
      [1.0, 0.8, 0.2, 0.1].forEach((fee, i) =>
        store.capture(input({ estimatedFee: fee, capturedAt: new Date(`2026-01-0${i + 1}T00:00:00Z`) })),
      );
      expect(store.getTrend('XLM->USDC')!.feeTrend).toBe('falling');
    });

    it('reports stable fee trend for flat values', () => {
      const store = new SorobanRouteSnapshotStore();
      [0.5, 0.5, 0.5, 0.5].forEach((fee, i) =>
        store.capture(input({ estimatedFee: fee, capturedAt: new Date(`2026-01-0${i + 1}T00:00:00Z`) })),
      );
      expect(store.getTrend('XLM->USDC')!.feeTrend).toBe('stable');
    });

    it('detects a rising duration trend', () => {
      const store = new SorobanRouteSnapshotStore();
      [5_000, 10_000, 40_000, 60_000].forEach((ms, i) =>
        store.capture(input({ estimatedDurationMs: ms, capturedAt: new Date(`2026-01-0${i + 1}T00:00:00Z`) })),
      );
      expect(store.getTrend('XLM->USDC')!.durationTrend).toBe('rising');
    });

    it('detects a falling duration trend', () => {
      const store = new SorobanRouteSnapshotStore();
      [60_000, 40_000, 10_000, 5_000].forEach((ms, i) =>
        store.capture(input({ estimatedDurationMs: ms, capturedAt: new Date(`2026-01-0${i + 1}T00:00:00Z`) })),
      );
      expect(store.getTrend('XLM->USDC')!.durationTrend).toBe('falling');
    });

    it('respects query filters when computing trends', () => {
      const store = new SorobanRouteSnapshotStore();
      store.capture(input({ estimatedFee: 5.0, capturedAt: new Date('2026-01-01T00:00:00Z') }));
      store.capture(input({ estimatedFee: 0.5, capturedAt: new Date('2026-01-02T00:00:00Z') }));
      store.capture(input({ estimatedFee: 0.5, capturedAt: new Date('2026-01-03T00:00:00Z') }));

      const trend = store.getTrend('XLM->USDC', { from: new Date('2026-01-02T00:00:00Z') });
      expect(trend!.sampleCount).toBe(2);
      expect(trend!.averageFee).toBeCloseTo(0.5);
    });
  });

  describe('retention and eviction', () => {
    it('evicts oldest snapshots beyond maxSnapshotsPerRoute', () => {
      const store = new SorobanRouteSnapshotStore({ maxSnapshotsPerRoute: 3 });
      for (let i = 0; i < 5; i++) {
        store.capture(input({ capturedAt: new Date(2026, 0, 1, 0, 0, i) }));
      }
      const history = store.getHistory('XLM->USDC');
      expect(history).toHaveLength(3);
      expect(history[0].capturedAt.getSeconds()).toBe(2);
    });

    it('prunes snapshots older than the retention window on write', () => {
      const store = new SorobanRouteSnapshotStore({ retentionMs: 60_000 });
      const now = Date.now();
      store.capture(input({ capturedAt: new Date(now - 120_000) }));
      store.capture(input({ capturedAt: new Date(now) }));
      expect(store.getHistory('XLM->USDC')).toHaveLength(1);
    });
  });

  describe('clearing', () => {
    it('clears a single route', () => {
      const store = new SorobanRouteSnapshotStore();
      store.capture(input({ routeId: 'A' }));
      store.capture(input({ routeId: 'B' }));
      expect(store.clearRoute('A')).toBe(true);
      expect(store.getHistory('A')).toHaveLength(0);
      expect(store.getHistory('B')).toHaveLength(1);
    });

    it('returns false when clearing a route with no snapshots', () => {
      const store = new SorobanRouteSnapshotStore();
      expect(store.clearRoute('UNKNOWN')).toBe(false);
    });

    it('clears all routes', () => {
      const store = new SorobanRouteSnapshotStore();
      store.capture(input({ routeId: 'A' }));
      store.capture(input({ routeId: 'B' }));
      store.clear();
      expect(store.getTrackedRoutes()).toHaveLength(0);
    });
  });
});
