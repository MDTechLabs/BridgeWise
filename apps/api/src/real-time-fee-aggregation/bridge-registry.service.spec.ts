import { Test, TestingModule } from '@nestjs/testing';
import { BridgeRegistryService } from '../src/services/bridge-registry.service';
import { BridgeAdapter, NormalizedQuote, QuoteRequest } from '../src/interfaces/bridge-adapter.interface';

const makeAdapter = (name: string, supported = true): BridgeAdapter => ({
  name,
  supportsRoute: jest.fn().mockReturnValue(supported),
  getQuote: jest.fn().mockResolvedValue({
    bridgeName: name,
    totalFeeUSD: 1.5,
    feeToken: 'USDC',
    estimatedArrivalTime: 180,
    outputAmount: '998.5',
    supported: true,
  } as NormalizedQuote),
});

describe('BridgeRegistryService', () => {
  let service: BridgeRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BridgeRegistryService],
    }).compile();

    service = module.get<BridgeRegistryService>(BridgeRegistryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should register a single adapter', () => {
    const adapter = makeAdapter('TestBridge');
    service.register(adapter);
    expect(service.count).toBe(1);
  });

  it('should register multiple adapters', () => {
    service.register(makeAdapter('Bridge1'));
    service.register(makeAdapter('Bridge2'));
    service.register(makeAdapter('Bridge3'));
    expect(service.count).toBe(3);
  });

  it('should overwrite duplicate adapter names', () => {
    const original = makeAdapter('DupBridge');
    const replacement = makeAdapter('DupBridge');
    service.register(original);
    service.register(replacement);
    expect(service.count).toBe(1);
    expect(service.getAdapter('DupBridge')).toBe(replacement);
  });

  it('should list all registered adapters', () => {
    const a1 = makeAdapter('A');
    const a2 = makeAdapter('B');
    service.register(a1);
    service.register(a2);
    const list = service.listAdapters();
    expect(list).toHaveLength(2);
    expect(list).toContain(a1);
    expect(list).toContain(a2);
  });

  it('should return undefined for unknown adapter', () => {
    expect(service.getAdapter('NonExistent')).toBeUndefined();
  });

  it('should return empty array when no adapters registered', () => {
    expect(service.listAdapters()).toEqual([]);
    expect(service.count).toBe(0);
  });
});
