import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { QuotesController } from '../src/quotes.controller';
import { FeeAggregationService } from '../src/services/fee-aggregation.service';
import { CompareQuotesResponseDto } from '../src/dto/get-quotes.dto';

const mockResult: CompareQuotesResponseDto = {
  fromChain: 1,
  toChain: 137,
  token: 'USDC',
  amount: '1000',
  fetchedAt: new Date().toISOString(),
  quotes: [
    {
      bridgeName: 'Across',
      totalFeeUSD: 1.5,
      feeToken: 'USDC',
      estimatedArrivalTime: 120,
      outputAmount: '998.5',
      score: 85.5,
      supported: true,
    },
  ],
};

const mockAggregationService = {
  compareQuotes: jest.fn().mockResolvedValue(mockResult),
};

describe('QuotesController', () => {
  let controller: QuotesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuotesController],
      providers: [
        { provide: FeeAggregationService, useValue: mockAggregationService },
      ],
    }).compile();

    controller = module.get<QuotesController>(QuotesController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /quotes/compare', () => {
    const validQuery = {
      fromChain: '1',
      toChain: '137',
      token: 'USDC',
      amount: '1000',
    };

    it('should return compare quotes result for valid input', async () => {
      mockAggregationService.compareQuotes.mockResolvedValueOnce(mockResult);

      const result = await controller.compareQuotes(validQuery);

      expect(result).toEqual(mockResult);
      expect(mockAggregationService.compareQuotes).toHaveBeenCalledWith(
        { fromChain: 1, toChain: 137, token: 'USDC', amount: '1000' },
        'score',
      );
    });

    it('should pass rankBy parameter to the service', async () => {
      mockAggregationService.compareQuotes.mockResolvedValueOnce(mockResult);

      await controller.compareQuotes({ ...validQuery, rankBy: 'cost' });

      expect(mockAggregationService.compareQuotes).toHaveBeenCalledWith(
        expect.any(Object),
        'cost',
      );
    });

    it('should uppercase token symbol', async () => {
      mockAggregationService.compareQuotes.mockResolvedValueOnce(mockResult);

      await controller.compareQuotes({ ...validQuery, token: 'usdc' });

      expect(mockAggregationService.compareQuotes).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'USDC' }),
        'score',
      );
    });

    it('should throw BadRequestException for missing fromChain', async () => {
      const { fromChain, ...invalidQuery } = validQuery;

      await expect(controller.compareQuotes(invalidQuery as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for missing token', async () => {
      const { token, ...invalidQuery } = validQuery;

      await expect(controller.compareQuotes(invalidQuery as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for invalid rankBy', async () => {
      await expect(
        controller.compareQuotes({ ...validQuery, rankBy: 'invalid' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for missing amount', async () => {
      const { amount, ...invalidQuery } = validQuery;

      await expect(controller.compareQuotes(invalidQuery as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should default rankBy to score when not provided', async () => {
      mockAggregationService.compareQuotes.mockResolvedValueOnce(mockResult);

      await controller.compareQuotes(validQuery);

      expect(mockAggregationService.compareQuotes).toHaveBeenCalledWith(
        expect.any(Object),
        'score',
      );
    });
  });
});
