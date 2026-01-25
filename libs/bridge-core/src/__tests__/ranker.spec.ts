import { RouteRanker, DEFAULT_RANKING_WEIGHTS } from '../ranker';
import { BridgeRoute } from '../types';

describe('RouteRanker', () => {
  const mockRoutes: BridgeRoute[] = [
    {
      id: 'route1',
      provider: 'stellar',
      sourceChain: 'ethereum',
      targetChain: 'stellar',
      inputAmount: '1000000000000000000', // 1 ETH
      outputAmount: '950000000000000000', // 0.95 ETH after fees
      fee: '50000000000000000', // 0.05 ETH fee
      feePercentage: 5.0,
      estimatedTime: 300, // 5 minutes
      reliability: 0.95,
      minAmountOut: '950000000000000000',
      maxAmountOut: '950000000000000000',
    },
    {
      id: 'route2',
      provider: 'layerzero',
      sourceChain: 'ethereum',
      targetChain: 'polygon',
      inputAmount: '1000000000000000000',
      outputAmount: '970000000000000000', // 0.97 ETH
      fee: '30000000000000000', // 0.03 ETH fee
      feePercentage: 3.0,
      estimatedTime: 600, // 10 minutes
      reliability: 0.90,
      minAmountOut: '970000000000000000',
      maxAmountOut: '970000000000000000',
    },
    {
      id: 'route3',
      provider: 'hop',
      sourceChain: 'ethereum',
      targetChain: 'polygon',
      inputAmount: '1000000000000000000',
      outputAmount: '980000000000000000', // 0.98 ETH
      fee: '20000000000000000', // 0.02 ETH fee
      feePercentage: 2.0,
      estimatedTime: 120, // 2 minutes
      reliability: 0.85,
      minAmountOut: '980000000000000000',
      maxAmountOut: '980000000000000000',
    },
  ];

  describe('constructor', () => {
    it('should create ranker with default weights', () => {
      const ranker = new RouteRanker();
      expect(ranker.getWeights()).toEqual(DEFAULT_RANKING_WEIGHTS);
    });

    it('should create ranker with custom weights', () => {
      const customWeights = {
        costWeight: 0.5,
        latencyWeight: 0.3,
        reliabilityWeight: 0.2,
      };
      const ranker = new RouteRanker(customWeights);
      expect(ranker.getWeights()).toEqual(customWeights);
    });

    it('should throw error for invalid weights', () => {
      expect(() => new RouteRanker({
        costWeight: 0.5,
        latencyWeight: 0.3,
        reliabilityWeight: 0.3, // Sum > 1
      })).toThrow('Ranking weights must sum to 1');

      expect(() => new RouteRanker({
        costWeight: 1.5, // > 1
        latencyWeight: 0,
        reliabilityWeight: -0.5, // < 0
      })).toThrow('costWeight must be between 0 and 1');
    });
  });

  describe('updateWeights', () => {
    it('should update weights partially', () => {
      const ranker = new RouteRanker();
      ranker.updateWeights({ costWeight: 0.6, latencyWeight: 0.3 });
      expect(ranker.getWeights()).toEqual({
        costWeight: 0.6,
        latencyWeight: 0.3,
        reliabilityWeight: 0.1,
      });
    });

    it('should throw error for invalid updated weights', () => {
      const ranker = new RouteRanker();
      expect(() => ranker.updateWeights({ costWeight: 1.5 })).toThrow();
    });
  });

  describe('rankRoutes', () => {
    it('should rank routes with default weights (balanced)', () => {
      const ranker = new RouteRanker();
      const ranked = ranker.rankRoutes([...mockRoutes]);

      // With balanced weights, route3 should be first (best overall score)
      // route3: low fee (2%), fast (2min), good reliability (0.85)
      // route2: medium fee (3%), slow (10min), good reliability (0.90)
      // route1: high fee (5%), medium time (5min), best reliability (0.95)
      expect(ranked[0].id).toBe('route3');
      expect(ranked[1].id).toBe('route2');
      expect(ranked[2].id).toBe('route1');
    });

    it('should rank routes with cost-focused weights', () => {
      const ranker = new RouteRanker({
        costWeight: 0.8,
        latencyWeight: 0.1,
        reliabilityWeight: 0.1,
      });
      const ranked = ranker.rankRoutes([...mockRoutes]);

      // Cost-focused: route3 (2% fee) should be first
      expect(ranked[0].id).toBe('route3');
      expect(ranked[1].id).toBe('route2');
      expect(ranked[2].id).toBe('route1');
    });

    it('should rank routes with latency-focused weights', () => {
      const ranker = new RouteRanker({
        costWeight: 0.1,
        latencyWeight: 0.8,
        reliabilityWeight: 0.1,
      });
      const ranked = ranker.rankRoutes([...mockRoutes]);

      // Latency-focused: route3 (2min) should be first
      expect(ranked[0].id).toBe('route3');
      expect(ranked[1].id).toBe('route1');
      expect(ranked[2].id).toBe('route2');
    });

    it('should rank routes with reliability-focused weights', () => {
      const ranker = new RouteRanker({
        costWeight: 0.1,
        latencyWeight: 0.1,
        reliabilityWeight: 0.8,
      });
      const ranked = ranker.rankRoutes([...mockRoutes]);

      // Reliability-focused: route1 (0.95) should be first
      expect(ranked[0].id).toBe('route1');
      expect(ranked[1].id).toBe('route2');
      expect(ranked[2].id).toBe('route3');
    });

    it('should handle empty routes array', () => {
      const ranker = new RouteRanker();
      const ranked = ranker.rankRoutes([]);
      expect(ranked).toEqual([]);
    });

    it('should handle single route', () => {
      const ranker = new RouteRanker();
      const ranked = ranker.rankRoutes([mockRoutes[0]]);
      expect(ranked).toEqual([mockRoutes[0]]);
    });
  });

  describe('scoring functions', () => {
    it('should normalize cost correctly', () => {
      const ranker = new RouteRanker();

      // Access private method for testing
      const normalizeCost = (ranker as any).normalizeCost.bind(ranker);

      expect(normalizeCost(0)).toBe(1); // 0% fee = perfect score
      expect(normalizeCost(5)).toBe(0.95); // 5% fee
      expect(normalizeCost(50)).toBe(0.5); // 50% fee
      expect(normalizeCost(100)).toBe(0); // 100% fee = worst score
    });

    it('should normalize latency correctly', () => {
      const ranker = new RouteRanker();

      // Access private method for testing
      const normalizeLatency = (ranker as any).normalizeLatency.bind(ranker);

      expect(normalizeLatency(60)).toBeCloseTo(0.6065, 4); // 1 minute
      expect(normalizeLatency(300)).toBeCloseTo(0.2231, 4); // 5 minutes
      expect(normalizeLatency(600)).toBeCloseTo(0.1353, 4); // 10 minutes
    });
  });
});