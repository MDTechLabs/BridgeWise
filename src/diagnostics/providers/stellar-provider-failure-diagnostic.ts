import type { StellarBridgeProviderError } from '../../providers/stellar/interfaces/stellar-bridge-provider-adapter.interface';
import { StellarProviderFailureAttributor } from '../../providers/errors/stellar/stellar-provider-failure-attributor';
import type { AttributeProviderFailureContext } from '../../providers/errors/stellar/types';
import type { StellarProviderFailureDiagnostic } from './types';

const defaultAttributor = new StellarProviderFailureAttributor();

export function attributeProviderFailure(
  error: StellarBridgeProviderError,
  context: AttributeProviderFailureContext = {},
  attributor: StellarProviderFailureAttributor = defaultAttributor,
): StellarProviderFailureDiagnostic {
  const attribution = attributor.attribute(error, context);

  return {
    providerId: error.providerId,
    operation: error.operation,
    code: error.code,
    failureClass: attribution.failureClass,
    retryable: error.retryable,
    message: error.message,
    dependency: attribution.dependency,
    details: attribution.details ?? error.details,
    attributedAt: context.now?.() ?? Date.now(),
  };
}
