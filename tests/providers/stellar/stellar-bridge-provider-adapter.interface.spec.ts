import type {
  StellarBridgeExecutionRequest,
  StellarBridgeExecutionResult,
  StellarBridgeProviderAdapter,
  StellarBridgeProviderError,
  StellarBridgeProviderOperation,
  StellarBridgeQuote,
  StellarBridgeQuoteRequest,
  StellarBridgeRoute,
  StellarBridgeStatusRequest,
  StellarBridgeStatusResult,
} from '../../../src/providers/stellar/adapters';

const quoteRequest: StellarBridgeQuoteRequest = {
  sourceChain: 'stellar',
  destinationChain: 'ethereum',
  sourceAsset: 'USDC',
  destinationAsset: 'USDC',
  amount: '100',
  sender: 'G_SOURCE',
  recipient: '0xRecipient',
  slippage: 0.5,
};

const route: StellarBridgeRoute = {
  id: 'route-1',
  fromChain: quoteRequest.sourceChain,
  toChain: quoteRequest.destinationChain,
  fromToken: quoteRequest.sourceAsset,
  toToken: quoteRequest.destinationAsset,
  amount: quoteRequest.amount,
  fee: {
    amount: '0.10',
    token: 'USDC',
    usdValue: 0.1,
  },
  estimatedTime: 1,
  successRate: 0.98,
  provider: 'stub-provider',
  slippage: quoteRequest.slippage,
  confidence: 0.95,
};

const quote: StellarBridgeQuote = {
  id: 'quote-1',
  providerId: 'stub-provider',
  providerName: 'Stub Provider',
  route: {
    sourceChain: quoteRequest.sourceChain,
    destinationChain: quoteRequest.destinationChain,
    sourceAsset: quoteRequest.sourceAsset,
    destinationAsset: quoteRequest.destinationAsset,
    hops: 1,
  },
  fees: {
    bridgeFeeBps: 10,
    bridgeFeeFlatUsdCents: 5,
    networkFeeUsdCents: 5,
    totalFeeUsdCents: 10,
    feeToken: 'USDC',
  },
  execution: {
    estimatedTimeSeconds: 60,
    successRate: 0.98,
  },
  output: {
    inputAmount: '100',
    outputAmount: '99.9',
    netOutputAmount: '99.8',
    minOutputAmount: '99.3',
  },
  metadata: {},
  quotedAt: 1_700_000_000_000,
  expiresAt: 1_700_000_060_000,
};

class StubStellarBridgeProviderAdapter
  implements StellarBridgeProviderAdapter
{
  readonly providerId = 'stub-provider';

  async getQuote(
    request: StellarBridgeQuoteRequest,
  ): Promise<StellarBridgeQuote> {
    return {
      ...quote,
      route: {
        ...quote.route,
        sourceChain: request.sourceChain,
        destinationChain: request.destinationChain,
        sourceAsset: request.sourceAsset,
        destinationAsset: request.destinationAsset,
      },
      output: {
        ...quote.output,
        inputAmount: request.amount,
      },
    };
  }

  async getRoutes(
    request: StellarBridgeQuoteRequest,
  ): Promise<StellarBridgeRoute[]> {
    return [
      {
        ...route,
        fromChain: request.sourceChain,
        toChain: request.destinationChain,
        fromToken: request.sourceAsset,
        toToken: request.destinationAsset,
        amount: request.amount,
      },
    ];
  }

  async execute(
    request: StellarBridgeExecutionRequest,
  ): Promise<StellarBridgeExecutionResult> {
    return {
      providerId: this.providerId,
      routeId: request.route.id,
      executionId: 'execution-1',
      status: 'submitted',
      transactionHash: 'tx_hash_1',
      submittedAt: 1_700_000_001_000,
      metadata: request.metadata,
    };
  }

  async getStatus(
    request: StellarBridgeStatusRequest,
  ): Promise<StellarBridgeStatusResult> {
    return {
      providerId: this.providerId,
      executionId: request.executionId,
      status: 'completed',
      transactionHash: request.transactionHash,
      updatedAt: 1_700_000_002_000,
    };
  }

  normalizeError(
    error: unknown,
    operation: StellarBridgeProviderOperation,
  ): StellarBridgeProviderError {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = /timeout/i.test(message);

    return {
      providerId: this.providerId,
      operation,
      code: timedOut ? 'TIMEOUT' : 'UNKNOWN',
      message,
      retryable: timedOut,
      details: { source: 'stub' },
    };
  }
}

describe('StellarBridgeProviderAdapter contract', () => {
  let adapter: StellarBridgeProviderAdapter;

  beforeEach(() => {
    adapter = new StubStellarBridgeProviderAdapter();
  });

  it('exposes the complete adapter surface', () => {
    expect(adapter.providerId).toBe('stub-provider');
    expect(typeof adapter.getQuote).toBe('function');
    expect(typeof adapter.getRoutes).toBe('function');
    expect(typeof adapter.execute).toBe('function');
    expect(typeof adapter.getStatus).toBe('function');
    expect(typeof adapter.normalizeError).toBe('function');
  });

  it('returns a normalized quote from getQuote()', async () => {
    const result = await adapter.getQuote(quoteRequest);

    expect(result.providerId).toBe(adapter.providerId);
    expect(result.route).toMatchObject({
      sourceChain: 'stellar',
      destinationChain: 'ethereum',
      sourceAsset: 'USDC',
      destinationAsset: 'USDC',
    });
    expect(result.output.inputAmount).toBe('100');
    expect(result.fees.totalFeeUsdCents).toBe(10);
  });

  it('returns routing-compatible routes from getRoutes()', async () => {
    const [result] = await adapter.getRoutes(quoteRequest);

    expect(result).toMatchObject({
      id: 'route-1',
      provider: adapter.providerId,
      fromChain: 'stellar',
      toChain: 'ethereum',
      fromToken: 'USDC',
      toToken: 'USDC',
      amount: '100',
    });
    expect(result.fee.token).toBe('USDC');
    expect(result.successRate).toBeGreaterThan(0);
  });

  it('executes a selected route through the standard execution contract', async () => {
    const result = await adapter.execute({
      route,
      quote,
      signedTransaction: 'signed-envelope',
      metadata: { requestId: 'req-1' },
    });

    expect(result).toMatchObject({
      providerId: adapter.providerId,
      routeId: route.id,
      executionId: 'execution-1',
      status: 'submitted',
      transactionHash: 'tx_hash_1',
    });
    expect(result.submittedAt).toBeGreaterThan(0);
  });

  it('checks execution status through the standard status contract', async () => {
    const result = await adapter.getStatus({
      executionId: 'execution-1',
      transactionHash: 'tx_hash_1',
    });

    expect(result).toMatchObject({
      providerId: adapter.providerId,
      executionId: 'execution-1',
      status: 'completed',
      transactionHash: 'tx_hash_1',
    });
    expect(result.updatedAt).toBeGreaterThan(0);
  });

  it('normalizes provider-specific failures into the provider error contract', () => {
    const result = adapter.normalizeError(
      new Error('provider timeout'),
      'quote',
    );

    expect(result).toEqual({
      providerId: adapter.providerId,
      operation: 'quote',
      code: 'TIMEOUT',
      message: 'provider timeout',
      retryable: true,
      details: { source: 'stub' },
    });
  });
});
