import type { Route } from '../../../src/routing/smart/stellar/soroban-smart-routing-engine';

export type ProviderFailureReason =
  | 'timeout'
  | 'liquidity'
  | 'slippage'
  | 'unavailable'
  | 'execution_timeout'
  | 'fee_spike'
  | 'insufficient_liquidity';

export interface ProviderFailure {
  providerId: string;
  /** Number of calls after which the provider starts failing. */
  failAfterCalls: number;
  reason: ProviderFailureReason;
}

export interface SimulatorProvider {
  id: string;
  reliability: number;
  latencyMs: number;
  feeBase: number;
  failure?: ProviderFailure;
}

export interface QuoteResult {
  route: Route;
  simulatedError?: string;
}

export interface OutageSimulationResult {
  activeProviderId: string | null;
  failedProviders: string[];
  /** Providers attempted (in priority order). */
  attemptedProviders: string[];
  /** Captured simulated quotes for each provider. */
  quotes: Array<{ providerId: string; result: QuoteResult }>;
  /** ms */
  durationMs: number;
}

function buildRoute(routeId: string, providerId: string, sourceChain: string, destinationChain: string, feeBase: number, latencyMs: number): Route {
  return {
    id: routeId,
    provider: providerId,
    sourceChain,
    destinationChain,
    estimatedFee: feeBase,
    estimatedTimeMs: latencyMs,
    maxSlippage: 0.5,
  };
}

/**
 * Standalone simulator for provider outages during route execution.
 *
 * This does not depend on the app runtime. It is designed for tests:
 * - it deterministically decides when a provider starts failing
 * - it captures quotes/errors
 */
export class ProviderOutageSimulator {
  private readonly providers: SimulatorProvider[];
  private readonly priority: string[];
  private readonly callCounts = new Map<string, number>();
  private readonly timeoutMs: number;

  constructor(providers: SimulatorProvider[], opts?: { priority?: string[]; timeoutMs?: number }) {
    this.providers = providers;
    this.priority = opts?.priority ?? providers.map((p) => p.id);
    this.timeoutMs = opts?.timeoutMs ?? 5000;
    for (const p of providers) this.callCounts.set(p.id, 0);
  }

  quote(routeId: string, providerId: string, sourceChain: string, destinationChain: string, _contractAddress?: string): QuoteResult {
    const p = this.providers.find((x) => x.id === providerId);
    if (!p) throw new Error(`Unknown provider ${providerId}`);

    const prev = this.callCounts.get(providerId) ?? 0;
    this.callCounts.set(providerId, prev + 1);

    const failure = p.failure;
    if (failure && (prev + 1) > failure.failAfterCalls) {
      return {
        route: buildRoute(routeId, providerId, sourceChain, destinationChain, p.feeBase, p.latencyMs),
        simulatedError: `[${providerId}] ${failure.reason}`,
      };
    }

    return {
      route: buildRoute(routeId, providerId, sourceChain, destinationChain, p.feeBase, p.latencyMs),
    };
  }

  /**
   * Simulate trying providers in priority order and selecting the first healthy.
   * A provider is considered unhealthy if its quote returns simulatedError.
   */
  async run(routeId: string, sourceChain: string, destinationChain: string, opts?: { contractAddress?: string }): Promise<OutageSimulationResult> {
    const start = Date.now();
    const quotes: OutageSimulationResult['quotes'] = [];
    const failedProviders: string[] = [];
    const attemptedProviders: string[] = [];

    for (const providerId of this.priority) {
      attemptedProviders.push(providerId);
      const q = this.quote(routeId, providerId, sourceChain, destinationChain, opts?.contractAddress);
      quotes.push({ providerId, result: q });

      if (q.simulatedError) {
        failedProviders.push(providerId);
        continue;
      }

      return {
        activeProviderId: providerId,
        failedProviders,
        attemptedProviders,
        quotes,
        durationMs: Date.now() - start,
      };
    }

    return {
      activeProviderId: null,
      failedProviders,
      attemptedProviders,
      quotes,
      durationMs: Date.now() - start,
    };
  }

  reset(): void {
    this.callCounts.clear();
    for (const p of this.providers) this.callCounts.set(p.id, 0);
  }
}

export interface OutageScenario {
  id: string;
  request: {
    sourceChain: string;
    destinationChain: string;
  };
  routeId: string;
  providers: SimulatorProvider[];
  priority: string[];
  /** Expected active provider after failover. */
  expectedActiveProviderId: string | null;
  /** Providers that must be marked failed. */
  expectedFailedProviders: string[];
}

export function buildFailoverScenarios(): OutageScenario[] {
  return [
    {
      id: 'primary_unavailable_failover',
      routeId: 'r-primary',
      request: { sourceChain: 'Stellar', destinationChain: 'Ethereum' },
      providers: [
        {
          id: 'AllBridge',
          reliability: 0.97,
          latencyMs: 4200,
          feeBase: 1.5,
          failure: { providerId: 'AllBridge', failAfterCalls: 0, reason: 'unavailable' },
        },
        { id: 'Wormhole', reliability: 0.95, latencyMs: 5100, feeBase: 1.2 },
      ],
      priority: ['AllBridge', 'Wormhole'],
      expectedActiveProviderId: 'Wormhole',
      expectedFailedProviders: ['AllBridge'],
    },
    {
      id: 'primary_two_calls_then_fail',
      routeId: 'r-primary',
      request: { sourceChain: 'Stellar', destinationChain: 'Ethereum' },
      providers: [
        {
          id: 'AllBridge',
          reliability: 0.97,
          latencyMs: 4200,
          feeBase: 1.5,
          failure: { providerId: 'AllBridge', failAfterCalls: 1, reason: 'timeout' },
        },
        { id: 'Wormhole', reliability: 0.95, latencyMs: 5100, feeBase: 1.2 },
      ],
      priority: ['AllBridge', 'Wormhole'],
      expectedActiveProviderId: 'Wormhole',
      expectedFailedProviders: ['AllBridge'],
    },
    {
      id: 'all_providers_down',
      routeId: 'r-primary',
      request: { sourceChain: 'Stellar', destinationChain: 'Ethereum' },
      providers: [
        { id: 'AllBridge', reliability: 0.97, latencyMs: 4200, feeBase: 1.5, failure: { providerId: 'AllBridge', failAfterCalls: 0, reason: 'unavailable' } },
        { id: 'Wormhole', reliability: 0.95, latencyMs: 5100, feeBase: 1.2, failure: { providerId: 'Wormhole', failAfterCalls: 0, reason: 'unavailable' } },
      ],
      priority: ['AllBridge', 'Wormhole'],
      expectedActiveProviderId: null,
      expectedFailedProviders: ['AllBridge', 'Wormhole'],
    },
  ];
}

