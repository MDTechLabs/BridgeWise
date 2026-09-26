import { describe, beforeEach, it, expect, vi } from 'vitest';
import { SorobanRecommendationCacheService } from './soroban-recommendation-cache.service';
import { RouteRecommendation } from './soroban-cache.types';

describe('SorobanRecommendationCacheService', () => {
  let cacheService: SorobanRecommendationCacheService;

  const mockRecommendation: RouteRecommendation = {
    id: 'route-1',
    sourceChain: 'stellar',
    targetChain: 'ethereum',
    assetCode: 'XLM',
    recommendedRoute: ['stellar', 'bridge-contract', 'ethereum'],
    estimatedFee: '0.0001',
    estimatedTimeSeconds: 15,
  };

  beforeEach(() => {
    cacheService = new SorobanRecommendationCacheService(1000); // 1s TTL for testing
    vi.useRealTimers();
  });

  it('should cache and retrieve recommendation results', () => {
    const key = cacheService.generateKey('stellar', 'ethereum', 'XLM');
    cacheService.set(key, mockRecommendation);

    const cached = cacheService.get(key);
    expect(cached).toEqual(mockRecommendation);

    const metrics = cacheService.getMetrics();
    expect(metrics.hits).toBe(1);
    expect(metrics.misses).toBe(0);
    expect(metrics.hitRate).toBe(100);
  });

  it('should return null and increment misses for non-existent key', () => {
    const cached = cacheService.get('non-existent-key');
    expect(cached).toBeNull();

    const metrics = cacheService.getMetrics();
    expect(metrics.misses).toBe(1);
    expect(metrics.hitRate).toBe(0);
  });

  it('should expire entries after TTL', async () => {
    vi.useFakeTimers();
    const key = cacheService.generateKey('stellar', 'ethereum', 'XLM');
    cacheService.set(key, mockRecommendation, { ttlMs: 500 });

    vi.advanceTimersByTime(600);

    const cached = cacheService.get(key);
    expect(cached).toBeNull();

    vi.useRealTimers();
  });

  it('should invalidate specific key or prefix', () => {
    const key1 = cacheService.generateKey('stellar', 'ethereum', 'XLM', '100');
    const key2 = cacheService.generateKey('stellar', 'polygon', 'USDC', '200');

    cacheService.set(key1, mockRecommendation);
    cacheService.set(key2, mockRecommendation);

    cacheService.invalidate(key1);
    expect(cacheService.get(key1)).toBeNull();
    expect(cacheService.get(key2)).not.toBeNull();
  });
});