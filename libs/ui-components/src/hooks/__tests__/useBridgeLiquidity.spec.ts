import { BridgeLiquidityMonitor } from '../../liquidity/monitor';
import { fetchBridgeLiquiditySnapshot } from '../useBridgeLiquidity';

describe('useBridgeLiquidity helpers', () => {
  it('fetches liquidity snapshot with normalized response shape', async () => {
    const monitor = new BridgeLiquidityMonitor({
      providers: [
        {
          name: 'hop',
          fetchLiquidity: async () => ({
            bridgeName: 'hop',
            token: 'USDC',
            sourceChain: 'ethereum',
            destinationChain: 'stellar',
            availableAmount: 333,
            timestamp: new Date('2026-01-01T00:00:00.000Z'),
          }),
        },
      ],
    });

    const result = await fetchBridgeLiquiditySnapshot(monitor, {
      token: 'USDC',
      sourceChain: 'ethereum',
      destinationChain: 'stellar',
    });

    expect(result.usedFallback).toBe(false);
    expect(result.errors).toHaveLength(0);
    expect(result.liquidity[0].availableAmount).toBe(333);
  });
});
