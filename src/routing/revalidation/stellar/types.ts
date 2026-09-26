import type { StellarBridgeQuote } from '../../../quotes/types/canonical-quote';
import type { StellarBridgeProviderRegistry } from '../../../providers/stellar/registry/stellar-bridge-provider-registry';
import type { StellarProviderCircuitBreakerRegistry } from '../../../providers/circuit-breaker/stellar/stellar-provider-circuit-breaker';
import type { StellarMaintenanceRegistry } from '../../../providers/maintenance/stellar/stellar-maintenance-registry';
import type { StellarRouteHealthMonitor } from '../../../monitoring/routes/stellar/stellar-route-health-monitor';
import type { StellarBridgeabilityChecker } from '../../../validation/bridgeability/stellar/stellar-bridgeability.checker';
import type { BridgeRoute } from '../../../services/route-ranker';

export type RevalidationCheckName =
  | 'provider_availability'
  | 'quote_freshness'
  | 'liquidity'
  | 'destination_compatibility';

export type RevalidationSeverity = 'error' | 'warning';

export interface RevalidationCheckFailure {
  check: RevalidationCheckName;
  code: string;
  severity: RevalidationSeverity;
  reason: string;
  action: string;
  retryable?: boolean;
}

export interface RevalidationCheckResult {
  check: RevalidationCheckName;
  passed: boolean;
  failures: RevalidationCheckFailure[];
}

export interface StellarRouteRevalidationContext {
  route: BridgeRoute;
  quote: StellarBridgeQuote;
  /** Caller-supplied quote TTL; no repository default is applied. */
  quoteTtlMs: number;
  /**
   * Available liquidity in the same asset/unit as the transfer amount.
   * When omitted the liquidity check returns LIQUIDITY_UNVERIFIED.
   */
  availableLiquidity?: string;
  /** Defaults to route.amount, then quote.output.inputAmount. */
  requiredLiquidity?: string;
}

export interface StellarRouteRevalidationResult {
  valid: boolean;
  blocked: boolean;
  checkedAt: number;
  checks: RevalidationCheckResult[];
  failures: RevalidationCheckFailure[];
}

export interface StellarRouteRevalidationConfig {
  now?: () => number;
}

export interface StellarRouteRevalidationDependencies {
  registry: StellarBridgeProviderRegistry;
  bridgeabilityChecker?: StellarBridgeabilityChecker;
  healthMonitor?: StellarRouteHealthMonitor;
  circuitBreaker?: StellarProviderCircuitBreakerRegistry;
  maintenanceRegistry?: StellarMaintenanceRegistry;
}
