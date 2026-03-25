import { Test, TestingModule } from '@nestjs/testing';
import { RankingService } from '../src/bridge-compare/ranking.service';
import { NormalizedQuote } from '../src/bridge-compare/interfaces';
import { BridgeStatus, RankingMode } from '../src/bridge-compare/enums';

const makeQuote = (override: Partial<NormalizedQuote>): NormalizedQuote => ({
  bridgeId: 'test',
  bridgeName: 'Test Bridge',
  sourceChain: 'stellar',
  destinationChain: 'ethereum',
  sourceToken: 'USDC',
  destinationToken: 'USDC',
  inputAmount: 100,
  outputAmount: 99,
  totalFeeUsd: 1.0,
  estimatedTimeSeconds: 60,
  slippagePercent: 0.1,
  reliabilityScore: 90,
  compositeScore: 0,
  rankingPosition: 0,
  bridgeStatus: BridgeStatus.ACTIVE,
  metadata: {},
  fetchedAt: new Date(),
  ...override,
});

describe('RankingService', () => {
  let service: RankingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RankingService],
    }).compile();

    service = module.get<RankingService>(RankingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('rankQuotes', () => {
    it('returns empty array for empty input', () => {
      expect(service.rankQuotes([], RankingMode.BALANCED)).toEqual([]);
    });

    it('assigns ranking positions starting at 1', () => {
      const quotes = [
        makeQuote({ bridgeId: 'a', totalFeeUsd: 2 }),
        makeQuote({ bridgeId: 'b', totalFeeUsd: 1 }),
        makeQuote({ bridgeId: 'c', totalFeeUsd: 3 }),
      ];
      const ranked = service.rankQuotes(quotes, RankingMode.BALANCED);
      expect(ranked.map((q) => q.rankingPosition)).toEqual([1, 2, 3]);
    });

    it('assigns composite scores to all quotes', () => {
      const quotes = [makeQuote({ bridgeId: 'a' }), makeQuote({ bridgeId: 'b' })];
      const ranked = service.rankQuotes(quotes, RankingMode.BALANCED);
      for (const q of ranked) {
        expect(q.compositeScore).toBeGreaterThan(0);
      }
    });

    it('LOWEST_COST mode ranks cheaper route first', () => {
      const quotes = [
        makeQuote({ bridgeId: 'cheap', totalFeeUsd: 0.5, estimatedTimeSeconds: 300 }),
        makeQuote({ bridgeId: 'expensive', totalFeeUsd: 5.0, estimatedTimeSeconds: 30 }),
      ];
      const ranked = service.rankQuotes(quotes, RankingMode.LOWEST_COST);
      expect(ranked[0].bridgeId).toBe('cheap');
    });

    it('FASTEST mode ranks faster route first', () => {
      const quotes = [
        makeQuote({ bridgeId: 'fast', estimatedTimeSeconds: 15, totalFeeUsd: 5 }),
        makeQuote({ bridgeId: 'slow', estimatedTimeSeconds: 600, totalFeeUsd: 0.5 }),
      ];
      const ranked = service.rankQuotes(quotes, RankingMode.FASTEST);
      expect(ranked[0].bridgeId).toBe('fast');
    });

    it('BALANCED mode considers all factors', () => {
      const quotes = [
        makeQuote({ bridgeId: 'balanced', totalFeeUsd: 1.0, estimatedTimeSeconds: 60, reliabilityScore: 95, slippagePercent: 0.1 }),
        makeQuote({ bridgeId: 'risky', totalFeeUsd: 0.5, estimatedTimeSeconds: 30, reliabilityScore: 50, slippagePercent: 2.0 }),
      ];
      const ranked = service.rankQuotes(quotes, RankingMode.BALANCED);
      // balanced bridge should win due to reliability
      expect(ranked[0].bridgeId).toBe('balanced');
    });

    it('sorted descending by compositeScore', () => {
      const quotes = Array.from({ length: 5 }, (_, i) =>
        makeQuote({ bridgeId: `bridge-${i}`, totalFeeUsd: i * 0.5, reliabilityScore: 90 - i * 5 }),
      );
      const ranked = service.rankQuotes(quotes, RankingMode.BALANCED);
      for (let i = 0; i < ranked.length - 1; i++) {
        expect(ranked[i].compositeScore).toBeGreaterThanOrEqual(ranked[i + 1].compositeScore);
      }
    });

    it('returns single quote with position 1', () => {
      const quotes = [makeQuote({ bridgeId: 'only' })];
      const ranked = service.rankQuotes(quotes, RankingMode.BALANCED);
      expect(ranked[0].rankingPosition).toBe(1);
      expect(ranked[0].compositeScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getBestQuote', () => {
    it('returns the first-ranked quote', () => {
      const quotes = [
        makeQuote({ bridgeId: 'best', reliabilityScore: 100, totalFeeUsd: 0.1, estimatedTimeSeconds: 10 }),
        makeQuote({ bridgeId: 'worst', reliabilityScore: 40, totalFeeUsd: 5, estimatedTimeSeconds: 600 }),
      ];
      const best = service.getBestQuote(quotes, RankingMode.BALANCED);
      expect(best?.bridgeId).toBe('best');
    });

    it('returns null for empty array', () => {
      expect(service.getBestQuote([], RankingMode.BALANCED)).toBeNull();
    });
  });

  describe('getWeights', () => {
    it('returns weights that sum to 1.0 for each mode', () => {
      for (const mode of Object.values(RankingMode)) {
        const w = service.getWeights(mode);
        const sum = w.cost + w.speed + w.reliability + w.slippage;
        expect(sum).toBeCloseTo(1.0, 5);
      }
    });

    it('LOWEST_COST mode has highest cost weight', () => {
      const w = service.getWeights(RankingMode.LOWEST_COST);
      expect(w.cost).toBeGreaterThan(w.speed);
      expect(w.cost).toBeGreaterThan(w.reliability);
    });

    it('FASTEST mode has highest speed weight', () => {
      const w = service.getWeights(RankingMode.FASTEST);
      expect(w.speed).toBeGreaterThan(w.cost);
      expect(w.speed).toBeGreaterThan(w.reliability);
    });
  });
});
