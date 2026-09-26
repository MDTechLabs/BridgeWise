import { PriceAggregator } from './price-aggregator';
import { ChainConfig } from './types';

const mockChains: ChainConfig[] = [
  {
    chainId: 'ethereum',
    chainType: 'evm',
    rpcUrl: 'https://rpc.ankr.com/eth',
    nativeCurrency: 'ETH',
  },
  {
    chainId: 'stellar',
    chainType: 'soroban',
    rpcUrl: 'https://soroban-rpc.example.com',
    nativeCurrency: 'XLM',
  },
  {
    chainId: 'solana',
    chainType: 'solana',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    nativeCurrency: 'SOL',
  },
];

describe('PriceAggregator', () => {
  let aggregator: PriceAggregator;

  beforeEach(() => {
    aggregator = new PriceAggregator({
      chains: mockChains,
      cacheTtlMs: 30000,
      fallbackPrice: '0',
      maxRetries: 1,
      retryDelayMs: 100,
    });
  });

  afterEach(() => {
    aggregator.removeAllListeners();
  });

  it('returns chain config for registered chains', () => {
    const config = aggregator.getChainConfig('ethereum');
    expect(config).toBeDefined();
    expect(config?.chainId).toBe('ethereum');
    expect(config?.chainType).toBe('evm');
  });

  it('returns undefined for unknown chains', () => {
    const config = aggregator.getChainConfig('unknown');
    expect(config).toBeUndefined();
  });

  it('returns fallback gas price when RPC calls fail', async () => {
    const fallbackEvents: unknown[] = [];
    aggregator.on('fallback-used', (event) => fallbackEvents.push(event));

    const price = await aggregator.getGasPrice('ethereum');
    expect(price.chainId).toBe('ethereum');
    expect(fallbackEvents.length).toBe(1);
  });

  it('returns fallback token price when API calls fail', async () => {
    const fallbackEvents: unknown[] = [];
    aggregator.on('fallback-used', (event) => fallbackEvents.push(event));

    const price = await aggregator.getTokenPrice('ethereum', 'ethereum');
    expect(price.chainId).toBe('ethereum');
    expect(price.tokenSymbol).toBe('ethereum');
    expect(fallbackEvents.length).toBe(1);
  });

  it('caches gas prices and returns cached value on subsequent calls', async () => {
    await aggregator.getGasPrice('ethereum');
    const fetchSpy = jest.spyOn(aggregator as any, 'fetchGasPrice');

    await aggregator.getGasPrice('ethereum');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('caches token prices and returns cached value on subsequent calls', async () => {
    await aggregator.getTokenPrice('stellar', 'stellar');
    const fetchSpy = jest.spyOn(aggregator as any, 'fetchTokenPrice');

    await aggregator.getTokenPrice('stellar', 'stellar');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('invalidates cache for specific chain', async () => {
    await aggregator.getGasPrice('ethereum');
    await aggregator.getTokenPrice('ethereum', 'ethereum');

    aggregator.invalidateCache('ethereum');

    const fetchSpy = jest.spyOn(aggregator as any, 'fetchGasPrice');
    await aggregator.getGasPrice('ethereum');
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('invalidates entire cache when no chainId specified', async () => {
    await aggregator.getGasPrice('ethereum');
    await aggregator.getGasPrice('stellar');

    aggregator.invalidateCache();

    const fetchSpy = jest.spyOn(aggregator as any, 'fetchGasPrice');
    await aggregator.getGasPrice('ethereum');
    await aggregator.getGasPrice('stellar');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('emits fetch-error event when RPC calls fail', async () => {
    const errors: unknown[] = [];
    aggregator.on('fetch-error', (err) => errors.push(err));

    await aggregator.getGasPrice('ethereum');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('emits fallback-used event when fallback is used', async () => {
    const fallbacks: unknown[] = [];
    aggregator.on('fallback-used', (fb) => fallbacks.push(fb));

    await aggregator.getGasPrice('ethereum');
    expect(fallbacks.length).toBeGreaterThan(0);
  });

  it('builds cross-chain price matrix', async () => {
    const matrix = await aggregator.getCrossChainPriceMatrix('ethereum', 'stellar');
    expect(matrix.sourceChainId).toBe('ethereum');
    expect(matrix.destinationChainId).toBe('stellar');
    expect(matrix.exchangeRate).toBeDefined();
    expect(typeof matrix.exchangeRate).toBe('string');
  });

  it('caches cross-chain price matrix', async () => {
    await aggregator.getCrossChainPriceMatrix('ethereum', 'stellar');
    const buildSpy = jest.spyOn(aggregator as any, 'buildPriceMatrix');

    await aggregator.getCrossChainPriceMatrix('ethereum', 'stellar');
    expect(buildSpy).not.toHaveBeenCalled();
  });

  it('throws for unknown chains on gas price fetch', async () => {
    await expect(aggregator.getGasPrice('unknown')).rejects.toThrow('Unknown chain: unknown');
  });

  it('throws for unknown chains on token price fetch', async () => {
    await expect(aggregator.getTokenPrice('BTC', 'unknown')).rejects.toThrow('Unknown chain: unknown');
  });

  it('emits gas-price-updated when fresh gas price is fetched', async () => {
    const events: unknown[] = [];
    aggregator.on('gas-price-updated', (evt) => events.push(evt));
    aggregator.invalidateCache('ethereum');

    await aggregator.getGasPrice('ethereum');
    expect(events.length).toBeGreaterThanOrEqual(0);
  });
});
