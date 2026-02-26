import { Test, TestingModule } from '@nestjs/testing';
import { FeeAggregationService, QUOTE_TIMEOUT_MS } from '../src/services/fee-aggregation.service';
import { BridgeRegistryService } from '../src/services/bridge-registry.service';
import { QuoteScoringService } from '../src/services/quote-scoring.service';
import { BridgeAdapter, NormalizedQuote, QuoteRequest } from '../src/interfaces/bridge-adapter.interface';

jest.useFakeTimers();

const makeAdapter = (
  name: string,
  quote: Partial<NormalizedQuote> = {},
  supportsRoute = true,
  delay = 0,
): BridgeAdapter => ({
  name,
  supportsRoute: jest.fn().mockReturnValue(supportsRoute),
  getQuote: jest.fn().mockImplementation(() =>
    new Promise((resolve) =>
      setTimeout(
        () =>
          resolve({
            bridgeName: name,
            totalFeeUSD: 2.5,
            feeToken: 'USDC',
            estimatedArrivalTime: 180,
            outputAmount: '997.5',
            supported: true,
            ...quote,
          }),
        delay,
      ),
    ),
  ),
});

const defaultRequest: QuoteRequest = {
  fromChain: 1,
  toChain: 137,
  token: 'USDC',
  amount: '1000',
};

describe('FeeAggregationService', () => {
  let service: FeeAggregationService;
  let registry: BridgeRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FeeAggregationService, BridgeRegistryService, QuoteScoringService],
    }).compile();

    service = module.get<FeeAggregationService>(FeeAggregationService);
    registry = module.get<BridgeRegistryService>(BridgeRegistryService);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('compareQuotes', () => {
    it('should return empty quotes array when no adapters registered', async () => {
      const promise = service.compareQuotes(defaultRequest);
      jest.runAllTimers();
      const result = await promise;

      expect(result.quotes).toEqual([]);
      expect(result.fromChain).toBe(1);
      expect(result.toChain).toBe(137);
      expect(result.token).toBe('USDC');
      expect(result.amount).toBe('1000');
      expect(result.fetchedAt).toBeDefined();
    });

    it('should return quotes from all registered adapters', async () => {
      registry.register(makeAdapter('Across'));
      registry.register(makeAdapter('Hop'));

      const promise = service.compareQuotes(defaultRequest);
      jest.runAllTimers();
      const result = await promise;

      expect(result.quotes).toHaveLength(2);
    });

    it('should include metadata in response', async () => {
      const promise = service.compareQuotes(defaultRequest);
      jest.runAllTimers();
      const result = await promise;

      expect(result.fromChain).toBe(defaultRequest.fromChain);
      expect(result.toChain).toBe(defaultRequest.toChain);
      expect(result.token).toBe(defaultRequest.token);
      expect(result.amount).toBe(defaultRequest.amount);
      expect(new Date(result.fetchedAt).toISOString()).toBe(result.fetchedAt);
    });

    it('should handle partial adapter failures gracefully', async () => {
      registry.register(makeAdapter('GoodBridge'));
      registry.register({
        name: 'FailingBridge',
        supportsRoute: jest.fn().mockReturnValue(true),
        getQuote: jest.fn().mockRejectedValue(new Error('RPC unavailable')),
      });

      const promise = service.compareQuotes(defaultRequest);
      jest.runAllTimers();
      const result = await promise;

      expect(result.quotes).toHaveLength(2);
      const failing = result.quotes.find((q) => q.bridgeName === 'FailingBridge');
      expect(failing?.supported).toBe(false);
      expect(failing?.error).toBe('RPC unavailable');
    });

    it('should mark unsupported routes correctly', async () => {
      registry.register(makeAdapter('SupportedBridge', {}, true));
      registry.register(makeAdapter('UnsupportedBridge', {}, false));

      const promise = service.compareQuotes(defaultRequest);
      jest.runAllTimers();
      const result = await promise;

      const unsupported = result.quotes.find((q) => q.bridgeName === 'UnsupportedBridge');
      expect(unsupported?.supported).toBe(false);
      expect(unsupported?.error).toContain('not supported');
    });

    it('should timeout adapters that exceed QUOTE_TIMEOUT_MS', async () => {
      registry.register(makeAdapter('SlowBridge', {}, true, QUOTE_TIMEOUT_MS + 5000));

      const promise = service.compareQuotes(defaultRequest);
      jest.advanceTimersByTime(QUOTE_TIMEOUT_MS + 1);
      const result = await promise;

      const slow = result.quotes.find((q) => q.bridgeName === 'SlowBridge');
      expect(slow?.supported).toBe(false);
      expect(slow?.error).toContain('Timeout');
    });

    it('should not call getQuote for unsupported routes', async () => {
      const adapter = makeAdapter('SelectiveBridge', {}, false);
      registry.register(adapter);

      const promise = service.compareQuotes(defaultRequest);
      jest.runAllTimers();
      await promise;

      expect(adapter.getQuote).not.toHaveBeenCalled();
    });

    it('should apply cost ranking strategy', async () => {
      registry.register(makeAdapter('ExpensiveBridge', { totalFeeUSD: 10 }));
      registry.register(makeAdapter('CheapBridge', { totalFeeUSD: 1 }));

      const promise = service.compareQuotes(defaultRequest, 'cost');
      jest.runAllTimers();
      const result = await promise;

      const supported = result.quotes.filter((q) => q.supported);
      expect(supported[0].bridgeName).toBe('CheapBridge');
    });

    it('should apply speed ranking strategy', async () => {
      registry.register(makeAdapter('SlowBridge', { estimatedArrivalTime: 600 }));
      registry.register(makeAdapter('FastBridge', { estimatedArrivalTime: 60 }));

      const promise = service.compareQuotes(defaultRequest, 'speed');
      jest.runAllTimers();
      const result = await promise;

      const supported = result.quotes.filter((q) => q.supported);
      expect(supported[0].bridgeName).toBe('FastBridge');
    });
  });
});
