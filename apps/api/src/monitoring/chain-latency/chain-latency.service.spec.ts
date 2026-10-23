import { BadRequestException } from '@nestjs/common';
import { ChainLatencyService, percentile } from './chain-latency.service';
import {
  MAX_SAMPLES_PER_CHAIN,
  MAX_TRACKED_CHAINS,
  MAX_WINDOW_MS,
  MIN_WINDOW_MS,
  RETENTION_MS,
} from './chain-latency.constants';

describe('ChainLatencyService', () => {
  let service: ChainLatencyService;
  const NOW = 1_700_000_000_000;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    service = new ChainLatencyService();
  });

  afterEach(() => jest.useRealTimers());

  describe('percentile', () => {
    it('uses nearest-rank', () => {
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      expect(percentile(values, 50)).toBe(50);
      expect(percentile(values, 95)).toBe(95);
      expect(percentile(values, 99)).toBe(99);
    });

    it('handles empty and single-element input', () => {
      expect(percentile([], 95)).toBe(0);
      expect(percentile([42], 99)).toBe(42);
    });
  });

  describe('record validation', () => {
    it.each([-1, NaN, Infinity])('rejects latency %p', (bad) => {
      expect(() => service.record('stellar', bad)).toThrow(BadRequestException);
    });

    it.each(['', 'has space', 'Bad/Chain', '-lead', 'x'.repeat(33)])(
      'rejects chain id %p',
      (bad) => {
        expect(() => service.record(bad, 10)).toThrow(BadRequestException);
      },
    );

    it('normalises chain case and whitespace', () => {
      service.record('  Stellar ', 10);
      expect(service.getTrackedChains()).toEqual(['stellar']);
    });

    it('accepts zero latency', () => {
      expect(() => service.record('stellar', 0)).not.toThrow();
    });

    it('caps the number of tracked chains', () => {
      for (let i = 0; i < MAX_TRACKED_CHAINS; i++) service.record(`chain${i}`, 1);
      expect(() => service.record('overflow', 1)).toThrow(BadRequestException);
      expect(() => service.record('chain0', 1)).not.toThrow();
    });

    it('evicts the oldest samples beyond the per-chain cap', () => {
      for (let i = 0; i < MAX_SAMPLES_PER_CHAIN + 10; i++) service.record('evm', 1);
      const dash = service.getChainDashboard('evm', MAX_WINDOW_MS);
      expect(dash.sampleCount).toBe(MAX_SAMPLES_PER_CHAIN);
    });
  });

  describe('window validation', () => {
    it.each([MIN_WINDOW_MS - 1, MAX_WINDOW_MS + 1, NaN])('rejects window %p', (w) => {
      expect(() => service.getOverview(w)).toThrow(BadRequestException);
    });

    it('accepts the boundary windows', () => {
      expect(() => service.getOverview(MIN_WINDOW_MS)).not.toThrow();
      expect(() => service.getOverview(MAX_WINDOW_MS)).not.toThrow();
    });

    it('rejects invalid bucket counts', () => {
      service.record('stellar', 5);
      expect(() => service.getChainDashboard('stellar', undefined, 0)).toThrow(BadRequestException);
      expect(() => service.getChainDashboard('stellar', undefined, 61)).toThrow(BadRequestException);
      expect(() => service.getChainDashboard('stellar', undefined, 1.5)).toThrow(BadRequestException);
    });
  });

  describe('dashboard', () => {
    it('computes percentiles, error rate and last sample', () => {
      for (let i = 1; i <= 10; i++) {
        service.record('stellar', i * 100, { success: i !== 10 });
      }
      const d = service.getChainDashboard('stellar');
      expect(d.sampleCount).toBe(10);
      expect(d.errorCount).toBe(1);
      expect(d.errorRate).toBe(0.1);
      expect(d.latency).toMatchObject({ min: 100, max: 1000, avg: 550, p50: 500, p95: 1000 });
      expect(d.lastSampleAt).toBe(new Date(NOW).toISOString());
    });

    it('excludes samples outside the window', () => {
      service.record('stellar', 9999, { timestamp: NOW - 2 * 60 * 60 * 1000 });
      service.record('stellar', 10);
      const d = service.getChainDashboard('stellar', 60 * 60 * 1000);
      expect(d.sampleCount).toBe(1);
      expect(d.latency?.max).toBe(10);
    });

    it('reports no_data when everything is outside the window', () => {
      service.record('stellar', 10, { timestamp: NOW - 2 * 60 * 60 * 1000 });
      const d = service.getChainDashboard('stellar', 60 * 60 * 1000);
      expect(d.status).toBe('no_data');
      expect(d.latency).toBeNull();
      expect(d.lastSampleAt).toBeNull();
    });

    it('builds a histogram whose counts sum to the sample count', () => {
      [50, 100, 101, 600, 20000].forEach((ms) => service.record('evm', ms));
      const { histogram, sampleCount } = service.getChainDashboard('evm');
      expect(histogram.reduce((a, b) => a + b.count, 0)).toBe(sampleCount);
      expect(histogram[0]).toEqual({ leMs: 100, count: 2 });
      expect(histogram[histogram.length - 1]).toEqual({ leMs: null, count: 1 });
    });

    it('builds a time series with the requested bucket count', () => {
      service.record('evm', 100);
      service.record('evm', 300, { timestamp: NOW - 59 * 60 * 1000 });
      const { timeSeries } = service.getChainDashboard('evm', 60 * 60 * 1000, 6);
      expect(timeSeries).toHaveLength(6);
      expect(timeSeries.reduce((a, b) => a + b.count, 0)).toBe(2);
      expect(timeSeries[0].count).toBe(1);
      expect(timeSeries[5].count).toBe(1);
      expect(timeSeries[2].avgMs).toBeNull();
    });

    it('breaks down by operation', () => {
      service.record('evm', 100, { operation: 'getBlock' });
      service.record('evm', 300, { operation: 'getBlock' });
      service.record('evm', 50, { operation: 'sendTx' });
      const { byOperation } = service.getChainDashboard('evm');
      expect(byOperation.getBlock).toEqual({ count: 2, avgMs: 200, p95Ms: 300 });
      expect(byOperation.sendTx.count).toBe(1);
    });
  });

  describe('status classification', () => {
    it('is healthy for fast, reliable chains', () => {
      for (let i = 0; i < 20; i++) service.record('fast', 200);
      expect(service.getChainDashboard('fast').status).toBe('healthy');
    });

    it('is degraded when p95 exceeds the healthy threshold', () => {
      for (let i = 0; i < 20; i++) service.record('slow', 3000);
      expect(service.getChainDashboard('slow').status).toBe('degraded');
    });

    it('is degraded on elevated error rate', () => {
      for (let i = 0; i < 10; i++) service.record('flaky', 100, { success: i >= 1 });
      expect(service.getChainDashboard('flaky').status).toBe('degraded');
    });

    it('is unhealthy past the degraded thresholds', () => {
      for (let i = 0; i < 20; i++) service.record('bad', 8000);
      expect(service.getChainDashboard('bad').status).toBe('unhealthy');
      for (let i = 0; i < 10; i++) service.record('down', 100, { success: false });
      expect(service.getChainDashboard('down').status).toBe('unhealthy');
    });
  });

  describe('overview', () => {
    it('is empty with no data', () => {
      const o = service.getOverview();
      expect(o.chains).toEqual([]);
      expect(o.totals).toEqual({ chains: 0, sampleCount: 0, unhealthyChains: 0, degradedChains: 0 });
    });

    it('orders chains worst-first and totals them', () => {
      service.record('good', 100);
      service.record('bad', 9000);
      service.record('meh', 3000);
      const o = service.getOverview();
      expect(o.chains.map((c) => c.chain)).toEqual(['bad', 'meh', 'good']);
      expect(o.totals).toMatchObject({ chains: 3, sampleCount: 3, unhealthyChains: 1, degradedChains: 1 });
    });
  });

  describe('track', () => {
    it('records successful operations', async () => {
      await expect(service.track('stellar', async () => 'ok', 'rpc')).resolves.toBe('ok');
      const d = service.getChainDashboard('stellar');
      expect(d.sampleCount).toBe(1);
      expect(d.errorCount).toBe(0);
    });

    it('records failures and rethrows the original error', async () => {
      const err = new Error('boom');
      await expect(service.track('stellar', async () => { throw err; })).rejects.toBe(err);
      expect(service.getChainDashboard('stellar').errorCount).toBe(1);
    });
  });

  describe('prune', () => {
    it('removes expired samples and empty chains', () => {
      service.record('old', 1, { timestamp: NOW - RETENTION_MS - 1 });
      service.record('fresh', 1);
      expect(service.prune(NOW)).toBe(1);
      expect(service.getTrackedChains()).toEqual(['fresh']);
    });
  });
});
