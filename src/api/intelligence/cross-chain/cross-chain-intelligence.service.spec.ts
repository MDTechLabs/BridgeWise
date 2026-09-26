import { CrossChainIntelligenceService } from './cross-chain-intelligence.service';

describe('CrossChainIntelligenceService', () => {
  let service: CrossChainIntelligenceService;

  beforeEach(() => {
    service = new CrossChainIntelligenceService();
  });

  describe('getRoutes', () => {
    it('returns all routes with no filter', () => {
      const result = service.getRoutes();
      expect(result.data.length).toBe(3);
      expect(result.total).toBe(3);
      expect(result.filtered).toBe(3);
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it('filters by source chain', () => {
      const result = service.getRoutes({ sourceChain: 'stellar' });
      expect(result.data.every((r) => r.sourceChain === 'stellar')).toBe(true);
      expect(result.data.length).toBe(2);
    });

    it('filters by destination chain', () => {
      const result = service.getRoutes({ destinationChain: 'ethereum' });
      expect(result.data.every((r) => r.destinationChain === 'ethereum')).toBe(true);
      expect(result.data.length).toBe(1);
    });

    it('filters by bridge/provider', () => {
      const result = service.getRoutes({ provider: 'FastBridge' });
      expect(result.data.every((r) => r.bridge === 'FastBridge')).toBe(true);
      expect(result.data.length).toBe(1);
    });

    it('filters by max fee', () => {
      const result = service.getRoutes({ maxFee: 1.0 });
      expect(result.data.every((r) => r.feeUsd <= 1.0)).toBe(true);
      expect(result.data.length).toBe(1);
    });

    it('returns empty when no routes match', () => {
      const result = service.getRoutes({ sourceChain: 'solana' });
      expect(result.data).toHaveLength(0);
      expect(result.filtered).toBe(0);
    });
  });

  describe('getProviders', () => {
    it('returns all providers with no filter', () => {
      const result = service.getProviders();
      expect(result.data.length).toBe(3);
      expect(result.total).toBe(3);
    });

    it('filters by provider id', () => {
      const result = service.getProviders({ provider: 'axelar' });
      expect(result.data.length).toBe(1);
      expect(result.data[0].name).toBe('Axelar');
    });

    it('filters by supported chain', () => {
      const result = service.getProviders({ chain: 'polygon' });
      expect(result.data.every((p) => p.supportedChains.includes('polygon'))).toBe(true);
      expect(result.data.length).toBe(2);
    });

    it('filters by supported token', () => {
      const result = service.getProviders({ token: 'ETH' });
      expect(result.data.every((p) => p.supportedAssets.includes('ETH'))).toBe(true);
      expect(result.data.length).toBe(2);
    });

    it('filters by min reliability', () => {
      const result = service.getProviders({ minReliability: 95 });
      expect(result.data.every((p) => p.reliabilityScore >= 95)).toBe(true);
      expect(result.data.length).toBe(2);
    });
  });

  describe('getAssets', () => {
    it('returns all assets with no filter', () => {
      const result = service.getAssets();
      expect(result.data.length).toBe(3);
      expect(result.total).toBe(3);
    });

    it('filters by token symbol', () => {
      const result = service.getAssets({ token: 'USDC' });
      expect(result.data.length).toBe(1);
      expect(result.data[0].symbol).toBe('USDC');
    });

    it('filters by chain', () => {
      const result = service.getAssets({ chain: 'polygon' });
      expect(result.data.every((a) => a.chains.includes('polygon'))).toBe(true);
      expect(result.data.length).toBe(1);
    });

    it('filters by min liquidity', () => {
      const result = service.getAssets({ minLiquidity: 100000000 });
      expect(result.data.every((a) => a.totalLiquidityUsd >= 100000000)).toBe(true);
      expect(result.data.length).toBe(1);
    });

    it('filters by max fee', () => {
      const result = service.getAssets({ maxFee: 0.5 });
      expect(result.data.every((a) => a.averageFeeUsd <= 0.5)).toBe(true);
      expect(result.data.length).toBe(2);
    });
  });
});
