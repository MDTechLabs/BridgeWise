import { RouteQuote, RouteSorter } from '../../src/utils/route-sorter';

describe('RouteSorter Unit Tests (#105)', () => {
  const sampleRoutes: RouteQuote[] = [
    {
      id: 'route-evm-1',
      provider: 'HopProtocol',
      fromChain: 'ethereum',
      toChain: 'polygon',
      fromToken: 'USDC',
      toToken: 'USDC',
      inputAmount: '100',
      outputAmount: '99.5',
      outputTokenDecimals: 18,
      gasFee: { amount: '0.005', decimals: 18, exchangeRateToUsd: 2000 }, // $10.00
      estimatedTimeSeconds: 300,
      availableLiquidity: '10000',
      status: 'success',
    },
    {
      id: 'route-soroban-1',
      provider: 'StellarBridge',
      fromChain: 'stellar',
      toChain: 'ethereum',
      fromToken: 'USDC',
      toToken: 'USDC',
      inputAmount: '100',
      outputAmount: '99.8',
      outputTokenDecimals: 6,
      gasFee: { amount: '10000', decimals: 7, exchangeRateToUsd: 0.1 }, // $0.10
      estimatedTimeSeconds: 10,
      availableLiquidity: '50000',
      status: 'success',
    },
    {
      id: 'route-evm-2',
      provider: 'Across',
      fromChain: 'ethereum',
      toChain: 'arbitrum',
      fromToken: 'USDC',
      toToken: 'USDC',
      inputAmount: '100',
      outputAmount: '99.7',
      outputTokenDecimals: 18,
      gasFee: { amount: '0.001', decimals: 18, exchangeRateToUsd: 2000 }, // $2.00
      estimatedTimeSeconds: 60,
      availableLiquidity: '100000',
      status: 'success',
    },
  ];

  it('should sort routes by Highest Output Amount correctly with EVM (18) and Soroban (6) decimals', () => {
    const sorted = RouteSorter.sortRoutes(sampleRoutes, 'highest_output');
    expect(sorted[0].id).toBe('route-soroban-1'); // 99.8
    expect(sorted[1].id).toBe('route-evm-2'); // 99.7
    expect(sorted[2].id).toBe('route-evm-1'); // 99.5
  });

  it('should sort routes by Lowest Gas Fee in USD', () => {
    const sorted = RouteSorter.sortRoutes(sampleRoutes, 'lowest_gas');
    expect(sorted[0].id).toBe('route-soroban-1'); // $0.10
    expect(sorted[1].id).toBe('route-evm-2'); // $2.00
    expect(sorted[2].id).toBe('route-evm-1'); // $10.00
  });

  it('should sort routes by Shortest Execution Time', () => {
    const sorted = RouteSorter.sortRoutes(sampleRoutes, 'shortest_time');
    expect(sorted[0].id).toBe('route-soroban-1'); // 10s
    expect(sorted[1].id).toBe('route-evm-2'); // 60s
    expect(sorted[2].id).toBe('route-evm-1'); // 300s
  });

  it('should handle zero liquidity and failed quote edge cases by placing them last', () => {
    const routesWithEdgeCases: RouteQuote[] = [
      ...sampleRoutes,
      {
        id: 'route-failed',
        provider: 'FailedProvider',
        fromChain: 'ethereum',
        toChain: 'stellar',
        fromToken: 'USDC',
        toToken: 'USDC',
        inputAmount: '100',
        outputAmount: '100.0',
        outputTokenDecimals: 6,
        gasFee: { amount: '0', decimals: 6 },
        estimatedTimeSeconds: 1,
        availableLiquidity: '1000',
        status: 'failed',
      },
      {
        id: 'route-no-liquidity',
        provider: 'DryProvider',
        fromChain: 'ethereum',
        toChain: 'stellar',
        fromToken: 'USDC',
        toToken: 'USDC',
        inputAmount: '100',
        outputAmount: '100.0',
        outputTokenDecimals: 6,
        gasFee: { amount: '0', decimals: 6 },
        estimatedTimeSeconds: 1,
        availableLiquidity: '0',
        status: 'success',
      },
    ];

    const sorted = RouteSorter.sortRoutes(routesWithEdgeCases, 'highest_output');
    const lastTwoIds = sorted.slice(-2).map((r) => r.id);
    expect(lastTwoIds).toContain('route-failed');
    expect(lastTwoIds).toContain('route-no-liquidity');
  });

  it('should handle raw integer string formatting for base units', () => {
    const normInt = RouteSorter.normalizeAmount('1000000', 6);
    expect(normInt).toBe(1);

    const normFloat = RouteSorter.normalizeAmount('99.5', 18);
    expect(normFloat).toBe(99.5);

    const normInvalid = RouteSorter.normalizeAmount('invalid', 6);
    expect(normInvalid).toBe(0);
  });
});
