import {
  SorobanSmartRoutingEngine,
  Route,
  RouteEvaluation,
  TransferRequest,
} from '../../../../src/routing/smart/stellar/soroban-smart-routing-engine';
import {
  SorobanRouteFallbackPlanner,
} from '../../../../src/routing/fallbacks/stellar/soroban-route-fallback-planner';
import type { FallbackPlanResult, FallbackReason } from '../../../../src/routing/fallbacks/stellar/types';
import { MockBridgeProvider, createMockProvider } from '../mocks/bridge-provider.mock';
import type { TransferScenario, RouteSpec } from '../fixtures/transfer-scenarios';

export interface HarnessRunResult {
  scenarioId: string;
  /** Best route selected by the routing engine, null if none qualify. */
  selected: RouteEvaluation | null;
  /** All ranked evaluations returned by the engine. */
  ranked: RouteEvaluation[];
  /** Fallback plan result when a primary failure was simulated. */
  fallback: FallbackPlanResult | null;
  /** Milliseconds taken for the full simulation. */
  durationMs: number;
  /** Providers that were called during the simulation. */
  calledProviders: string[];
  /** Errors collected during the run (non-fatal). */
  errors: string[];
}

export interface HarnessConfig {
  /** Default reliability applied to providers not explicitly overridden. */
  defaultReliability?: number;
  /** Max alternatives the fallback planner may return. */
  maxFallbackAlternatives?: number;
  /** Minimum reliability threshold for fallback candidates. */
  fallbackMinReliability?: number;
}

// ─── RouteTestHarness ─────────────────────────────────────────────────────────

/**
 * Reusable harness for running Soroban route execution scenarios.
 *
 * Wires together `SorobanSmartRoutingEngine` and `SorobanRouteFallbackPlanner`
 * using mock providers, so tests can simulate real routing logic without
 * external dependencies.
 *
 * Usage:
 *   const harness = new RouteTestHarness();
 *   const result = harness.run(TRANSFER_SCENARIOS.happyPath);
 *   RouteValidator.assertBestProvider(result, 'AllBridge');
 */
export class RouteTestHarness {
  private readonly config: Required<HarnessConfig>;
  private readonly providers = new Map<string, MockBridgeProvider>();

  constructor(config: HarnessConfig = {}) {
    this.config = {
      defaultReliability: config.defaultReliability ?? 0.9,
      maxFallbackAlternatives: config.maxFallbackAlternatives ?? 3,
      fallbackMinReliability: config.fallbackMinReliability ?? 0.5,
    };
  }

  // ─── Provider registration ────────────────────────────────────────────────

  registerProvider(provider: MockBridgeProvider): this {
    this.providers.set(provider.id, provider);
    return this;
  }

  registerProviders(providers: MockBridgeProvider[]): this {
    providers.forEach((p) => this.registerProvider(p));
    return this;
  }

  getProvider(id: string): MockBridgeProvider | undefined {
    return this.providers.get(id);
  }

  clearProviders(): this {
    this.providers.clear();
    return this;
  }

  // ─── Simulation ───────────────────────────────────────────────────────────

  /**
   * Run a complete transfer scenario through the routing engine and optional
   * fallback planner, returning a structured result for assertion.
   */
  run(scenario: TransferScenario): HarnessRunResult {
    const start = Date.now();
    const errors: string[] = [];
    const calledProviders: string[] = [];

    // Build routing engine
    const engine = new SorobanSmartRoutingEngine();

    // Build fallback planner
    const planner = new SorobanRouteFallbackPlanner({
      failoverPolicy: {
        autoFailover: true,
        maxAlternatives: this.config.maxFallbackAlternatives,
        minReliabilityThreshold: this.config.fallbackMinReliability,
      },
    });

    // Register routes and configure reliability
    const routes = this._buildRoutes(scenario, calledProviders, errors);
    engine.registerRoutes(routes);
    planner.registerRoutes(routes);

    this._applyReliability(engine, planner, scenario);

    // Route selection
    const selected = engine.selectRoute(scenario.request);
    const ranked = engine.rankRoutes(scenario.request);

    // Fallback simulation
    let fallback: FallbackPlanResult | null = null;
    if (scenario.primaryFailure) {
      const failedRoute = routes.find((r) => r.id === scenario.primaryFailure!.failedRouteId);
      if (failedRoute) {
        fallback = planner.plan(failedRoute, scenario.primaryFailure.reason);
      } else {
        errors.push(`primaryFailure.failedRouteId "${scenario.primaryFailure.failedRouteId}" not found in routes`);
      }
    }

    return {
      scenarioId: scenario.id,
      selected,
      ranked,
      fallback,
      durationMs: Date.now() - start,
      calledProviders,
      errors,
    };
  }

  /**
   * Run multiple scenarios and return all results indexed by scenario id.
   */
  runAll(scenarios: TransferScenario[]): Map<string, HarnessRunResult> {
    const results = new Map<string, HarnessRunResult>();
    for (const scenario of scenarios) {
      results.set(scenario.id, this.run(scenario));
    }
    return results;
  }

  /**
   * Simulate a targeted fallback — register routes and trigger a plan directly.
   */
  simulateFallback(
    routes: Route[],
    failedRouteId: string,
    reason: FallbackReason,
    reliabilityOverrides: Record<string, number> = {},
  ): FallbackPlanResult | null {
    const planner = new SorobanRouteFallbackPlanner({
      failoverPolicy: {
        autoFailover: true,
        maxAlternatives: this.config.maxFallbackAlternatives,
        minReliabilityThreshold: this.config.fallbackMinReliability,
      },
    });
    planner.registerRoutes(routes);

    for (const [providerId, score] of Object.entries(reliabilityOverrides)) {
      planner.updateReliability(providerId, score);
    }

    const failed = routes.find((r) => r.id === failedRouteId);
    if (!failed) return null;

    return planner.plan(failed, reason);
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private _buildRoutes(
    scenario: TransferScenario,
    calledProviders: string[],
    errors: string[],
  ): Route[] {
    return scenario.routes.map((spec) => {
      let provider = this.providers.get(spec.providerId);
      if (!provider) {
        // Auto-create a provider from the spec when none is registered
        provider = createMockProvider({
          id: spec.providerId,
          reliability: this.config.defaultReliability,
          latencyMs: spec.latencyMs,
          feeBase: spec.feeBase,
        });
      }

      const quote = provider.quoteRoute(
        spec.sourceChain,
        spec.destinationChain,
        spec.routeId,
        spec.contractAddress,
      );

      if (quote.simulatedError) {
        errors.push(quote.simulatedError);
      }

      if (!calledProviders.includes(spec.providerId)) {
        calledProviders.push(spec.providerId);
      }

      return quote.route;
    });
  }

  private _applyReliability(
    engine: SorobanSmartRoutingEngine,
    planner: SorobanRouteFallbackPlanner,
    scenario: TransferScenario,
  ): void {
    const overrides = scenario.reliabilityOverrides ?? {};

    const allProviderIds = new Set(scenario.routes.map((r) => r.providerId));
    for (const providerId of allProviderIds) {
      const score = overrides[providerId] ?? this._providerReliability(providerId);
      engine.updateReliability(providerId, score);
      planner.updateReliability(providerId, score);
    }
  }

  private _providerReliability(providerId: string): number {
    const registered = this.providers.get(providerId);
    return registered?.config.reliability ?? this.config.defaultReliability;
  }
}

// ─── Convenience factory ─────────────────────────────────────────────────────

export function createHarness(config?: HarnessConfig): RouteTestHarness {
  return new RouteTestHarness(config);
}
