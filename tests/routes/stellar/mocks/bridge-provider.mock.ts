import type { Route } from '../../../../src/routing/smart/stellar/soroban-smart-routing-engine';

export interface MockProviderConfig {
  id: string;
  reliability: number;
  latencyMs: number;
  feeBase: number;
  /** When set, the mock injects this failure after `failAfter` calls. */
  failureMode?: {
    reason: 'timeout' | 'liquidity' | 'slippage' | 'unavailable';
    failAfter?: number;
  };
}

export interface MockRouteQuote {
  route: Route;
  resolvedAt: number;
  simulatedError?: string;
}

export class MockBridgeProvider {
  readonly id: string;
  readonly config: MockProviderConfig;

  private callCount = 0;
  private readonly capturedCalls: Array<{ sourceChain: string; destinationChain: string; calledAt: number }> = [];

  constructor(config: MockProviderConfig) {
    this.config = config;
    this.id = config.id;
  }

  quoteRoute(
    sourceChain: string,
    destinationChain: string,
    routeId: string,
    contractAddress?: string,
  ): MockRouteQuote {
    this.callCount += 1;
    this.capturedCalls.push({ sourceChain, destinationChain, calledAt: Date.now() });

    const { failureMode } = this.config;
    if (failureMode) {
      const threshold = failureMode.failAfter ?? 0;
      if (this.callCount > threshold) {
        return {
          route: this._buildRoute(routeId, sourceChain, destinationChain, contractAddress),
          resolvedAt: Date.now(),
          simulatedError: `[${this.id}] ${failureMode.reason}`,
        };
      }
    }

    return {
      route: this._buildRoute(routeId, sourceChain, destinationChain, contractAddress),
      resolvedAt: Date.now(),
    };
  }

  /** Number of times this provider has been called. */
  getCallCount(): number {
    return this.callCount;
  }

  getCapturedCalls(): typeof this.capturedCalls {
    return [...this.capturedCalls];
  }

  reset(): void {
    this.callCount = 0;
    this.capturedCalls.length = 0;
  }

  private _buildRoute(
    routeId: string,
    sourceChain: string,
    destinationChain: string,
    contractAddress?: string,
  ): Route {
    return {
      id: routeId,
      provider: this.id,
      sourceChain,
      destinationChain,
      estimatedFee: this.config.feeBase,
      estimatedTimeMs: this.config.latencyMs,
      maxSlippage: 0.5,
      contractAddress,
    };
  }
}

// ─── Factory helpers ──────────────────────────────────────────────────────────

export function createMockProvider(overrides: Partial<MockProviderConfig> & { id: string }): MockBridgeProvider {
  return new MockBridgeProvider({
    reliability: 0.95,
    latencyMs: 3000,
    feeBase: 1.0,
    ...overrides,
  });
}

export const MOCK_PROVIDERS = {
  allbridge: (): MockBridgeProvider =>
    createMockProvider({ id: 'AllBridge', reliability: 0.97, latencyMs: 4200, feeBase: 1.5 }),

  squid: (): MockBridgeProvider =>
    createMockProvider({ id: 'Squid', reliability: 0.93, latencyMs: 6700, feeBase: 2.1 }),

  wormhole: (): MockBridgeProvider =>
    createMockProvider({ id: 'Wormhole', reliability: 0.95, latencyMs: 5100, feeBase: 1.2 }),

  stargate: (): MockBridgeProvider =>
    createMockProvider({ id: 'Stargate', reliability: 0.91, latencyMs: 3500, feeBase: 0.6 }),

  unstable: (): MockBridgeProvider =>
    createMockProvider({
      id: 'UnstableProvider',
      reliability: 0.3,
      latencyMs: 8000,
      feeBase: 0.2,
      failureMode: { reason: 'unavailable', failAfter: 0 },
    }),

  congested: (): MockBridgeProvider =>
    createMockProvider({
      id: 'CongestedProvider',
      reliability: 0.8,
      latencyMs: 12000,
      feeBase: 5.0,
      failureMode: { reason: 'timeout', failAfter: 1 },
    }),
};
