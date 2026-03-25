import { Test, TestingModule } from '@nestjs/testing';
import { SlippageService } from '../src/bridge-compare/slippage.service';
import { RawBridgeQuote } from '../src/bridge-compare/interfaces';

const mockRawQuote = (id: string): RawBridgeQuote => ({
  bridgeId: id,
  bridgeName: id,
  outputAmount: 99,
  feesUsd: 0.5,
  gasCostUsd: 0.5,
  estimatedTimeSeconds: 60,
  steps: [],
});

describe('SlippageService', () => {
  let service: SlippageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SlippageService],
    }).compile();

    service = module.get<SlippageService>(SlippageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('estimateSlippage', () => {
    it('returns high confidence for small amounts on known token', () => {
      const result = service.estimateSlippage(mockRawQuote('stargate'), 'USDC', 'ethereum', 100);
      expect(result.confidence).toBe('high');
      expect(result.expectedSlippage).toBeGreaterThanOrEqual(0);
      expect(result.maxSlippage).toBeGreaterThan(result.expectedSlippage);
    });

    it('returns low confidence for large amounts relative to pool', () => {
      const result = service.estimateSlippage(mockRawQuote('stargate'), 'USDC', 'ethereum', 5_000_000);
      expect(result.confidence).toBe('low');
    });

    it('returns conservative estimate for unknown token/chain', () => {
      const result = service.estimateSlippage(mockRawQuote('unknown'), 'UNKNOWN', 'unknownchain', 100);
      expect(result.confidence).toBe('low');
      expect(result.expectedSlippage).toBeGreaterThan(0);
    });

    it('returns medium confidence for mid-range amounts', () => {
      const result = service.estimateSlippage(mockRawQuote('stargate'), 'USDC', 'ethereum', 500_000);
      expect(result.confidence).toBe('medium');
    });

    it('slippage increases with larger amounts', () => {
      const small = service.estimateSlippage(mockRawQuote('x'), 'USDC', 'ethereum', 100);
      const large = service.estimateSlippage(mockRawQuote('x'), 'USDC', 'ethereum', 1_000_000);
      expect(large.expectedSlippage).toBeGreaterThan(small.expectedSlippage);
    });
  });

  describe('batchEstimateSlippage', () => {
    it('returns a map with an entry per quote', () => {
      const quotes = [mockRawQuote('a'), mockRawQuote('b'), mockRawQuote('c')];
      const result = service.batchEstimateSlippage(quotes, 'USDC', 'ethereum', 100);
      expect(result.size).toBe(3);
      expect(result.has('a')).toBe(true);
      expect(result.has('b')).toBe(true);
      expect(result.has('c')).toBe(true);
    });

    it('returns empty map for empty quotes array', () => {
      const result = service.batchEstimateSlippage([], 'USDC', 'ethereum', 100);
      expect(result.size).toBe(0);
    });
  });
});
