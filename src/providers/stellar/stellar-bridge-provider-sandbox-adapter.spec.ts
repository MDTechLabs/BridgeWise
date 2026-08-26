import { StellarBridgeProviderSandboxAdapter } from './stellar-bridge-provider-sandbox-adapter';

describe('StellarBridgeProviderSandboxAdapter', () => {
  let adapter: StellarBridgeProviderSandboxAdapter;

  beforeEach(() => {
    adapter = new StellarBridgeProviderSandboxAdapter('sandbox-1', {
      flatFeeUsdCents: 50, // 0.50 USD
      feeBps: 20, // 0.2%
    });
  });

  it('should calculate quote and fees correctly', async () => {
    const quote = await adapter.getQuote('1000', 'USDC', 'USDC', 'stellar', 'ethereum');
    
    // Fee = 0.50 + (1000 * 0.002) = 0.50 + 2.0 = 2.50
    expect(quote.feeAmount).toBe('2.500000');
    expect(quote.receiveAmount).toBe('997.500000');
    expect(quote.providerId).toBe('sandbox-1');
  });

  it('should simulate quote latency when configured', async () => {
    adapter.setSimulatedLatency(50);
    const start = Date.now();
    await adapter.getQuote('100', 'USDC', 'USDC', 'stellar', 'ethereum');
    const duration = Date.now() - start;
    expect(duration).toBeGreaterThanOrEqual(45);
  });

  it('should throw an error during quote if failure simulation is enabled', async () => {
    adapter.setSimulateFailure(true);
    await expect(
      adapter.getQuote('100', 'USDC', 'USDC', 'stellar', 'ethereum')
    ).rejects.toThrow('Sandbox simulation error');
  });

  it('should return SUCCESS execution on transfer', async () => {
    const quote = await adapter.getQuote('100', 'USDC', 'USDC', 'stellar', 'ethereum');
    const result = await adapter.executeTransfer('0xabc123', quote);

    expect(result.status).toBe('SUCCESS');
    expect(result.destinationTxHash).toBeDefined();
    expect(result.destinationTxHash.startsWith('0x')).toBe(true);
    expect(result.feePaid).toBe(quote.feeAmount);
    expect(result.receiveAmount).toBe(quote.receiveAmount);
  });

  it('should return FAILED execution on transfer if failure simulation is enabled', async () => {
    const quote = await adapter.getQuote('100', 'USDC', 'USDC', 'stellar', 'ethereum');
    adapter.setSimulateFailure(true);
    const result = await adapter.executeTransfer('0xabc123', quote);

    expect(result.status).toBe('FAILED');
    expect(result.destinationTxHash).toBe('');
    expect(result.error).toBeDefined();
  });
});
