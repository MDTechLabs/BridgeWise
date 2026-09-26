import type { StellarBridgeProviderError } from '../../stellar/interfaces/stellar-bridge-provider-adapter.interface';
import type { StellarProviderDependencyGraph } from '../../dependencies/stellar/dependency-graph';
import type {
  DependencyKind,
  DependencyStatus,
} from '../../dependencies/stellar/types';

export type ProviderFailureClass =
  | 'rpc'
  | 'liquidity'
  | 'configuration'
  | 'execution'
  | 'availability'
  | 'unknown';

export interface ProviderDependencyAttribution {
  dependencyId: string;
  kind: DependencyKind;
  label?: string;
  status?: DependencyStatus;
  reason?: string;
}

export interface AttributeProviderFailureContext {
  rawError?: unknown;
  dependencyGraph?: StellarProviderDependencyGraph;
  now?: () => number;
}

export interface ProviderFailureAttribution {
  failureClass: ProviderFailureClass;
  dependency?: ProviderDependencyAttribution;
  details?: Record<string, unknown>;
}

export type { StellarBridgeProviderError };
