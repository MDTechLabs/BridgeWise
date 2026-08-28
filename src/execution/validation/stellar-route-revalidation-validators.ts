import type { StellarBridgeQuote } from '../../quotes/types/canonical-quote';
import type { SupportedChain } from '../../validation/bridgeability/stellar/stellar-bridgeability.types';
import { StellarBridgeabilityChecker } from '../../validation/bridgeability/stellar/stellar-bridgeability.checker';
import type {
  RevalidationCheckFailure,
  RevalidationCheckResult,
  StellarRouteRevalidationContext,
  StellarRouteRevalidationDependencies,
} from '../../routing/revalidation/stellar/types';
import { validateQuoteFreshness } from './stellar-pre-execution-validators';
import type { StellarPreExecutionSafetyContext } from './types';

function fail(
  check: RevalidationCheckResult['check'],
  code: string,
  reason: string,
  action: string,
  retryable = false,
): RevalidationCheckFailure {
  return { check, code, severity: 'error', reason, action, retryable };
}

function mapFreshnessFailures(
  failures: Array<{ code: string; reason: string; action: string }>,
): RevalidationCheckFailure[] {
  return failures.map((failure) => ({
    check: 'quote_freshness',
    code: failure.code,
    severity: 'error' as const,
    reason: failure.reason,
    action: failure.action,
    retryable: false,
  }));
}

function parseAssetIdentifier(
  asset: string,
  metadata: Record<string, unknown>,
): { code: string; issuer?: string } {
  const trimmed = asset.trim();
  if (trimmed.includes(':')) {
    const [code, issuer] = trimmed.split(':');
    return { code: code.trim(), issuer: issuer?.trim() };
  }
  const issuer = metadata.sourceAssetIssuer;
  if (typeof issuer === 'string' && issuer.trim()) {
    return { code: trimmed, issuer: issuer.trim() };
  }
  return { code: trimmed };
}

/** Compare two non-negative decimal amount strings without floating-point loss. */
export function compareAmountStrings(left: string, right: string): number {
  const normalize = (value: string): bigint => {
    const trimmed = value.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
      throw new Error(`Invalid decimal amount: ${value}`);
    }
    const [whole, fraction = ''] = trimmed.split('.');
    const scale = 18n;
    const frac = fraction.padEnd(Number(scale), '0').slice(0, Number(scale));
    return BigInt(whole) * 10n ** scale + BigInt(frac || '0');
  };

  const a = normalize(left);
  const b = normalize(right);
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function requiredLiquidityAmount(ctx: StellarRouteRevalidationContext): string {
  return ctx.requiredLiquidity ?? ctx.route.amount ?? ctx.quote.output.inputAmount;
}

export function validateProviderAvailability(
  ctx: StellarRouteRevalidationContext,
  deps: StellarRouteRevalidationDependencies,
): RevalidationCheckResult {
  const check = 'provider_availability' as const;
  const failures: RevalidationCheckFailure[] = [];
  const providerId = ctx.route.provider;

  const provider = deps.registry.get(providerId);
  if (!provider) {
    failures.push(
      fail(
        check,
        'PROVIDER_NOT_REGISTERED',
        `Provider "${providerId}" is not registered.`,
        'Select a route from a registered provider.',
      ),
    );
    return { check, passed: false, failures };
  }

  if (provider.status !== 'active' && provider.status !== 'degraded') {
    const retryable = provider.status === 'maintenance';
    failures.push(
      fail(
        check,
        'PROVIDER_UNAVAILABLE',
        `Provider "${providerId}" is ${provider.status} and cannot execute routes.`,
        retryable
          ? 'Wait for maintenance to complete or select another provider.'
          : 'Select a route from an active provider.',
        retryable,
      ),
    );
  }

  if (deps.healthMonitor?.isRouteDisabled(ctx.route.id)) {
    failures.push(
      fail(
        check,
        'ROUTE_DISABLED',
        `Route "${ctx.route.id}" is disabled by health monitoring.`,
        'Select an alternative route.',
      ),
    );
  }

  if (deps.circuitBreaker && !deps.circuitBreaker.isAvailable(providerId)) {
    failures.push(
      fail(
        check,
        'PROVIDER_CIRCUIT_OPEN',
        `Provider "${providerId}" circuit breaker is open.`,
        'Retry after the provider cooldown or select another route.',
        true,
      ),
    );
  }

  if (deps.maintenanceRegistry && !deps.maintenanceRegistry.isAvailable(providerId)) {
    failures.push(
      fail(
        check,
        'PROVIDER_UNAVAILABLE',
        `Provider "${providerId}" is unavailable due to maintenance or outage.`,
        'Retry later or select another provider.',
        true,
      ),
    );
  }

  return { check, passed: failures.length === 0, failures };
}

export function validateRouteQuoteFreshness(
  ctx: StellarRouteRevalidationContext,
  now: number,
): RevalidationCheckResult {
  const check = 'quote_freshness' as const;
  const failures: RevalidationCheckFailure[] = [];

  const freshnessContext = {
    quoteQuotedAt: ctx.quote.quotedAt,
    quoteTtlMs: ctx.quoteTtlMs,
  } as StellarPreExecutionSafetyContext;

  const ttlResult = validateQuoteFreshness(freshnessContext, now);
  failures.push(...mapFreshnessFailures(ttlResult.failures));

  if (ctx.quote.expiresAt !== undefined && ctx.quote.expiresAt < now) {
    failures.push(
      fail(
        check,
        'QUOTE_EXPIRED',
        'The selected quote has passed its provider expiration time.',
        'Refresh the quote and lock the route again before signing.',
      ),
    );
  }

  return { check, passed: failures.length === 0, failures };
}

export function validateRouteLiquidity(
  ctx: StellarRouteRevalidationContext,
): RevalidationCheckResult {
  const check = 'liquidity' as const;
  const failures: RevalidationCheckFailure[] = [];

  if (ctx.availableLiquidity === undefined) {
    failures.push(
      fail(
        check,
        'LIQUIDITY_UNVERIFIED',
        'Liquidity could not be verified for the selected route.',
        'Fetch a current liquidity snapshot or refresh the provider quote before signing.',
        true,
      ),
    );
    return { check, passed: false, failures };
  }

  const required = requiredLiquidityAmount(ctx);
  try {
    if (compareAmountStrings(ctx.availableLiquidity, required) < 0) {
      failures.push(
        fail(
          check,
          'INSUFFICIENT_LIQUIDITY',
          `Available liquidity ${ctx.availableLiquidity} is below the required transfer amount ${required}.`,
          'Reduce the transfer amount or select a route with more liquidity.',
        ),
      );
    }
  } catch (error) {
    failures.push(
      fail(
        check,
        'LIQUIDITY_UNVERIFIED',
        error instanceof Error ? error.message : 'Liquidity amounts could not be compared.',
        'Provide valid liquidity and transfer amount values before signing.',
        true,
      ),
    );
  }

  return { check, passed: failures.length === 0, failures };
}

function providerSupportsDestination(
  providerId: string,
  quote: StellarBridgeQuote,
  deps: StellarRouteRevalidationDependencies,
): RevalidationCheckFailure | null {
  const provider = deps.registry.get(providerId);
  if (!provider) {
    return null;
  }

  const destinationChain = quote.route.destinationChain.trim().toLowerCase();
  const destinationAsset = quote.route.destinationAsset.trim().toUpperCase();
  const supportsChain = provider.chains.some(
    (chain) => chain.identifier.trim().toLowerCase() === destinationChain,
  );
  const supportsAsset = provider.assets.some(
    (asset) => asset.code.trim().toUpperCase() === destinationAsset,
  );

  if (!supportsChain || !supportsAsset) {
    return fail(
      'destination_compatibility',
      'PROVIDER_ROUTE_UNSUPPORTED',
      `Provider "${providerId}" does not support ${destinationAsset} on ${quote.route.destinationChain}.`,
      'Select a provider that supports the destination chain and asset.',
    );
  }

  return null;
}

export function validateRouteDestinationCompatibility(
  ctx: StellarRouteRevalidationContext,
  deps: StellarRouteRevalidationDependencies,
): RevalidationCheckResult {
  const check = 'destination_compatibility' as const;
  const failures: RevalidationCheckFailure[] = [];
  const bridgeabilityChecker = deps.bridgeabilityChecker ?? new StellarBridgeabilityChecker();
  const asset = parseAssetIdentifier(ctx.quote.route.sourceAsset, ctx.quote.metadata);
  const sourceChain = ctx.quote.route.sourceChain.trim().toLowerCase() as SupportedChain;
  const targetChain = ctx.quote.route.destinationChain.trim().toLowerCase() as SupportedChain;

  const bridgeability = bridgeabilityChecker.check({
    asset,
    sourceChain,
    targetChain,
  });

  if (!bridgeability.isBridgeable) {
    failures.push(
      fail(
        check,
        bridgeability.reason?.includes('target') ||
          bridgeability.reason?.includes('not supported')
          ? 'DESTINATION_CHAIN_UNSUPPORTED'
          : 'DESTINATION_ASSET_UNSUPPORTED',
        bridgeability.reason ?? 'Destination is not bridgeable for the selected asset.',
        'Change the destination chain or asset before signing.',
      ),
    );
  }

  const providerFailure = providerSupportsDestination(ctx.route.provider, ctx.quote, deps);
  if (providerFailure) {
    failures.push(providerFailure);
  }

  return { check, passed: failures.length === 0, failures };
}
