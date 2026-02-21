import { BridgeLiquidityMonitor, prioritizeRoutesByLiquidity } from '../monitor';
import type { BridgeLiquidityProvider } from '../types';
import type { BridgeRoute } from '../../../../bridge-core/src/types';

const makeStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: jest.fn((key: string) => store.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: jest.fn((key: string) => {
      store.delete(key);
    }),
  };
};

describe('BridgeLiquidityMonitor', () => {
  beforeEach(() => {
    const localStorage = makeStorage();
    Object.defineProperty(global, 'window', {
      configurable: true,
      writable: true,
      value: { localStorage },
    });
  });

  afterEach(() => {
    delete (global as { window?: unknown }).window;
  });

  it('returns provider liquidity data when available', async () => {
    const providers: BridgeLiquidityProvider[] = [
      {
        name: 'hop',
        fetchLiquidity: async () => ({
          bridgeName: 'hop',
          token: 'USDC',
          sourceChain: 'ethereum',
          destinationChain: 'stellar',
          availableAmount: 1200,
          timestamp: new Date('2026-01-01T00:00:00.000Z'),
        }),
      },
    ];

    const monitor = new BridgeLiquidityMonitor({ providers, storageKey: 'liq-test' });
    const result = await monitor.getLiquidity({
      token: 'USDC',
      sourceChain: 'ethereum',
      destinationChain: 'stellar',
    });

    expect(result.liquidity).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(result.usedFallback).toBe(false);
  });

  it('falls back to cached liquidity when providers fail', async () => {
    const healthyProviders: BridgeLiquidityProvider[] = [
      {
        name: 'hop',
        fetchLiquidity: async () => ({
          bridgeName: 'hop',
          token: 'USDC',
          sourceChain: 'ethereum',
          destinationChain: 'stellar',
          availableAmount: 1200,
          timestamp: new Date('2026-01-01T00:00:00.000Z'),
        }),
      },
    ];

    const failingProviders: BridgeLiquidityProvider[] = [
      {
        name: 'hop',
        fetchLiquidity: async () => {
          throw new Error('unavailable');
        },
      },
    ];

    const seed = new BridgeLiquidityMonitor({ providers: healthyProviders, storageKey: 'liq-test' });
    await seed.getLiquidity({
      token: 'USDC',
      sourceChain: 'ethereum',
      destinationChain: 'stellar',
    });

    const monitor = new BridgeLiquidityMonitor({ providers: failingProviders, storageKey: 'liq-test' });
    const result = await monitor.getLiquidity({
      token: 'USDC',
      sourceChain: 'ethereum',
      destinationChain: 'stellar',
    });

    expect(result.usedFallback).toBe(true);
    expect(result.liquidity).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
  });
});

describe('prioritizeRoutesByLiquidity', () => {
  it('orders routes by available liquidity descending', () => {
    const routes = [
      { provider: 'hop', id: '1' },
      { provider: 'layerzero', id: '2' },
    ] as BridgeRoute[];

    const ordered = prioritizeRoutesByLiquidity(routes, [
      {
        bridgeName: 'hop',
        token: 'USDC',
        sourceChain: 'ethereum',
        destinationChain: 'stellar',
        availableAmount: 100,
        timestamp: new Date(),
      },
      {
        bridgeName: 'layerzero',
        token: 'USDC',
        sourceChain: 'ethereum',
        destinationChain: 'stellar',
        availableAmount: 1000,
        timestamp: new Date(),
      },
    ]);

    expect(ordered[0].provider).toBe('layerzero');
    expect(ordered[1].provider).toBe('hop');
  });
});
