import { Test, TestingModule } from '@nestjs/testing';
import { AggregationService } from '../src/bridge-compare/aggregation.service';
import { QuoteRequestParams } from '../src/bridge-compare/interfaces';
import { BridgeStatus, RankingMode } from '../src/bridge-compare/enums';
import { HttpException } from '@nestjs/common';

const baseParams: QuoteRequestParams = {
  sourceChain: 'ethereum',
  destinationChain: 'polygon',
  sourceToken: 'USDC',
  destinationToken: 'USDC',
  amount: 100,
  rankingMode: RankingMode.BALANCED,
};

describe('AggregationService', () => {
  let service: AggregationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AggregationService],
    }).compile();

    service = module.get<AggregationService>(AggregationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('fetchRawQuotes', () => {
    it('returns quotes for a supported route', async () => {
      const { quotes } = await service.fetchRawQuotes(baseParams);
      expect(quotes.length).toBeGreaterThan(0);
      for (const q of quotes) {
        expect(q.bridgeId).toBeDefined();
        expect(q.outputAmount).toBeGreaterThan(0);
        expect(q.feesUsd).toBeGreaterThan(0);
      }
    });

    it('throws NOT_FOUND for unsupported token pair', async () => {
      await expect(
        service.fetchRawQuotes({
          ...baseParams,
          sourceToken: 'EXTREMELY_UNKNOWN_TOKEN_XYZ',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws NOT_FOUND for unsupported chain pair', async () => {
      await expect(
        service.fetchRawQuotes({
          ...baseParams,
          sourceChain: 'nonexistent-chain',
          destinationChain: 'another-fake-chain',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('returns output amount less than input (fees deducted)', async () => {
      const { quotes } = await service.fetchRawQuotes(baseParams);
      for (const q of quotes) {
        expect(q.outputAmount).toBeLessThan(baseParams.amount);
      }
    });

    it('includes failedProviders count in response', async () => {
      const result = await service.fetchRawQuotes(baseParams);
      expect(result.failedProviders).toBeGreaterThanOrEqual(0);
      expect(typeof result.failedProviders).toBe('number');
    });

    it('scales fees with larger amounts', async () => {
      const small = await service.fetchRawQuotes({ ...baseParams, amount: 10 });
      const large = await service.fetchRawQuotes({ ...baseParams, amount: 100_000 });
      const avgFeeSmall = small.quotes.reduce((a, q) => a + q.feesUsd, 0) / small.quotes.length;
      const avgFeeLarge = large.quotes.reduce((a, q) => a + q.feesUsd, 0) / large.quotes.length;
      expect(avgFeeLarge).toBeGreaterThan(avgFeeSmall);
    });

    it('stellar-ethereum route returns soroswap', async () => {
      const { quotes } = await service.fetchRawQuotes({
        ...baseParams,
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        sourceToken: 'XLM',
        destinationToken: 'XLM',
      });
      const ids = quotes.map((q) => q.bridgeId);
      expect(ids).toContain('soroswap');
    });
  });

  describe('getEligibleProviders', () => {
    it('filters out providers that do not support source chain', () => {
      const providers = service.getEligibleProviders({
        ...baseParams,
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        sourceToken: 'USDC',
      });
      for (const p of providers) {
        expect(p.supportedChains).toContain('stellar');
      }
    });

    it('returns empty array when no providers match', () => {
      const providers = service.getEligibleProviders({
        ...baseParams,
        sourceChain: 'fake-chain',
      });
      expect(providers).toHaveLength(0);
    });
  });

  describe('getBridgeStatus', () => {
    it('returns ACTIVE for known active bridge', () => {
      const status = service.getBridgeStatus('stargate');
      expect(status).toBe(BridgeStatus.ACTIVE);
    });

    it('returns OFFLINE for unknown bridge', () => {
      const status = service.getBridgeStatus('nonexistent');
      expect(status).toBe(BridgeStatus.OFFLINE);
    });
  });

  describe('getAllProviders', () => {
    it('returns an array of providers', () => {
      const providers = service.getAllProviders();
      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);
    });

    it('each provider has required fields', () => {
      const providers = service.getAllProviders();
      for (const p of providers) {
        expect(p.id).toBeDefined();
        expect(p.name).toBeDefined();
        expect(Array.isArray(p.supportedChains)).toBe(true);
        expect(Array.isArray(p.supportedTokens)).toBe(true);
      }
    });
  });
});
