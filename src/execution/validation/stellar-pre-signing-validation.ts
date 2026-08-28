import { StellarRouteRevalidationService } from '../../routing/revalidation/stellar';
import type {
  StellarRouteRevalidationContext,
  StellarRouteRevalidationResult,
} from '../../routing/revalidation/stellar/types';

export interface PreSigningRouteValidationResult {
  routeRevalidation: StellarRouteRevalidationResult;
  blocked: boolean;
  canProceedToSigning: boolean;
}

export function validateRouteBeforeSigning(
  context: StellarRouteRevalidationContext,
  service: StellarRouteRevalidationService,
): PreSigningRouteValidationResult {
  const routeRevalidation = service.revalidate(context);
  return {
    routeRevalidation,
    blocked: routeRevalidation.blocked,
    canProceedToSigning: !routeRevalidation.blocked,
  };
}
