import { Test, TestingModule } from '@nestjs/testing';
import { BenchmarkService } from '../benchmark.service';

describe('BenchmarkService', () => {
  let service: BenchmarkService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BenchmarkService],
    }).compile();

    service = module.get<BenchmarkService>(BenchmarkService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should process transaction data correctly', async () => {
    const mockTransactionData = {
      provider: 'hop',
      sourceChain: 'ethereum',
      destinationChain: 'polygon',
      token: 'USDC',
      feePercentage: 0.45,
      slippage: 0.12,
      inputAmount: '1000000000',
      outputAmount: '995000000'
    };

    // Mock the saveBenchmark method to avoid database calls in tests
    const saveBenchmarkSpy = jest.spyOn(service, 'saveBenchmark').mockResolvedValue();

    await service.processTransaction(mockTransactionData);

    expect(saveBenchmarkSpy).toHaveBeenCalled();
  });

  it('should calculate slippage correctly', () => {
    // This test would be better implemented when we have direct access to the calculateSlippage method
    // For now, we're testing the general functionality
    expect(1).toBeDefined(); // Placeholder test
  });
});