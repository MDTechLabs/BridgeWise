import {
  RouteHealthHistoryTracker,
  type RouteHealthSample,
} from '../route-health-history';

function sample(overrides: Partial<RouteHealthSample> = {}): RouteHealthSample {
  return {
    routeId: 'XLM->USDC',
    status: 'healthy',
    availability: 1,
    latencyMs: 100,
    recordedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('RouteHealthHistoryTracker', () => {
  describe('record / getHistory', () => {
    it('stores health metrics for a route', () => {
      const tracker = new RouteHealthHistoryTracker();
      tracker.record(sample());

      const history = tracker.getHistory('XLM->USDC');
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('healthy');
      expect(history[0].availability).toBe(1);
    });

    it('defaults recordedAt to now when omitted', () => {
      const tracker = new RouteHealthHistoryTracker();
      const before = Date.now();
      const snapshot = tracker.record(sample({ recordedAt: undefined }));
      expect(snapshot.recordedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('clamps availability into the [0, 1] range', () => {
      const tracker = new RouteHealthHistoryTracker();
      expect(tracker.record(sample({ availability: 2 })).availability).toBe(1);
      expect(tracker.record(sample({ availability: -1 })).availability).toBe(0);
      expect(tracker.record(sample({ availability: NaN })).availability).toBe(0);
    });

    it('keeps snapshots ordered chronologically even when inserted out of order', () => {
      const tracker = new RouteHealthHistoryTracker();
      tracker.record(sample({ recordedAt: new Date('2026-01-03T00:00:00Z') }));
      tracker.record(sample({ recordedAt: new Date('2026-01-01T00:00:00Z') }));
      tracker.record(sample({ recordedAt: new Date('2026-01-02T00:00:00Z') }));

      const times = tracker
        .getHistory('XLM->USDC')
        .map((s) => s.recordedAt.toISOString());
      expect(times).toEqual([
        '2026-01-01T00:00:00.000Z',
        '2026-01-02T00:00:00.000Z',
        '2026-01-03T00:00:00.000Z',
      ]);
    });

    it('isolates history per route', () => {
      const tracker = new RouteHealthHistoryTracker();
      tracker.record(sample({ routeId: 'A' }));
      tracker.record(sample({ routeId: 'B' }));
      tracker.record(sample({ routeId: 'B' }));

      expect(tracker.getHistory('A')).toHaveLength(1);
      expect(tracker.getHistory('B')).toHaveLength(2);
      expect(tracker.getTrackedRoutes().sort()).toEqual(['A', 'B']);
    });
  });

  describe('history queries', () => {
    const build = () => {
      const tracker = new RouteHealthHistoryTracker();
      for (let day = 1; day <= 5; day++) {
        tracker.record(
          sample({
            recordedAt: new Date(`2026-01-0${day}T00:00:00Z`),
          }),
        );
      }
      return tracker;
    };

    it('filters by date range', () => {
      const tracker = build();
      const result = tracker.getHistory('XLM->USDC', {
        from: new Date('2026-01-02T00:00:00Z'),
        to: new Date('2026-01-04T00:00:00Z'),
      });
      expect(result).toHaveLength(3);
    });

    it('limits to the most recent N within range', () => {
      const tracker = build();
      const result = tracker.getHistory('XLM->USDC', { limit: 2 });
      expect(result.map((s) => s.recordedAt.toISOString())).toEqual([
        '2026-01-04T00:00:00.000Z',
        '2026-01-05T00:00:00.000Z',
      ]);
    });

    it('returns latest snapshot', () => {
      const tracker = build();
      expect(tracker.getLatest('XLM->USDC')?.recordedAt.toISOString()).toBe(
        '2026-01-05T00:00:00.000Z',
      );
      expect(tracker.getLatest('missing')).toBeNull();
    });

    it('returns copies so callers cannot mutate stored snapshots', () => {
      const tracker = build();
      const history = tracker.getHistory('XLM->USDC');
      history[0].availability = 0.5;
      expect(tracker.getHistory('XLM->USDC')[0].availability).toBe(1);
    });
  });

  describe('getTrend', () => {
    it('returns null when there is no history in range', () => {
      const tracker = new RouteHealthHistoryTracker();
      expect(tracker.getTrend('missing')).toBeNull();
    });

    it('aggregates availability, latency and status distribution', () => {
      const tracker = new RouteHealthHistoryTracker();
      tracker.record(
        sample({
          status: 'healthy',
          availability: 1,
          latencyMs: 100,
          recordedAt: new Date('2026-01-01T00:00:00Z'),
        }),
      );
      tracker.record(
        sample({
          status: 'degraded',
          availability: 0.6,
          latencyMs: 300,
          recordedAt: new Date('2026-01-02T00:00:00Z'),
        }),
      );
      tracker.record(
        sample({
          status: 'outage',
          availability: 0,
          latencyMs: undefined,
          recordedAt: new Date('2026-01-03T00:00:00Z'),
        }),
      );

      const trend = tracker.getTrend('XLM->USDC');
      expect(trend).not.toBeNull();
      expect(trend!.sampleCount).toBe(3);
      expect(trend!.averageAvailability).toBeCloseTo((1 + 0.6 + 0) / 3);
      expect(trend!.minAvailability).toBe(0);
      expect(trend!.maxAvailability).toBe(1);
      // Only two snapshots had latency recorded.
      expect(trend!.averageLatencyMs).toBeCloseTo(200);
      expect(trend!.uptimeRatio).toBeCloseTo(1 / 3);
      expect(trend!.currentStatus).toBe('outage');
      expect(trend!.statusDistribution).toEqual({
        healthy: 1,
        degraded: 1,
        unhealthy: 0,
        outage: 1,
      });
    });

    it('reports null average latency when no snapshot has latency', () => {
      const tracker = new RouteHealthHistoryTracker();
      tracker.record(sample({ latencyMs: undefined }));
      expect(tracker.getTrend('XLM->USDC')!.averageLatencyMs).toBeNull();
    });

    it('detects an improving availability trend', () => {
      const tracker = new RouteHealthHistoryTracker();
      const avails = [0.2, 0.3, 0.9, 1];
      avails.forEach((availability, i) =>
        tracker.record(
          sample({
            availability,
            recordedAt: new Date(`2026-01-0${i + 1}T00:00:00Z`),
          }),
        ),
      );
      expect(tracker.getTrend('XLM->USDC')!.availabilityTrend).toBe('improving');
    });

    it('detects a declining availability trend', () => {
      const tracker = new RouteHealthHistoryTracker();
      const avails = [1, 0.9, 0.3, 0.1];
      avails.forEach((availability, i) =>
        tracker.record(
          sample({
            availability,
            recordedAt: new Date(`2026-01-0${i + 1}T00:00:00Z`),
          }),
        ),
      );
      expect(tracker.getTrend('XLM->USDC')!.availabilityTrend).toBe('declining');
    });

    it('reports a stable trend for flat availability', () => {
      const tracker = new RouteHealthHistoryTracker();
      [1, 1, 1, 1].forEach((availability, i) =>
        tracker.record(
          sample({
            availability,
            recordedAt: new Date(`2026-01-0${i + 1}T00:00:00Z`),
          }),
        ),
      );
      expect(tracker.getTrend('XLM->USDC')!.availabilityTrend).toBe('stable');
    });
  });

  describe('compareRoutes', () => {
    const build = () => {
      const tracker = new RouteHealthHistoryTracker();
      // Route A: perfect availability.
      tracker.record(sample({ routeId: 'A', availability: 1, latencyMs: 200 }));
      tracker.record(sample({ routeId: 'A', availability: 1, latencyMs: 200 }));
      // Route B: degraded.
      tracker.record(
        sample({ routeId: 'B', status: 'degraded', availability: 0.5, latencyMs: 100 }),
      );
      // Route C: same availability as A but slower → should rank below A.
      tracker.record(sample({ routeId: 'C', availability: 1, latencyMs: 500 }));
      return tracker;
    };

    it('ranks routes by availability, then uptime, then latency', () => {
      const tracker = build();
      const ranked = tracker.compareRoutes();
      expect(ranked.map((r) => r.routeId)).toEqual(['A', 'C', 'B']);
      expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
    });

    it('compares only the requested routes', () => {
      const tracker = build();
      const ranked = tracker.compareRoutes(['B', 'C']);
      expect(ranked.map((r) => r.routeId)).toEqual(['C', 'B']);
    });

    it('omits routes with no snapshots in range', () => {
      const tracker = build();
      const ranked = tracker.compareRoutes(['A', 'unknown']);
      expect(ranked.map((r) => r.routeId)).toEqual(['A']);
    });
  });

  describe('retention and bounds', () => {
    it('evicts oldest snapshots beyond maxSnapshotsPerRoute', () => {
      const tracker = new RouteHealthHistoryTracker({ maxSnapshotsPerRoute: 3 });
      for (let i = 0; i < 5; i++) {
        tracker.record(
          sample({ recordedAt: new Date(2026, 0, 1, 0, 0, i) }),
        );
      }
      const history = tracker.getHistory('XLM->USDC');
      expect(history).toHaveLength(3);
      expect(history[0].recordedAt.getSeconds()).toBe(2);
    });

    it('prunes snapshots older than the retention window on write', () => {
      const tracker = new RouteHealthHistoryTracker({ retentionMs: 60_000 });
      const now = Date.now();
      tracker.record(sample({ recordedAt: new Date(now - 120_000) }));
      tracker.record(sample({ recordedAt: new Date(now) }));
      expect(tracker.getHistory('XLM->USDC')).toHaveLength(1);
    });
  });

  describe('clearing', () => {
    it('clears a single route', () => {
      const tracker = new RouteHealthHistoryTracker();
      tracker.record(sample({ routeId: 'A' }));
      tracker.record(sample({ routeId: 'B' }));
      expect(tracker.clearRoute('A')).toBe(true);
      expect(tracker.getHistory('A')).toHaveLength(0);
      expect(tracker.getHistory('B')).toHaveLength(1);
    });

    it('clears all routes', () => {
      const tracker = new RouteHealthHistoryTracker();
      tracker.record(sample({ routeId: 'A' }));
      tracker.record(sample({ routeId: 'B' }));
      tracker.clear();
      expect(tracker.getTrackedRoutes()).toHaveLength(0);
    });
  });
});
