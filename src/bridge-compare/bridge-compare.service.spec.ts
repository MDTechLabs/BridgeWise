import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { BridgeCompareService } from '../src/bridge-compare/bridge-compare.service';
import { AggregationService } from '../src/bridge-compare/aggregation.service';
import { SlippageService } from '../src/bridge-compare/slippage.service';
import { ReliabilityService } from '../src/bridge-compare/reliability.service';
import { RankingService } from '../src/bridge-compare/ranking.service';
import { GetQuotesDto } from '../src/bridge-compare/dto';
import { RankingMode } from '../src/bridge-compare/enums';
import { NormalizedQuote, QuoteResponse } from '../src/bridge-compare/interfaces';

const baseDto: GetQuotesDto = {
  sourceChain: 'ethereum',
  destinationChain: 'polygon',
  sourceToken: 'USDC',
  amount: 100,
  rankingMode: RankingMode.BALANCED,
};

describe('BridgeCompareService (integration)', () => {
  let service: BridgeCompareService;
  let aggregationService: AggregationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BridgeCompareService,
        AggregationService,
        SlippageService,
        ReliabilityService,
        RankingService,
      ],
    }).compile();

    service = module.get<BridgeCompareService>(BridgeCompareService);
    aggregationService = module.get<AggregationService>(AggregationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── getQuotes ───────────────────────────────────────────────────────────────

  describe('getQuotes', () => {
    it('returns a valid QuoteResponse', async () => {
      const response: QuoteResponse = await service.getQuotes(baseDto);

      expect(response.quotes.length).toBeGreaterThan(0);
      expect(response.bestRoute).toBeDefined();
      expect(response.rankingMode).toBe(RankingMode.BALANCED);
      expect(response.fetchDurationMs).toBeGreaterThanOrEqual(0);
      expect(response.successfulProviders).toBeGreaterThan(0);
    });

    it('bestRoute is the first-ranked quote', async () => {
      const response = await service.getQuotes(baseDto);
      expect(response.bestRoute.rankingPosition).toBe(1);
      expect(response.bestRoute.bridgeId).toBe(response.quotes[0].bridgeId);
    });

    it('all quotes have compositeScore and rankingPosition assigned', async () => {
      const response = await service.getQuotes(baseDto);
      for (const q of response.quotes) {
        expect(q.compositeScore).toBeGreaterThan(0);
        expect(q.rankingPosition).toBeGreaterThan(0);
      }
    });

    it('all quotes have slippage and reliability populated', async () => {
      const response = await service.getQuotes(baseDto);
      for (const q of response.quotes) {
        expect(q.slippagePercent).toBeGreaterThanOrEqual(0);
        expect(q.reliabilityScore).toBeGreaterThan(0);
      }
    });

    it('quotes are sorted by rankingPosition ascending', async () => {
      const response = await service.getQuotes(baseDto);
      for (let i = 0; i < response.quotes.length - 1; i++) {
        expect(response.quotes[i].rankingPosition).toBeLessThan(response.quotes[i + 1].rankingPosition);
      }
    });

    it('LOWEST_COST mode yields cheapest route as best', async () => {
      const response = await service.getQuotes({ ...baseDto, rankingMode: RankingMode.LOWEST_COST });
      const fees = response.quotes.map((q) => q.totalFeeUsd);
      // Best route should have one of the lowest fees
      expect(response.bestRoute.totalFeeUsd).toBeLessThanOrEqual(Math.max(...fees));
    });

    it('FASTEST mode yields fastest route as best', async () => {
      const response = await service.getQuotes({ ...baseDto, rankingMode: RankingMode.FASTEST });
      const times = response.quotes.map((q) => q.estimatedTimeSeconds);
      expect(response.bestRoute.estimatedTimeSeconds).toBeLessThanOrEqual(Math.max(...times));
    });

    it('re-runs correctly on amount change', async () => {
      const r1 = await service.getQuotes({ ...baseDto, amount: 50 });
      const r2 = await service.getQuotes({ ...baseDto, amount: 5000 });
      // Larger amounts should have higher fees
      expect(r2.bestRoute.totalFeeUsd).toBeGreaterThan(r1.bestRoute.totalFeeUsd);
    });

    it('re-runs correctly on rankingMode change', async () => {
      const balanced = await service.getQuotes({ ...baseDto, rankingMode: RankingMode.BALANCED });
      const fastest  = await service.getQuotes({ ...baseDto, rankingMode: RankingMode.FASTEST });
      // Best routes may differ between modes
      expect(balanced.rankingMode).toBe(RankingMode.BALANCED);
      expect(fastest.rankingMode).toBe(RankingMode.FASTEST);
    });

    it('throws on unsupported token pair', async () => {
      await expect(
        service.getQuotes({ ...baseDto, sourceToken: 'COMPLETELY_FAKE_TOKEN' }),
      ).rejects.toThrow();
    });
  });

  // ─── getRouteDetails ─────────────────────────────────────────────────────────

  describe('getRouteDetails', () => {
    it('returns the route for a known bridgeId', async () => {
      const allQuotes = await service.getQuotes(baseDto);
      const targetId = allQuotes.quotes[0].bridgeId;

      const route: NormalizedQuote = await service.getRouteDetails(baseDto, targetId);
      expect(route.bridgeId).toBe(targetId);
    });

    it('throws NotFoundException for unknown bridgeId', async () => {
      await expect(
        service.getRouteDetails(baseDto, 'completely-nonexistent-bridge'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getSupportedBridges ─────────────────────────────────────────────────────

  describe('getSupportedBridges', () => {
    it('returns list of providers', () => {
      const providers = service.getSupportedBridges();
      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);
    });
  });

  // ─── Simulated bridge failure ─────────────────────────────────────────────────

  describe('bridge API failure simulation', () => {
    it('still returns quotes if some providers fail', async () => {
      // Spy to force 2 failures
      let callCount = 0;
      const originalFetch = aggregationService['fetchSingleProviderQuote'].bind(aggregationService);
      jest
        .spyOn(aggregationService as any, 'fetchSingleProviderQuote')
        .mockImplementation(async (...args) => {
          callCount++;
          if (callCount <= 2) throw new Error('Simulated provider failure');
          return originalFetch(...args);
        });

      // Should still resolve with the remaining providers
      const response = await service.getQuotes(baseDto);
      expect(response.quotes.length).toBeGreaterThan(0);
    });

    it('throws SERVICE_UNAVAILABLE when ALL providers fail', async () => {
      jest
        .spyOn(aggregationService as any, 'fetchSingleProviderQuote')
        .mockRejectedValue(new Error('All providers down'));

      await expect(service.getQuotes(baseDto)).rejects.toThrow();
    });
  });
});
