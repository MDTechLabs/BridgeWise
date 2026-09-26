/**
 * Tests for StellarRouteDiscoveryCache
 *
 * Comprehensive test suite covering:
 * - Basic cache operations (set, get, has)
 * - TTL expiration and stale entry handling
 * - LRU eviction
 * - Background cleanup
 * - Invalidation strategies
 * - Cache statistics
 * - Edge cases and error handling
 */

import {
  StellarRouteDiscoveryCache,
  buildRouteDiscoveryKey,
  buildRouteKey,
  type RouteDiscoveryCacheEntry,
} from './stellar-route-discovery-cache';
import type {
  BridgeRoute,
  AssetChain,
} from '../../../matrix/assets/routes/stellar/types';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

const createMockRoute = (
  overrides: Partial<BridgeRoute> = {},
): BridgeRoute => ({
  id: 'stellar-ethereum-allbridge-usdc',
  fromChain: 'stellar',
  toChain: 'ethereum',
  bridgeProtocol: 'Allbridge',
  provider: 'allbridge',
  supportedAssets: ['USDC'],
  estimatedTimeMinutes: 15,
  status: 'active',
  available: true,
  ...overrides,
});

const createMockTime = () => {
  let currentTime = 1000000;
  return {
    now: () => currentTime,
    advance: (ms: number) => {
      currentTime += ms;
    },
    getTime: () => currentTime,
  };
};

describe('StellarRouteDiscoveryCache', () => {
  let mockTime: ReturnType<typeof createMockTime>;

  beforeEach(() => {
    mockTime = createMockTime();
  });

  // ─── Basic Operations ─────────────────────────────────────────────────────

  describe('set and get', () => {
    it('stores and retrieves a single route', async () => {
      const cache = new StellarRouteDiscoveryCache({ now: mockTime.now });
      const route = createMockRoute();

      cache.set('test-key', route);
      const retrieved = await cache.get('test-key');

      expect(retrieved).toEqual(route);
    });

    it('stores and retrieves multiple routes', async () => {
      const cache = new StellarRouteDiscoveryCache({ now: mockTime.now });
      const routes = [createMockRoute(), createMockRoute({ id: 'route-2' })];

      cache.set('test-key', routes);
      const retrieved = await cache.get('test-key');

      expect(retrieved).toEqual(routes);
      expect(Array.isArray(retrieved)).toBe(true);
    });

    it('returns null for non-existent key', async () => {
      const cache = new StellarRouteDiscoveryCache({ now: mockTime.now });
      const result = await cache.get('non-existent');
      expect(result).toBeNull();
    });

    it('overwrites existing entries', async () => {
      const cache = new StellarRouteDiscoveryCache({ now: mockTime.now });
      const route1 = createMockRoute();
      const route2 = createMockRoute({ id: 'updated-route' });

      cache.set('test-key', route1);
      cache.set('test-key', route2);
      const retrieved = await cache.get('test-key');

      expect(retrieved).toEqual(route2);
    });

    it('supports custom TTL per entry', async () => {
      const cache = new StellarRouteDiscoveryCache({
        now: mockTime.now,
        defaultTtlMs: 60000,
      });

      cache.set('short-ttl', createMockRoute(), { ttlMs: 5000 });
      cache.set('long-ttl', createMockRoute(), { ttlMs: 120000 });

      mockTime.advance(10000);

      // Short TTL should be expired
      expect(await cache.get('short-ttl')).toBeNull();
      // Long TTL should still be valid
      expect(await cache.get('long-ttl')).not.toBeNull();
    });

    it('supports metadata storage', async () => {
      const cache = new StellarRouteDiscoveryCache({ now: mockTime.now });
      const route = createMockRoute();

      cache.set('test-key', route, {
        metadata: {
          discoverySource: 'provider-api',
          version: '1.0.0',
        },
      });

      const entry = cache.peek('test-key');
      expect(entry?.metadata?.discoverySource).toBe('provider-api');
      expect(entry?.metadata?.version).toBe('1.0.0');
    });
  });

  describe('getSync', () => {
    it('retrieves entries synchronously', () => {
      const cache = new StellarRouteDiscoveryCache({ now: mockTime.now });
      const route = createMockRoute();

      cache.set('test-key', route);
      const retrieved = cache.getSync('test-key');

      expect(retrieved).toEqual(route);
    });

    it('does not trigger stale callbacks', () => {
      const staleCallback = jest.fn();
      const cache = new StellarRouteDiscoveryCache({
        now: mockTime.now,
        defaultTtlMs: 10000,
        staleThresholdPercent: 0.5,
        onStale: staleCallback,
      });

      cache.set('test-key', createMockRoute());
      mockTime.advance(6000); // Past stale threshold

      const result = cache.getSync('test-key');
      expect(result).not.toBeNull();
      expect(staleCallback).not.toHaveBeenCalled();
    });
  });

  // ─── Expiration and Staleness ──────────────────────────────────────────────

  describe('expiration', () => {
    it('expires entries after TTL', async () => {
      const cache = new StellarRouteDiscoveryCache({
        now: mockTime.now,
        defaultTtlMs: 10000,
      });

      cache.set('test-key', createMockRoute());
      expect(await cache.get('test-key')).not.toBeNull();

      mockTime.advance(11000); // Past TTL
      expect(await cache.get('test-key')).toBeNull();
    });

    it('removes expired entries on access', async () => {
      const cache = new StellarRouteDiscoveryCache({
        now: mockTime.now,
        defaultTtlMs: 10000,
      });

      cache.set('test-key', createMockRoute());
      mockTime.advance(11000);

      await cache.get('test-key');
      expect(cache.size).toBe(0);
    });

    it('uses default TTL when not specified', async () => {
      const cache = new StellarRouteDiscoveryCache({
        now: mockTime.now,
        defaultTtlMs: 5000,
      });

      cache.set('test-key', createMockRoute());
      mockTime.advance(6000);

      expect(await cache.get('test-key')).toBeNull();
    });
  });

  describe('staleness', () => {
    it('detects stale entries before expiration', async () => {
      const staleCallback = jest.fn();
      const cache = new StellarRouteDiscoveryCache({
        now: mockTime.now,
        defaultTtlMs: 10000,
        staleThresholdPercent: 0.5,
        onStale: staleCallback,
      });

      cache.set('test-key', createMockRoute());
      mockTime.advance(6000); // Past stale (5000ms) but not expired (10000ms)

      const result = await cache.get('test-key');
      expect(result).not.toBeNull();
      expect(staleCallback).toHaveBeenCalledWith('test-key', expect.anything());
    });

    it('continues to return stale entries', async () => {
      const cache = new StellarRouteDiscoveryCache({
        now: mockTime.now,
        defaultTtlMs: 10000,
        staleThresholdPercent: 0.5,
      });

      cache.set('test-key', createMockRoute());
      mockTime.advance(6000);

      const result = await cache.get('test-key');
      expect(result).not.toBeNull();
    });

    it('handles stale callback errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const cache = new StellarRouteDiscoveryCache({
        now: mockTime.now,
        defaultTtlMs: 10000,
        staleThresholdPercent: 0.5,
        onStale: async () => {
          throw new Error('Stale callback failed');
        },
      });

      cache.set('test-key', createMockRoute());
      mockTime.advance(6000);

      const result = await cache.get('test-key');
      expect(result).not.toBeNull();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  // ─── LRU Eviction ──────────────────────────────────────────────────────────

  describe('LRU eviction', () => {
    it('evicts oldest entry when cache is full', async () => {
      const cache = new StellarRouteDiscoveryCache({
        now: mockTime.now,
        maxEntries: 3,
      });

      cache.set('key-1', createMockRoute({ id: 'route-1' }));
      mockTime.advance(1000);
      cache.set('key-2', createMockRoute({ id: 'route-2' }));
      mockTime.advance(1000);
      cache.set('key-3', createMockRoute({ id: 'route-3' }));

      // Cache is full, adding new entry should evict key-1
      cache.set('key-4', createMockRoute({ id: 'route-4' }));

      expect(await cache.get('key-1')).toBeNull();
      expect(await cache.get('key-2')).not.toBeNull();
      expect(await cache.get('key-3')).not.toBeNull();
      expect(await cache.get('key-4')).not.toBeNull();
    });

    it('does not evict when updating existing key', async () => {
      const cache = new StellarRouteDiscoveryCache({
        now: mockTime.now,
        maxEntries: 2,
      });

      cache.set('key-1', createMockRoute({ id: 'route-1' }));
      cache.set('key-2', createMockRoute({ id: 'route-2' }));

      // Update key-1 (should not trigger eviction)
      cache.set('key-1', createMockRoute({ id: 'route-1-updated' }));

      expect(await cache.get('key-1')).not.toBeNull();
      expect(await cache.get('key-2')).not.toBeNull();
      expect(cache.size).toBe(2);
    });

    it('evicts least recently used entry', async () => {
      const cache = new StellarRouteDiscoveryCache({
        now: mockTime.now,
        maxEntries: 3,
      });

      cache.set('key-1', createMockRoute({ id: 'route-1' }));
      mockTime.advance(1000);
      cache.set('key-2', createMockRoute({ id: 'route-2' }));
      mockTime.advance(1000);
      cache.set('key-3', createMockRoute({ id: 'route-3' }));

      // Access key-1 to make it recently used
      await cache.get('key-1');
      mockTime.advance(1000);

      // Add new entry - should evict key-2 (least recently used)
      cache.set('key-4', createMockRoute({ id: 'route-4' }));

      expect(await cache.get('key-1')).not.toBeNull();
      expect(await cache.get('key-2')).toBeNull();
      expect(await cache.get('key-3')).not.toBeNull();
    });
  });

  // ─── Cache Query Operations ────────────────────────────────────────────────

  describe('has', () => {
    it('returns true for valid entries', () => {
      const cache = new StellarRouteDiscoveryCache({ now: mockTime.now });
      cache.set('test-key', createMockRoute());
      expect(cache.has('test-key')).toBe(true);
    });

    it('returns false for expired entries', () => {
      const cache = new StellarRouteDiscoveryCache({
        now: mockTime.now,
        defaultTtlMs: 10000,
      });

      cache.set('test-key', createMockRoute());
      mockTime.advance(11000);

      expect(cache.has('test-key')).toBe(false);
    });

    it('returns false for non-existent entries', () => {
      const cache = new StellarRouteDiscoveryCache({ now: mockTime.now });
      expect(cache.has('non-existent')).toBe(false);
    });
  });

  describe('peek', () => {
    it('retrieves entry without updating access tracking', async () => {
      const cache = new StellarRouteDiscoveryCache({ now: mockTime.now });
      cache.set('test-key', createMockRoute());

      const entry1 = cache.peek('test-key');
      const entry2 = cache.peek('test-key');

      expect(entry1?.accessCount).toBe(0);
      expect(entry2?.accessCount).toBe(0);

      // Get should update access count
      await cache.get('test-key');
      const entry3 = cache.peek('test-key');
      expect(entry3?.accessCount).toBe(1);
    });

    it('returns null for expired entries', () => {
      const cache = new StellarRouteDiscoveryCache({
        now: mockTime.now,
        defaultTtlMs: 10000,
      });

      cache.set('test-key', createMockRoute());
      mockTime.advance(11000);

      expect(cache.peek('test-key')).toBeNull();
    });
  });

  // ─── Invalidation Strategies ───────────────────────────────────────────────

  describe('invalidate', () => {
    it('removes specific entry', async () => {
      const cache = new StellarRouteDiscoveryCache({ now: mockTime.now });
      cache.set('test-key', createMockRoute());

      const removed = cache.invalidate('test-key');
      expect(removed).toBe(true);
      expect(await cache.get('test-key')).toBeNull();
    });

    it('returns false for non-existent entry', () => {
      const cache = new StellarRouteDiscoveryCache({ now: mockTime.now });
      const removed = cache.invalidate('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('invalidateBy', () => {
    it('removes entries matching predicate', () => {
      const cache = new StellarRouteDiscoveryCache({ now: mockTime.now });
      cache.set('key-1', createMockRoute({ id: 'route-1' }), {
        metadata: { provider: 'allbridge' },
      });
      cache.set('key-2', createMockRoute({ id: 'route-2' }), {
        metadata: { provider: 'stargate' },
      });

      const count = cache.invalidateBy(
        (entry) => entry.metadata?.provider === 'allbridge',
      );

      expect(count).toBe(1);
      expect(cache.peek('key-1')).toBeNull();
      expect(cache.peek('key-2')).not.toBeNull();
    });
  });

  describe('invalidateByProvider', () => {
    it('removes all routes from specific provider', () => {
      const cache = new StellarRouteDiscoveryCache({ now: mockTime.now });
      cache.set('key-1', createMockRoute({ provider: 'allbridge' }));
      cache.set('key-2', createMockRoute({ provider: 'stargate' }));
      cache.set(
        'key-3',
        createMockRoute({ provider: 'allbridge', id: 'route-3' }),
      );

      const count = cache.invalidateByProvider('allbridge');

      expect(count).toBe(2);
      expect(cache.peek('key-1')).toBeNull();
      expect(cache.peek('key-2')).not.toBeNull();
      expect(cache.peek('key-3')).toBeNull();
    });
  });

  describe('invalidateByChainPair', () => {
    it('removes all routes for specific chain pair', () => {
      const cache = new StellarRouteDiscoveryCache({ now: mockTime.now });
      cache.set(
        'key-1',
        createMockRoute({ fromChain: 'stellar', toChain: 'ethereum' }),
      );
      cache.set(
        'key-2',
        createMockRoute({ fromChain: 'stellar', toChain: 'polygon' }),
      );
      cache.set(
        'key-3',
        createMockRoute({ fromChain: 'ethereum', toChain: 'stellar' }),
      );

      const count = cache.invalidateByChainPair('stellar', 'ethereum');

      expect(count).toBe(1);
      expect(cache.peek('key-1')).toBeNull();
      expect(cache.peek('key-2')).not.toBeNull();
      expect(cache.peek('key-3')).not.toBeNull();
    });
  });

  describe('invalidateByAsset', () => {
    it('removes all routes for specific asset', () => {
      const cache = new StellarRouteDiscoveryCache({ now: mockTime.now });
      cache.set('key-1', createMockRoute({ supportedAssets: ['USDC'] }));
      cache.set('key-2', createMockRoute({ supportedAssets: ['USDT'] }));
      cache.set('key-3', createMockRoute({ supportedAssets: ['USDC', 'XLM'] }));

      const count = cache.invalidateByAsset('USDC');

      expect(count).toBe(2);
      expect(cache.peek('key-1')).toBeNull();
      expect(cache.peek('key-2')).not.toBeNull();
      expect(cache.peek('key-3')).toBeNull();
    });
  });

  describe('purgeExpired', () => {
    it('removes all expired entries', () => {
      const cache = new StellarRouteDiscoveryCache({
        now: mockTime.now,
        defaultTtlMs: 10000,
      });

      cache.set('key-1', createMockRoute());
      mockTime.advance(5000);
      cache.set('key-2', createMockRoute());
      mockTime.advance(6000); // key-1 expired, key-2 still valid

      const count = cache.purgeExpired();

      expect(count).toBe(1);
      expect(cache.size).toBe(1);
      expect(cache.peek('key-1')).toBeNull();
      expect(cache.peek('key-2')).not.toBeNull();
    });
  });

  describe('purgeStale', () => {
    it('removes all stale entries', () => {
      const cache = new StellarRouteDiscoveryCache({
        now: mockTime.now,
        defaultTtlMs: 10000,
        staleThresholdPercent: 0.5,
      });

      cache.set('key-1', createMockRoute());
      mockTime.advance(6000); // Past stale threshold
      cache.set('key-2', createMockRoute());
      mockTime.advance(1000); // key-1 stale, key-2 not stale

      const count = cache.purgeStale();

      expect(count).toBe(1);
      expect(cache.size).toBe(1);
      expect(cache.peek('key-1')).toBeNull();
      expect(cache.peek('key-2')).not.toBeNull();
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      const cache = new StellarRouteDiscoveryCache({ now: mockTime.now });
      cache.set('key-1', createMockRoute());
      cache.set('key-2', createMockRoute());

      cache.clear();

      expect(cache.size).toBe(0);
    });
  });

  // ─── Cache Statistics ──────────────────────────────────────────────────────

  describe('stats', () => {
    it('returns accurate cache statistics', async () => {
      const cache = new StellarRouteDiscoveryCache({
        now: mockTime.now,
        defaultTtlMs: 10000,
        staleThresholdPercent: 0.5,
      });

      cache.set('key-1', createMockRoute());
      cache.set('key-2', createMockRoute());
      mockTime.advance(6000); // Make entries stale
      cache.set('key-3', createMockRoute());

      await cache.get('key-1'); // hit
      await cache.get('key-4'); // miss

      const stats = cache.stats();

      expect(stats.totalEntries).toBe(3);
      expect(stats.validEntries).toBe(3);
      expect(stats.expiredEntries).toBe(0);
      expect(stats.staleEntries).toBe(2);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    it('calculates hit rate correctly', async () => {
      const cache = new StellarRouteDiscoveryCache({ now: mockTime.now });

      await cache.get('miss-1');
      await cache.get('miss-2');
      cache.set('key-1', createMockRoute());
      await cache.get('key-1');

      const stats = cache.stats();
      expect(stats.hitRate).toBeCloseTo(1 / 3, 2);
    });

    it('returns zero hit rate for no requests', () => {
      const cache = new StellarRouteDiscoveryCache({ now: mockTime.now });
      const stats = cache.stats();
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('resetStats', () => {
    it('resets hit and miss counters', async () => {
      const cache = new StellarRouteDiscoveryCache({ now: mockTime.now });

      await cache.get('miss');
      cache.set('key', createMockRoute());
      await cache.get('key');

      cache.resetStats();

      const stats = cache.stats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  // ─── Key Building Helpers ──────────────────────────────────────────────────

  describe('buildRouteDiscoveryKey', () => {
    it('builds deterministic key from query', () => {
      const key = buildRouteDiscoveryKey({
        fromChain: 'Stellar',
        toChain: 'Ethereum',
        asset: 'USDC',
      });

      expect(key).toBe('stellar:ethereum:usdc:*:*');
    });

    it('handles optional fields with wildcards', () => {
      const key = buildRouteDiscoveryKey({
        fromChain: 'Stellar',
        toChain: 'Ethereum',
      });

      expect(key).toBe('stellar:ethereum:*:*:*');
    });

    it('normalizes to lowercase', () => {
      const key1 = buildRouteDiscoveryKey({
        fromChain: 'Stellar',
        toChain: 'Ethereum',
      });
      const key2 = buildRouteDiscoveryKey({
        fromChain: 'stellar',
        toChain: 'ethereum',
      });

      expect(key1).toBe(key2);
    });
  });

  describe('buildRouteKey', () => {
    it('builds prefixed route key', () => {
      const key = buildRouteKey('stellar-ethereum-usdc');
      expect(key).toBe('route:stellar-ethereum-usdc');
    });
  });

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('stops cleanup timer', () => {
      const cache = new StellarRouteDiscoveryCache({
        now: mockTime.now,
        enableCleanup: true,
        cleanupIntervalMs: 1000,
      });

      cache.destroy();
      // Should not throw or cause issues
      cache.set('test', createMockRoute());
    });
  });

  // ─── Edge Cases ────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty route arrays', async () => {
      const cache = new StellarRouteDiscoveryCache({ now: mockTime.now });
      cache.set('empty', []);

      const result = await cache.get('empty');
      expect(result).toEqual([]);
    });

    it('handles routes with minimal data', async () => {
      const cache = new StellarRouteDiscoveryCache({ now: mockTime.now });
      const minimalRoute: BridgeRoute = {
        id: 'minimal',
        fromChain: 'stellar' as AssetChain,
        toChain: 'ethereum' as AssetChain,
        bridgeProtocol: 'test',
        provider: 'test',
        supportedAssets: ['USDC'],
        estimatedTimeMinutes: 10,
        status: 'active' as const,
        available: true,
      };

      cache.set('minimal', minimalRoute);
      const result = await cache.get('minimal');
      expect(result).toEqual(minimalRoute);
    });

    it('supports very short TTL', async () => {
      const cache = new StellarRouteDiscoveryCache({
        now: mockTime.now,
        defaultTtlMs: 1,
      });

      cache.set('short', createMockRoute());
      mockTime.advance(2);

      expect(await cache.get('short')).toBeNull();
    });

    it('supports very large cache sizes', () => {
      const cache = new StellarRouteDiscoveryCache({
        now: mockTime.now,
        maxEntries: 10000,
      });

      for (let i = 0; i < 10000; i++) {
        cache.set(`key-${i}`, createMockRoute({ id: `route-${i}` }));
      }

      expect(cache.size).toBe(10000);
    });
  });

  // ─── Integration Scenarios ─────────────────────────────────────────────────

  describe('integration scenarios', () => {
    it('caches route discovery results effectively', async () => {
      const cache = new StellarRouteDiscoveryCache({
        now: mockTime.now,
        defaultTtlMs: 60000,
      });

      const discoveryQuery = {
        fromChain: 'stellar',
        toChain: 'ethereum',
        asset: 'USDC',
      };

      const cacheKey = buildRouteDiscoveryKey(discoveryQuery);
      const discoveredRoutes = [
        createMockRoute({ id: 'route-1' }),
        createMockRoute({ id: 'route-2' }),
      ];

      // First discovery
      cache.set(cacheKey, discoveredRoutes, {
        metadata: { discoverySource: 'provider-api' },
      });

      // Subsequent queries hit cache
      const cached = await cache.get(cacheKey);
      expect(cached).toEqual(discoveredRoutes);

      const stats = cache.stats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(0);
    });

    it('supports stale-while-revalidate pattern', async () => {
      let refreshCount = 0;
      const cache = new StellarRouteDiscoveryCache({
        now: mockTime.now,
        defaultTtlMs: 10000,
        staleThresholdPercent: 0.5,
        onStale: async (key, entry) => {
          refreshCount++;
          // Simulate refreshing route data
          cache.set(key, createMockRoute({ id: 'refreshed' }), {
            ttlMs: 10000,
          });
        },
      });

      cache.set('route-key', createMockRoute({ id: 'original' }));
      mockTime.advance(6000); // Past stale threshold

      const result = await cache.get('route-key');
      // Should return stale data first
      expect(result).not.toBeNull();
      expect(refreshCount).toBe(1);

      // Next access should get refreshed data
      const refreshed = await cache.get('route-key');
      expect((refreshed as BridgeRoute).id).toBe('refreshed');
    });

    it('handles provider updates gracefully', async () => {
      const cache = new StellarRouteDiscoveryCache({ now: mockTime.now });

      cache.set('route-1', createMockRoute({ provider: 'allbridge' }));
      cache.set('route-2', createMockRoute({ provider: 'stargate' }));
      cache.set('route-3', createMockRoute({ provider: 'allbridge' }));

      // Provider updates routes - invalidate old ones
      cache.invalidateByProvider('allbridge');

      expect(cache.peek('route-1')).toBeNull();
      expect(cache.peek('route-2')).not.toBeNull();
      expect(cache.peek('route-3')).toBeNull();
    });
  });
});
