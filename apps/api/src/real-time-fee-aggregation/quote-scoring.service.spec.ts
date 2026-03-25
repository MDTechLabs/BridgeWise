import { Test, TestingModule } from '@nestjs/testing';
import { QuoteScoringService } from '../src/services/quote-scoring.service';
import { NormalizedQuote } from '../src/interfaces/bridge-adapter.interface';

const makeQuote = (
  bridgeName: string,
  totalFeeUSD: number,
  estimatedArrivalTime: number,
  outputAmount: string,
  supported = true,
): NormalizedQuote => ({
  bridgeName,
  totalFeeUSD,
  feeToken: 'USDC',
  estimatedArrivalTime,
  outputAmount,
  supported,
});

describe('QuoteScoringService', () => {
  let service: QuoteScoringService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QuoteScoringService],
    }).compile();

    service = module.get<QuoteScoringService>(QuoteScoringService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('scoreAndRank - score strategy', () => {
    it('should assign scores between 0 and 100 to all supported quotes', () => {
      const quotes = [
        makeQuote('Bridge1', 1.5, 120, '998.5'),
        makeQuote('Bridge2', 3.0, 60, '997.0'),
        makeQuote('Bridge3', 2.0, 300, '998.0'),
      ];

      const ranked = service.scoreAndRank(quotes, 'score');
      const supported = ranked.filter((q) => q.supported);

      supported.forEach((q) => {
        expect(q.score).toBeDefined();
        expect(q.score).toBeGreaterThanOrEqual(0);
        expect(q.score).toBeLessThanOrEqual(100);
      });
    });

    it('should place unsupported quotes at the end', () => {
      const quotes = [
        makeQuote('Supported1', 1.5, 120, '998.5', true),
        makeQuote('Unsupported', 0, 0, '0', false),
        makeQuote('Supported2', 2.0, 300, '998.0', true),
      ];

      const ranked = service.scoreAndRank(quotes, 'score');
      expect(ranked[ranked.length - 1].supported).toBe(false);
    });

    it('should return only unsupported when all quotes fail', () => {
      const quotes = [
        makeQuote('Bridge1', 0, 0, '0', false),
        makeQuote('Bridge2', 0, 0, '0', false),
      ];

      const ranked = service.scoreAndRank(quotes, 'score');
      expect(ranked).toHaveLength(2);
      ranked.forEach((q) => expect(q.supported).toBe(false));
    });

    it('should handle single quote', () => {
      const quotes = [makeQuote('OnlyBridge', 2.0, 200, '998.0')];
      const ranked = service.scoreAndRank(quotes, 'score');
      expect(ranked).toHaveLength(1);
      expect(ranked[0].score).toBe(100); // Perfect score when alone
    });
  });

  describe('scoreAndRank - cost strategy', () => {
    it('should rank by lowest fee first', () => {
      const quotes = [
        makeQuote('Expensive', 10.0, 60, '990.0'),
        makeQuote('Cheap', 1.0, 300, '999.0'),
        makeQuote('Medium', 5.0, 120, '995.0'),
      ];

      const ranked = service.scoreAndRank(quotes, 'cost');
      expect(ranked[0].bridgeName).toBe('Cheap');
      expect(ranked[1].bridgeName).toBe('Medium');
      expect(ranked[2].bridgeName).toBe('Expensive');
    });
  });

  describe('scoreAndRank - speed strategy', () => {
    it('should rank by fastest ETA first', () => {
      const quotes = [
        makeQuote('Slow', 1.0, 600, '999.0'),
        makeQuote('Fast', 5.0, 60, '995.0'),
        makeQuote('Medium', 3.0, 300, '997.0'),
      ];

      const ranked = service.scoreAndRank(quotes, 'speed');
      expect(ranked[0].bridgeName).toBe('Fast');
      expect(ranked[1].bridgeName).toBe('Medium');
      expect(ranked[2].bridgeName).toBe('Slow');
    });
  });

  describe('edge cases', () => {
    it('should handle empty quotes array', () => {
      const ranked = service.scoreAndRank([], 'score');
      expect(ranked).toEqual([]);
    });

    it('should handle quotes with identical fees (no division by zero)', () => {
      const quotes = [
        makeQuote('Bridge1', 2.0, 100, '998.0'),
        makeQuote('Bridge2', 2.0, 200, '998.0'),
      ];

      expect(() => service.scoreAndRank(quotes, 'cost')).not.toThrow();
    });

    it('should not mutate original quotes array', () => {
      const quotes = [
        makeQuote('Bridge1', 1.5, 120, '998.5'),
        makeQuote('Bridge2', 3.0, 60, '997.0'),
      ];
      const original = [...quotes];
      service.scoreAndRank(quotes, 'score');
      expect(quotes[0]).toBe(original[0]);
      expect(quotes[1]).toBe(original[1]);
    });
  });
});
