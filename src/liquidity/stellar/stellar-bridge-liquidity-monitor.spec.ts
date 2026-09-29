import {
  StellarBridgeLiquidityMonitor,
  StellarLiquiditySnapshot,
  StellarLiquidityProviderConfig,
} from './stellar-bridge-liquidity-monitor';

describe('StellarBridgeLiquidityMonitor', () => {
  let monitor: StellarBridgeLiquidityMonitor;

  const createMockProvider = (
    name: string,
    availableAmount: string,
    totalAmount?: string,
  ): StellarLiquidityProviderConfig => ({
    name,
    fetchFn: async (asset: string): Promise<StellarLiquiditySnapshot> => ({
      provider: name,
      asset,
      availableAmount,
      totalAmount: totalAmount ?? availableAmount,
      sourceChain: 'stellar',
      destinationChain: 'ethereum',
      timestamp: Date.now(),
      status: 'active',
    }),
    cacheTtlMs: 1000,
  });

  beforeEach(() => {
    monitor = new StellarBridgeLiquidityMonitor({
      refreshIntervalMs: 30000,
      cacheTtlMs: 1000,
      thresholds: [
        { asset: 'USDC', lowThreshold: '50000', criticalThreshold: '10000' },
        { asset: 'XLM', lowThreshold: '100000', criticalThreshold: '25000' },
      ],
    });
  });

  afterEach(() => {
    monitor.stopMonitoring();
    monitor.removeAllListeners();
  });

  describe('Provider Registration', () => {
    it('should register providers via constructor', () => {
      const m = new StellarBridgeLiquidityMonitor({
        providers: [createMockProvider('test-provider', '100000')],
      });

      expect(m.getRegisteredProviders()).toContain('test-provider');
    });

    it('should register additional providers after construction', () => {
      monitor.registerProvider(createMockProvider('dynamic-provider', '50000'));

      expect(monitor.getRegisteredProviders()).toContain('dynamic-provider');
    });

    it('should unregister providers and clear their cached data', async () => {
      monitor.registerProvider(
        createMockProvider('temp-provider', '100000'),
      );

      // Fetch to populate cache
      await monitor.getLiquidity({ asset: 'USDC', provider: 'temp-provider' });

      const removed = monitor.unregisterProvider('temp-provider');
      expect(removed).toBe(true);

      // Provider should no longer be registered
      expect(monitor.getRegisteredProviders()).not.toContain('temp-provider');

      // Attempting to unregister again returns false
      expect(monitor.unregisterProvider('temp-provider')).toBe(false);
    });
  });

  describe('Liquidity Fetching', () => {
    it('should fetch liquidity from registered providers', async () => {
      monitor.registerProvider(createMockProvider('provider-a', '100000'));

      const results = await monitor.getLiquidity({
        asset: 'USDC',
        provider: 'provider-a',
      });

      expect(results).toHaveLength(1);
      expect(results[0].provider).toBe('provider-a');
      expect(results[0].availableAmount).toBe('100000');
      expect(results[0].asset).toBe('USDC');
    });

    it('should return cached data when available and fresh', async () => {
      const fetchFn = jest.fn().mockResolvedValue({
        provider: 'cached-provider',
        asset: 'USDC',
        availableAmount: '75000',
        totalAmount: '75000',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        timestamp: Date.now(),
        status: 'active',
      } as StellarLiquiditySnapshot);

      monitor.registerProvider({
        name: 'cached-provider',
        fetchFn,
        cacheTtlMs: 60000,
      });

      // First call — should invoke fetchFn
      await monitor.getLiquidity({ asset: 'USDC', provider: 'cached-provider' });
      expect(fetchFn).toHaveBeenCalledTimes(1);

      // Second call — should use cache
      await monitor.getLiquidity({ asset: 'USDC', provider: 'cached-provider' });
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('should not use stale cache when provider fetch fails', async () => {
      const fetchFn = jest
        .fn()
        .mockResolvedValueOnce({
          provider: 'flaky-provider',
          asset: 'USDC',
          availableAmount: '50000',
          totalAmount: '50000',
          sourceChain: 'stellar',
          destinationChain: 'ethereum',
          timestamp: Date.now(),
          status: 'active',
        } as StellarLiquiditySnapshot)
        .mockRejectedValueOnce(new Error('Network error'));

      monitor.registerProvider({
        name: 'flaky-provider',
        fetchFn,
        cacheTtlMs: 100, // short TTL so we can test stale cache quickly
      });

      // First call — succeeds
      await monitor.getLiquidity({ asset: 'USDC', provider: 'flaky-provider' });

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Second call — stale cache is not eligible for routing decisions.
      const results = await monitor.getLiquidity({
        asset: 'USDC',
        provider: 'flaky-provider',
      });

      expect(results).toHaveLength(0);
    }, 10000);

    it('rejects provider snapshots with stale or future timestamps', async () => {
      monitor.registerProvider({
        name: 'stale-provider',
        fetchFn: async (asset) => ({
          provider: 'stale-provider',
          asset,
          availableAmount: '100000',
          totalAmount: '100000',
          sourceChain: 'stellar',
          destinationChain: 'ethereum',
          timestamp: Date.now() - 5000,
        }),
        maxSnapshotAgeMs: 1000,
      });

      const stale = await monitor.getLiquidity({
        asset: 'USDC',
        provider: 'stale-provider',
      });
      expect(stale).toHaveLength(0);

      monitor.registerProvider({
        name: 'future-provider',
        fetchFn: async (asset) => ({
          provider: 'future-provider',
          asset,
          availableAmount: '100000',
          totalAmount: '100000',
          sourceChain: 'stellar',
          destinationChain: 'ethereum',
          timestamp: Date.now() + 5000,
        }),
      });
      const future = await monitor.getLiquidity({
        asset: 'USDC',
        provider: 'future-provider',
      });
      expect(future).toHaveLength(0);
    });
  });

  describe('Liquidity Fetching - all providers', () => {
    it('should fetch from all providers when no specific provider is given', async () => {
      monitor.registerProvider(createMockProvider('provider-x', '100000'));
      monitor.registerProvider(createMockProvider('provider-y', '200000'));

      const results = await monitor.getLiquidity({ asset: 'USDC' });

      expect(results).toHaveLength(2);
      const amounts = results.map((r) => r.availableAmount);
      expect(amounts).toContain('100000');
      expect(amounts).toContain('200000');
    });
  });

  describe('Threshold Evaluation', () => {
    it('should emit low liquidity alert when below low threshold', async () => {
      const alerts: string[] = [];
      monitor.on('alert', (event) => {
        alerts.push(`${event.level}:${event.asset}`);
      });

      monitor.registerProvider(createMockProvider('low-provider', '30000'));

      await monitor.getLiquidity({ asset: 'USDC', provider: 'low-provider' });

      expect(alerts).toContain('low:USDC');
    });

    it('should emit depleted alert when below critical threshold', async () => {
      const alerts: string[] = [];
      monitor.on('depleted', (event) => {
        alerts.push(`${event.level}:${event.asset}`);
      });

      monitor.registerProvider(createMockProvider('empty-provider', '5000'));

      await monitor.getLiquidity({ asset: 'USDC', provider: 'empty-provider' });

      expect(alerts).toContain('critical:USDC');
    });

    it('should emit recovered alert when liquidity returns to healthy', async () => {
      const recoveredAlerts: string[] = [];
      monitor.on('recovered', (event) => {
        recoveredAlerts.push(event.provider);
      });

      let currentAmount = '30000';
      const adjustableProvider: StellarLiquidityProviderConfig = {
        name: 'adjustable',
        fetchFn: async (asset: string) => ({
          provider: 'adjustable',
          asset,
          availableAmount: currentAmount,
          totalAmount: '200000',
          sourceChain: 'stellar',
          destinationChain: 'ethereum',
          timestamp: Date.now(),
          status: 'active',
        }),
        cacheTtlMs: 0, // never cache
      };

      monitor.registerProvider(adjustableProvider);

      // Fetch low liquidity
      await monitor.getLiquidity({ asset: 'USDC', provider: 'adjustable' });

      // Now raise liquidity back to healthy
      currentAmount = '100000';
      await monitor.getLiquidity({ asset: 'USDC', provider: 'adjustable' });

      expect(recoveredAlerts).toContain('adjustable');
    });

    it('should not emit duplicate alerts when already in low state', async () => {
      const lowAlerts: string[] = [];
      monitor.on('low', (event) => {
        lowAlerts.push(event.provider);
      });

      let currentAmount = '30000';
      const adjustableProvider: StellarLiquidityProviderConfig = {
        name: 'still-low',
        fetchFn: async (asset: string) => ({
          provider: 'still-low',
          asset,
          availableAmount: currentAmount,
          totalAmount: '50000',
          sourceChain: 'stellar',
          destinationChain: 'ethereum',
          timestamp: Date.now(),
          status: 'active',
        }),
        cacheTtlMs: 0,
      };

      monitor.registerProvider(adjustableProvider);

      // First fetch — emits low
      await monitor.getLiquidity({ asset: 'USDC', provider: 'still-low' });
      expect(lowAlerts).toHaveLength(1);

      // Second fetch — still low, cacheTtlMs=0 forces re-fetch
      await monitor.getLiquidity({ asset: 'USDC', provider: 'still-low' });
      expect(lowAlerts).toHaveLength(1);
    });
  });

  describe('Threshold Management', () => {
    it('should get configured thresholds', () => {
      const thresholds = monitor.getThresholds();
      expect(thresholds).toHaveLength(2);
      expect(thresholds.find((t) => t.asset === 'USDC')?.lowThreshold).toBe(
        '50000',
      );
    });

    it('should set and update thresholds', () => {
      monitor.setThreshold({
        asset: 'USDC',
        lowThreshold: '100000',
        criticalThreshold: '25000',
      });

      const updated = monitor.getThresholds().find((t) => t.asset === 'USDC');
      expect(updated?.lowThreshold).toBe('100000');

      // Add new threshold
      monitor.setThreshold({
        asset: 'BTC',
        lowThreshold: '10',
        criticalThreshold: '2',
      });

      expect(monitor.getThresholds()).toHaveLength(3);
    });

    it('should remove thresholds', () => {
      expect(monitor.removeThreshold('USDC')).toBe(true);
      expect(monitor.getThresholds()).toHaveLength(1);
      expect(monitor.removeThreshold('NONEXISTENT')).toBe(false);
    });
  });

  describe('Query Helpers', () => {
    it('should return low liquidity providers for an asset', async () => {
      monitor.registerProvider(createMockProvider('good', '100000'));
      monitor.registerProvider(createMockProvider('bad', '30000'));

      await monitor.getLiquidity({ asset: 'USDC' });

      const lowProviders = monitor.getLowLiquidityProviders('USDC');
      expect(lowProviders).toHaveLength(1);
      expect(lowProviders[0].provider).toBe('bad');
    });

    it('should return status summary', async () => {
      monitor.registerProvider(createMockProvider('ok-provider', '100000'));
      monitor.registerProvider(createMockProvider('low-provider', '30000'));

      await monitor.getLiquidity({ asset: 'USDC' });

      const summary = monitor.getStatusSummary();
      expect(summary.USDC).toBeDefined();
      expect(summary.USDC.providers).toBe(2);
      expect(summary.USDC.low).toBe(1);
      expect(summary.USDC.depleted).toBe(0);
    });
  });

  describe('Cache Management', () => {
    it('should invalidate cache for a specific provider and asset', async () => {
      const fetchFn = jest.fn().mockResolvedValue({
        provider: 'cache-test',
        asset: 'USDC',
        availableAmount: '75000',
        totalAmount: '75000',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        timestamp: Date.now(),
        status: 'active',
      } as StellarLiquiditySnapshot);

      monitor.registerProvider({
        name: 'cache-test',
        fetchFn,
        cacheTtlMs: 60000,
      });

      await monitor.getLiquidity({ asset: 'USDC', provider: 'cache-test' });
      expect(fetchFn).toHaveBeenCalledTimes(1);

      monitor.invalidateCache('cache-test', 'USDC');

      await monitor.getLiquidity({ asset: 'USDC', provider: 'cache-test' });
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it('should clear entire cache', async () => {
      const fetchFn = jest.fn().mockResolvedValue({
        provider: 'clear-test',
        asset: 'USDC',
        availableAmount: '75000',
        totalAmount: '75000',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        timestamp: Date.now(),
        status: 'active',
      } as StellarLiquiditySnapshot);

      monitor.registerProvider({
        name: 'clear-test',
        fetchFn,
        cacheTtlMs: 60000,
      });

      await monitor.getLiquidity({ asset: 'USDC', provider: 'clear-test' });
      expect(fetchFn).toHaveBeenCalledTimes(1);

      monitor.clearCache();

      await monitor.getLiquidity({ asset: 'USDC', provider: 'clear-test' });
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Polling', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start and stop periodic monitoring', () => {
      expect(monitor.isMonitoring).toBe(false);

      monitor.startMonitoring();
      expect(monitor.isMonitoring).toBe(true);

      monitor.stopMonitoring();
      expect(monitor.isMonitoring).toBe(false);
    });

    it('should refresh all liquidity on interval', async () => {
      const refreshSpy = jest.spyOn(monitor, 'refreshAll');

      monitor.startMonitoring();
      // Should have been called once immediately
      expect(refreshSpy).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(30000);
      expect(refreshSpy).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(30000);
      expect(refreshSpy).toHaveBeenCalledTimes(3);

      monitor.stopMonitoring();
    });

    it('should handle refreshAll with no providers gracefully', async () => {
      await expect(monitor.refreshAll()).resolves.not.toThrow();
    });

    it('should populate cache via getAllLiquidity', async () => {
      monitor.registerProvider(createMockProvider('full-provider', '100000'));

      const results = await monitor.getAllLiquidity();

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.provider === 'full-provider')).toBe(true);
    });
  });
});
