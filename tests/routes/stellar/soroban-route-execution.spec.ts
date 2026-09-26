/**
 * Soroban Route Execution — automated test suite
 *
 * Uses the RouteTestHarness + RouteValidator to verify that the
 * SorobanSmartRoutingEngine and SorobanRouteFallbackPlanner behave
 * correctly across realistic transfer scenarios.
 */

import { RouteTestHarness, createHarness } from './harness/route-test-harness';
import { RouteValidator } from './harness/route-validator';
import { TRANSFER_SCENARIOS } from './fixtures/transfer-scenarios';
import { MOCK_PROVIDERS, createMockProvider } from './mocks/bridge-provider.mock';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function freshHarness(): RouteTestHarness {
  return createHarness({ defaultReliability: 0.9 });
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Soroban Route Execution Harness', () => {

  // ── Happy Path ─────────────────────────────────────────────────────────────

  describe('happy path — standard multi-provider routing', () => {
    it('selects the lowest-fee provider across three healthy providers', () => {
      const harness = freshHarness();
      const result = harness.run(TRANSFER_SCENARIOS.happyPath);

      RouteValidator.assertNoErrors(result);
      RouteValidator.assertNoRoute(result, false);
      RouteValidator.assertBestProvider(result, 'Wormhole');
      RouteValidator.assertFeeAtMost(result, 2.5);
    });

    it('ranks all providers when multiple are available', () => {
      const harness = freshHarness();
      const result = harness.run(TRANSFER_SCENARIOS.happyPath);

      RouteValidator.assertRankedAtLeast(result, 1);
      RouteValidator.assertProviderInRanked(result, 'AllBridge');
      RouteValidator.assertProviderInRanked(result, 'Squid');
      RouteValidator.assertProviderInRanked(result, 'Wormhole');
    });

    it('completes within a reasonable time budget', () => {
      const harness = freshHarness();
      const result = harness.run(TRANSFER_SCENARIOS.happyPath);

      expect(result.durationMs).toBeLessThan(500);
    });
  });

  // ── Cost Prioritization ────────────────────────────────────────────────────

  describe('cost prioritization', () => {
    it('picks the cheapest provider when prioritize=cost', () => {
      const harness = freshHarness();
      const result = harness.run(TRANSFER_SCENARIOS.cheapestRoute);

      RouteValidator.assertNoErrors(result);
      RouteValidator.assertBestProvider(result, 'Stargate');
      RouteValidator.assertFeeAtMost(result, 1.0);
    });

    it('returns a fee within expected bounds for cost-priority scenario', () => {
      const harness = freshHarness();
      const result = harness.run(TRANSFER_SCENARIOS.cheapestRoute);

      RouteValidator.assertFeeAtMost(result, 1.0);
      RouteValidator.assertFeeAtLeast(result, 0.0);
    });
  });

  // ── Speed Prioritization ───────────────────────────────────────────────────

  describe('speed prioritization', () => {
    it('picks the fastest provider when prioritize=speed', () => {
      const harness = freshHarness();
      const result = harness.run(TRANSFER_SCENARIOS.fastestRoute);

      RouteValidator.assertNoErrors(result);
      RouteValidator.assertBestProvider(result, 'AllBridge');
      RouteValidator.assertLatencyAtMost(result, 3000);
    });
  });

  // ── Fallback — Provider Unavailable ───────────────────────────────────────

  describe('fallback — provider unavailable', () => {
    it('triggers a fallback plan when the primary provider is unavailable', () => {
      const harness = freshHarness();
      const result = harness.run(TRANSFER_SCENARIOS.primaryProviderFails);

      RouteValidator.assertFallbackTriggered(result, true);
      RouteValidator.assertFallbackReason(result, 'provider_unavailable');
    });

    it('selects Wormhole as fallback when AllBridge is unavailable', () => {
      const harness = freshHarness();
      const result = harness.run(TRANSFER_SCENARIOS.primaryProviderFails);

      RouteValidator.assertFallbackBestProvider(result, 'Wormhole');
    });

    it('fallback plan exposes at least one alternative', () => {
      const harness = freshHarness();
      const result = harness.run(TRANSFER_SCENARIOS.primaryProviderFails);

      RouteValidator.assertFallbackHasAlternatives(result, 1);
    });

    it('excludes the failed provider from fallback alternatives', () => {
      const harness = freshHarness();
      const result = harness.run(TRANSFER_SCENARIOS.primaryProviderFails);

      expect(result.fallback).not.toBeNull();
      const hasFailedProvider = result.fallback!.alternatives.some(
        (a) => a.route.provider === 'AllBridge',
      );
      expect(hasFailedProvider).toBe(false);
    });
  });

  // ── Fallback — Fee Spike ───────────────────────────────────────────────────

  describe('fallback — fee spike', () => {
    it('falls back to a stable route on fee_spike reason', () => {
      const harness = freshHarness();
      const result = harness.run(TRANSFER_SCENARIOS.feeSpikeTriggersFailover);

      RouteValidator.assertFallbackTriggered(result, true);
      RouteValidator.assertFallbackReason(result, 'fee_spike');
      RouteValidator.assertFallbackBestProvider(result, 'AllBridge');
    });
  });

  // ── Fallback — Insufficient Liquidity ─────────────────────────────────────

  describe('fallback — insufficient liquidity', () => {
    it('recovers via fallback when primary route has insufficient liquidity', () => {
      const harness = freshHarness();
      const result = harness.run(TRANSFER_SCENARIOS.insufficientLiquidity);

      RouteValidator.assertFallbackTriggered(result, true);
      RouteValidator.assertFallbackReason(result, 'insufficient_liquidity');
      RouteValidator.assertFallbackBestProvider(result, 'Wormhole');
    });
  });

  // ── All Providers Down ─────────────────────────────────────────────────────

  describe('all providers down', () => {
    it('returns no route when no routes are registered for the chain pair', () => {
      const harness = freshHarness();
      const result = harness.run(TRANSFER_SCENARIOS.allProvidersDown);

      RouteValidator.assertNoRoute(result, true);
    });

    it('selected is null when no routes match the requested chain pair', () => {
      const harness = freshHarness();
      const result = harness.run(TRANSFER_SCENARIOS.allProvidersDown);

      expect(result.selected).toBeNull();
      expect(result.ranked).toHaveLength(0);
    });
  });

  // ── Reverse Direction ──────────────────────────────────────────────────────

  describe('reverse direction — Ethereum to Stellar', () => {
    it('routes correctly for the reverse transfer path', () => {
      const harness = freshHarness();
      const result = harness.run(TRANSFER_SCENARIOS.reverseDirection);

      RouteValidator.assertNoErrors(result);
      RouteValidator.assertBestProvider(result, 'Wormhole');
      RouteValidator.assertFeeAtMost(result, 2.5);
    });
  });

  // ── Single Provider ────────────────────────────────────────────────────────

  describe('single provider available', () => {
    it('selects the only provider without triggering fallback', () => {
      const harness = freshHarness();
      const result = harness.run(TRANSFER_SCENARIOS.singleProvider);

      RouteValidator.assertBestProvider(result, 'AllBridge');
      RouteValidator.assertFallbackTriggered(result, false);
    });
  });

  // ── Registered Mock Providers ─────────────────────────────────────────────

  describe('registered mock providers', () => {
    it('uses registered provider config (latency, fee) when building routes', () => {
      const customAllbridge = createMockProvider({
        id: 'AllBridge',
        reliability: 0.97,
        latencyMs: 2000,
        feeBase: 0.5,
      });

      const harness = freshHarness().registerProvider(customAllbridge);
      const result = harness.run(TRANSFER_SCENARIOS.happyPath);

      RouteValidator.assertBestProvider(result, 'AllBridge');
      RouteValidator.assertFeeAtMost(result, 1.0);
      expect(customAllbridge.getCallCount()).toBeGreaterThan(0);
    });

    it('tracks call counts on registered mock providers', () => {
      const allbridge = MOCK_PROVIDERS.allbridge();
      const wormhole = MOCK_PROVIDERS.wormhole();

      const harness = freshHarness().registerProviders([allbridge, wormhole]);
      harness.run(TRANSFER_SCENARIOS.primaryProviderFails);

      expect(allbridge.getCallCount()).toBeGreaterThan(0);
      expect(wormhole.getCallCount()).toBeGreaterThan(0);
    });

    it('captures call details for each quoted route', () => {
      const allbridge = MOCK_PROVIDERS.allbridge();
      const harness = freshHarness().registerProvider(allbridge);
      harness.run(TRANSFER_SCENARIOS.happyPath);

      const calls = allbridge.getCapturedCalls();
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0].sourceChain).toBe('Stellar');
      expect(calls[0].destinationChain).toBe('Ethereum');
    });

    it('resets call state between test runs when reset() is called', () => {
      const allbridge = MOCK_PROVIDERS.allbridge();
      const harness = freshHarness().registerProvider(allbridge);

      harness.run(TRANSFER_SCENARIOS.happyPath);
      expect(allbridge.getCallCount()).toBeGreaterThan(0);

      allbridge.reset();
      expect(allbridge.getCallCount()).toBe(0);
    });
  });

  // ── Unstable Provider ─────────────────────────────────────────────────────

  describe('unstable provider failure injection', () => {
    it('captures simulated errors from an unstable provider', () => {
      const unstable = MOCK_PROVIDERS.unstable();
      const harness = freshHarness().registerProvider(unstable);

      const scenario = TRANSFER_SCENARIOS.happyPath;
      const modifiedScenario = {
        ...scenario,
        routes: [
          {
            routeId: 'r-unstable-eth',
            providerId: 'UnstableProvider',
            sourceChain: 'Stellar',
            destinationChain: 'Ethereum',
            feeBase: 0.2,
            latencyMs: 8000,
          },
          ...scenario.routes.slice(1),
        ],
      };

      const result = harness.run(modifiedScenario);
      expect(result.errors.some((e) => e.includes('UnstableProvider'))).toBe(true);
    });
  });

  // ── Harness simulateFallback API ──────────────────────────────────────────

  describe('harness.simulateFallback()', () => {
    it('returns a plan with alternatives for a targeted fallback simulation', () => {
      const harness = freshHarness();
      const routes = [
        {
          id: 'primary',
          provider: 'AllBridge',
          sourceChain: 'Stellar',
          destinationChain: 'Ethereum',
          estimatedFee: 1.5,
          estimatedTimeMs: 4200,
          maxSlippage: 0.5,
        },
        {
          id: 'backup',
          provider: 'Wormhole',
          sourceChain: 'Stellar',
          destinationChain: 'Ethereum',
          estimatedFee: 1.2,
          estimatedTimeMs: 5100,
          maxSlippage: 0.5,
        },
      ];

      const plan = harness.simulateFallback(routes, 'primary', 'execution_timeout');

      expect(plan).not.toBeNull();
      expect(plan!.reason).toBe('execution_timeout');
      expect(plan!.alternatives.length).toBeGreaterThan(0);
      expect(plan!.best?.route.provider).toBe('Wormhole');
    });

    it('returns null when the specified failedRouteId does not exist', () => {
      const harness = freshHarness();
      const plan = harness.simulateFallback([], 'non-existent-id', 'fee_spike');
      expect(plan).toBeNull();
    });

    it('respects reliability overrides in targeted fallback', () => {
      const harness = freshHarness();
      const routes = [
        {
          id: 'primary',
          provider: 'AllBridge',
          sourceChain: 'Stellar',
          destinationChain: 'Ethereum',
          estimatedFee: 1.5,
          estimatedTimeMs: 4200,
          maxSlippage: 0.5,
        },
        {
          id: 'low-reliability',
          provider: 'Squid',
          sourceChain: 'Stellar',
          destinationChain: 'Ethereum',
          estimatedFee: 0.5,
          estimatedTimeMs: 2000,
          maxSlippage: 0.5,
        },
      ];

      // Squid has zero reliability — it should be excluded from the plan
      const plan = harness.simulateFallback(routes, 'primary', 'provider_unavailable', {
        Squid: 0,
      });

      expect(plan).not.toBeNull();
      expect(plan!.alternatives.length).toBe(0);
      expect(plan!.best).toBeNull();
    });
  });

  // ── Batch run ─────────────────────────────────────────────────────────────

  describe('batch scenario execution', () => {
    it('runs all predefined scenarios without throwing', () => {
      const harness = freshHarness();
      const scenarios = Object.values(TRANSFER_SCENARIOS);
      const results = harness.runAll(scenarios);

      expect(results.size).toBe(scenarios.length);
      for (const [id, result] of results) {
        expect(result.scenarioId).toBe(id);
      }
    });

    it('validates expected outcomes for every scenario in the fixture set', () => {
      const harness = freshHarness();

      for (const scenario of Object.values(TRANSFER_SCENARIOS)) {
        const result = harness.run(scenario);
        expect(() => RouteValidator.assertOutcome(result, scenario.expected)).not.toThrow();
      }
    });
  });
});
