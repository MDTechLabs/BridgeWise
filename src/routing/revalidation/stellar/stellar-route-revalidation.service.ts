import {
  validateProviderAvailability,
  validateRouteDestinationCompatibility,
  validateRouteLiquidity,
  validateRouteQuoteFreshness,
} from '../../../execution/validation/stellar-route-revalidation-validators';
import type {
  StellarRouteRevalidationConfig,
  StellarRouteRevalidationContext,
  StellarRouteRevalidationDependencies,
  StellarRouteRevalidationResult,
} from './types';


export class StellarRouteRevalidationService {
  private readonly now: () => number;

  constructor(
    private readonly deps: StellarRouteRevalidationDependencies,
    config: StellarRouteRevalidationConfig = {},
  ) {
    this.now = config.now ?? (() => Date.now());
  }

  revalidate(context: StellarRouteRevalidationContext): StellarRouteRevalidationResult {
    const checkedAt = this.now();
    const checks = [
      validateProviderAvailability(context, this.deps),
      validateRouteQuoteFreshness(context, checkedAt),
      validateRouteLiquidity(context),
      validateRouteDestinationCompatibility(context, this.deps),
    ];
    const failures = checks.flatMap((result) => result.failures);
    const blocked = failures.some((failure) => failure.severity === 'error');

    return {
      valid: !blocked,
      blocked,
      checkedAt,
      checks,
      failures,
    };
  }
}
