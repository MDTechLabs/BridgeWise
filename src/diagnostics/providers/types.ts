import type {
  StellarBridgeProviderErrorCode,
  StellarBridgeProviderOperation,
} from '../../providers/stellar/interfaces/stellar-bridge-provider-adapter.interface';
import type { ProviderFailureClass } from '../../providers/errors/stellar/types';
import type { ProviderDependencyAttribution } from '../../providers/errors/stellar/types';

export interface StellarProviderFailureDiagnostic {
  providerId: string;
  operation: StellarBridgeProviderOperation;
  code: StellarBridgeProviderErrorCode;
  failureClass: ProviderFailureClass;
  retryable: boolean;
  message: string;
  dependency?: ProviderDependencyAttribution;
  details?: Record<string, unknown>;
  attributedAt: number;
}

export type {
  ProviderDependencyAttribution,
  ProviderFailureClass,
} from '../../providers/errors/stellar/types';
