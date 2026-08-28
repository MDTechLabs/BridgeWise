import { StellarProviderCircuitBreakerRegistry } from '../../../src/providers/circuit-breaker/stellar';
import { StellarBridgeProviderRegistry } from '../../../src/providers/stellar/registry/stellar-bridge-provider-registry';
import type { RegisterStellarProviderInput } from '../../../src/providers/stellar/registry/types';
import { StellarRouteHealthMonitor } from '../../../src/monitoring/routes/stellar/stellar-route-health-monitor';
import { StellarRouteRevalidationService } from '../../../src/routing/revalidation/stellar';
import type {
  StellarRouteRevalidationContext,
  StellarRouteRevalidationDependencies,
} from '../../../src/routing/revalidation/stellar/types';
import type { StellarBridgeQuote } from '../../../src/quotes/types/canonical-quote';
import type { BridgeRoute } from '../../../src/services/route-ranker';
import {
  compareAmountStrings,
  validateRouteBeforeSigning,
} from '../../../src/execution/validation';
import { StellarBridgeabilityChecker } from '../../../src/validation/bridgeability/stellar/stellar-bridgeability.checker';

const FIXED_NOW = 1_700_000_000_000;
const SAMPLE_NETWORK = 'Public Global Stellar Network ; September 2015';

const baseProviderInput = (
  id = 'allbridge',
  overrides: Partial<RegisterStellarProviderInput> = {},
): RegisterStellarProviderInput => ({
  id,
  name: `Provider ${id}`,
  kind: 'soroban',
  endpoint: `https://${id}.example.com`,
  networks: [SAMPLE_NETWORK],
  chains: [
    { identifier: 'stellar', assetCode: 'XLM' },
    { identifier: 'ethereum', assetCode: 'XLM' },
  ],
  assets: [{ code: 'XLM' }],
  feeModel: 'bps',
  feeBps: 30,
  ...overrides,
});

const baseRoute = (overrides: Partial<BridgeRoute> = {}): BridgeRoute => ({
  id: 'route-1',
  fromChain: 'stellar',
  toChain: 'ethereum',
  fromToken: 'XLM',
  toToken: 'XLM',
  amount: '100',
  fee: { amount: '0.1', token: 'XLM' },
  estimatedTime: 5,
  successRate: 0.98,
  provider: 'allbridge',
  ...overrides,
});

const baseQuote = (overrides: Partial<StellarBridgeQuote> = {}): StellarBridgeQuote => ({
  id: 'quote-1',
  providerId: 'allbridge',
  providerName: 'AllBridge',
  route: {
    sourceChain: 'stellar',
    destinationChain: 'ethereum',
    sourceAsset: 'XLM',
    destinationAsset: 'XLM',
    hops: 1,
  },
  fees: {
    networkFeeUsdCents: 10,
    totalFeeUsdCents: 10,
    feeToken: 'XLM',
  },
  execution: {
    estimatedTimeSeconds: 60,
    successRate: 0.98,
  },
  output: {
    inputAmount: '100',
    outputAmount: '99.5',
    netOutputAmount: '99.0',
    minOutputAmount: '98.0',
  },
  metadata: {},
  quotedAt: FIXED_NOW,
  ...overrides,
});

function validContext(
  overrides: Partial<StellarRouteRevalidationContext> = {},
): StellarRouteRevalidationContext {
  return {
    route: baseRoute(),
    quote: baseQuote(),
    quoteTtlMs: 60_000,
    availableLiquidity: '1000',
    ...overrides,
  };
}

function createService(
  deps: Partial<StellarRouteRevalidationDependencies> = {},
  now = () => FIXED_NOW,
): StellarRouteRevalidationService {
  const registry = deps.registry ?? new StellarBridgeProviderRegistry({ now: () => FIXED_NOW });
  if (!deps.registry) {
    registry.register(baseProviderInput());
  }
  return new StellarRouteRevalidationService(
    {
      registry,
      bridgeabilityChecker: deps.bridgeabilityChecker ?? new StellarBridgeabilityChecker(),
      healthMonitor: deps.healthMonitor,
      circuitBreaker: deps.circuitBreaker,
      maintenanceRegistry: deps.maintenanceRegistry,
    },
    { now },
  );
}

describe('StellarRouteRevalidationService (#1064)', () => {
  describe('provider availability', () => {
    it('passes for a valid active provider', () => {
      const service = createService();
      const result = service.revalidate(validContext());
      expect(result.valid).toBe(true);
      expect(result.checks.find((c) => c.check === 'provider_availability')?.passed).toBe(true);
    });

    it('fails when the provider is not registered', () => {
      const registry = new StellarBridgeProviderRegistry();
      const service = createService({ registry });
      const result = service.revalidate(validContext());
      expect(result.failures.some((f) => f.code === 'PROVIDER_NOT_REGISTERED')).toBe(true);
      expect(result.blocked).toBe(true);
    });

    it('fails when the provider is inactive', () => {
      const registry = new StellarBridgeProviderRegistry();
      registry.register(baseProviderInput('allbridge', { status: 'inactive' }));
      const service = createService({ registry });
      const result = service.revalidate(validContext());
      expect(result.failures.some((f) => f.code === 'PROVIDER_UNAVAILABLE')).toBe(true);
      expect(result.failures.find((f) => f.code === 'PROVIDER_UNAVAILABLE')?.retryable).toBe(false);
    });

    it('fails with a retryable error when the circuit breaker is open', () => {
      const registry = new StellarBridgeProviderRegistry();
      registry.register(baseProviderInput());
      const circuitBreaker = new StellarProviderCircuitBreakerRegistry({
        failureThreshold: 1,
        now: () => 0,
      });
      circuitBreaker.reportFailure('allbridge');
      const service = createService({ registry, circuitBreaker });
      const result = service.revalidate(validContext());
      expect(result.failures.some((f) => f.code === 'PROVIDER_CIRCUIT_OPEN')).toBe(true);
      expect(result.failures.find((f) => f.code === 'PROVIDER_CIRCUIT_OPEN')?.retryable).toBe(true);
    });

    it('fails when the route is disabled by the health monitor', async () => {
      const registry = new StellarBridgeProviderRegistry();
      registry.register(baseProviderInput());
      const healthMonitor = new StellarRouteHealthMonitor({
        timeoutMs: 10,
        unhealthyThreshold: 1,
      });
      healthMonitor.registerRoute('route-1', async () => ({
        available: false,
        errorMessage: 'route unreachable',
      }));
      await healthMonitor.checkAll();
      const service = createService({ registry, healthMonitor });
      const result = service.revalidate(validContext());
      expect(result.failures.some((f) => f.code === 'ROUTE_DISABLED')).toBe(true);
    });
  });

  describe('quote freshness', () => {
    it('passes for a fresh quote', () => {
      const service = createService();
      const result = service.revalidate(validContext());
      expect(result.checks.find((c) => c.check === 'quote_freshness')?.passed).toBe(true);
    });

    it('fails when quoteTtlMs is exceeded', () => {
      const service = createService();
      const result = service.revalidate(
        validContext({
          quote: baseQuote({ quotedAt: FIXED_NOW - 120_000 }),
          quoteTtlMs: 60_000,
        }),
      );
      expect(result.failures.some((f) => f.code === 'QUOTE_STALE')).toBe(true);
    });

    it('fails when expiresAt is in the past', () => {
      const service = createService();
      const result = service.revalidate(
        validContext({
          quote: baseQuote({ expiresAt: FIXED_NOW - 1 }),
        }),
      );
      expect(result.failures.some((f) => f.code === 'QUOTE_EXPIRED')).toBe(true);
    });

    it('does not invent a default quoteTtlMs', () => {
      const service = createService();
      const result = service.revalidate(
        validContext({
          quote: baseQuote({ quotedAt: FIXED_NOW - 1 }),
          quoteTtlMs: 0,
        }),
      );
      expect(result.failures.some((f) => f.code === 'QUOTE_TTL_INVALID')).toBe(true);
    });
  });

  describe('liquidity', () => {
    it('passes when available liquidity covers the transfer amount', () => {
      const service = createService();
      const result = service.revalidate(validContext({ availableLiquidity: '1000' }));
      expect(result.checks.find((c) => c.check === 'liquidity')?.passed).toBe(true);
    });

    it('fails when available liquidity is insufficient', () => {
      const service = createService();
      const result = service.revalidate(validContext({ availableLiquidity: '10' }));
      expect(result.failures.some((f) => f.code === 'INSUFFICIENT_LIQUIDITY')).toBe(true);
    });

    it('fails with LIQUIDITY_UNVERIFIED when liquidity data is missing', () => {
      const service = createService();
      const result = service.revalidate(validContext({ availableLiquidity: undefined }));
      expect(result.failures.some((f) => f.code === 'LIQUIDITY_UNVERIFIED')).toBe(true);
      expect(result.failures.find((f) => f.code === 'LIQUIDITY_UNVERIFIED')?.retryable).toBe(true);
    });

    it('does not use networkMetrics liquidityUsd as a transfer-amount gate', () => {
      const service = createService();
      const result = service.revalidate(
        validContext({
          route: baseRoute({
            networkMetrics: { liquidityUsd: 10_000_000 },
          }),
          availableLiquidity: undefined,
        }),
      );
      expect(result.failures.some((f) => f.code === 'LIQUIDITY_UNVERIFIED')).toBe(true);
      expect(result.failures.some((f) => f.code === 'INSUFFICIENT_LIQUIDITY')).toBe(false);
    });

    it('compares decimal amounts without using floating-point equality', () => {
      expect(compareAmountStrings('1000.50', '1000.5')).toBe(0);
      expect(compareAmountStrings('99.99', '100')).toBe(-1);
    });
  });

  describe('destination compatibility', () => {
    it('passes for a supported destination chain and provider route', () => {
      const service = createService();
      const result = service.revalidate(validContext());
      expect(result.checks.find((c) => c.check === 'destination_compatibility')?.passed).toBe(true);
    });

    it('fails for an unsupported destination chain', () => {
      const service = createService();
      const result = service.revalidate(
        validContext({
          quote: baseQuote({
            route: {
              sourceChain: 'stellar',
              destinationChain: 'avalanche',
              sourceAsset: 'XLM',
              destinationAsset: 'XLM',
              hops: 1,
            },
          }),
        }),
      );
      expect(result.failures.some((f) => f.code === 'DESTINATION_CHAIN_UNSUPPORTED')).toBe(
        true,
      );
    });

    it('fails when the provider does not support the destination chain/asset', () => {
      const registry = new StellarBridgeProviderRegistry();
      registry.register(
        baseProviderInput('allbridge', {
          chains: [{ identifier: 'stellar', assetCode: 'XLM' }],
          assets: [{ code: 'XLM' }],
        }),
      );
      const service = createService({ registry });
      const result = service.revalidate(validContext());
      expect(result.failures.some((f) => f.code === 'PROVIDER_ROUTE_UNSUPPORTED')).toBe(true);
    });

    it('fails for an unsupported destination asset via bridgeability', () => {
      const service = createService();
      const result = service.revalidate(
        validContext({
          quote: baseQuote({
            route: {
              sourceChain: 'stellar',
              destinationChain: 'ethereum',
              sourceAsset: 'USDC',
              destinationAsset: 'USDC',
              hops: 1,
            },
          }),
        }),
      );
      expect(result.failures.some((f) => f.code === 'DESTINATION_ASSET_UNSUPPORTED')).toBe(true);
    });
  });

  describe('aggregation', () => {
    it('returns valid when all four checks pass', () => {
      const service = createService();
      const result = service.revalidate(validContext());
      expect(result.valid).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.checks).toHaveLength(4);
      expect(result.failures).toEqual([]);
    });

    it('reports multiple failures without stopping early', () => {
      const registry = new StellarBridgeProviderRegistry();
      registry.register(baseProviderInput('allbridge', { status: 'inactive' }));
      const service = createService({ registry });
      const result = service.revalidate(
        validContext({
          quote: baseQuote({ quotedAt: FIXED_NOW - 120_000, expiresAt: FIXED_NOW - 1 }),
          availableLiquidity: undefined,
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.failures.map((f) => f.code)).toEqual(
        expect.arrayContaining(['PROVIDER_UNAVAILABLE', 'QUOTE_STALE', 'QUOTE_EXPIRED', 'LIQUIDITY_UNVERIFIED']),
      );
      expect(result.checks).toHaveLength(4);
    });
  });

  describe('pre-signing exposure', () => {
    it('returns the revalidation result before signing', () => {
      const service = createService();
      const sign = jest.fn();
      const gate = validateRouteBeforeSigning(validContext(), service);
      expect(gate.routeRevalidation.valid).toBe(true);
      expect(gate.canProceedToSigning).toBe(true);
      if (!gate.blocked) {
        sign();
      }
      expect(sign).toHaveBeenCalledTimes(1);
    });

    it('blocks signing when the route is invalid', () => {
      const registry = new StellarBridgeProviderRegistry();
      const service = createService({ registry });
      const sign = jest.fn();
      const gate = validateRouteBeforeSigning(validContext(), service);
      expect(gate.routeRevalidation.valid).toBe(false);
      expect(gate.blocked).toBe(true);
      expect(gate.canProceedToSigning).toBe(false);
      if (!gate.blocked) {
        sign();
      }
      expect(sign).not.toHaveBeenCalled();
    });

    it('allows the caller to proceed when revalidation passes', () => {
      const service = createService();
      const gate = validateRouteBeforeSigning(validContext(), service);
      expect(gate.routeRevalidation.checkedAt).toBe(FIXED_NOW);
      expect(gate.canProceedToSigning).toBe(true);
    });
  });
});
