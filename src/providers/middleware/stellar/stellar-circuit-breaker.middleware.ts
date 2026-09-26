import {
  StellarProviderCircuitBreakerRegistry,
  type CircuitBreakerOptions,
  type ProviderStatus,
} from '../../circuit-breaker/stellar/stellar-provider-circuit-breaker';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CircuitBreakerMiddlewareOptions {
  /** Invoked when a provider call is bypassed because its circuit is OPEN. */
  onBypass?: (providerId: string) => void;
}

export interface ProviderCallResult<T> {
  providerId: string;
  /** True when the call was skipped because the circuit was OPEN. */
  bypassed: boolean;
  /** The resolved value from the provider, or `undefined` when bypassed. */
  value: T | undefined;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Provider-call middleware that gates every Stellar bridge provider request
 * through the circuit breaker (issue #966).
 *
 * Responsibilities:
 *  - Bypass providers whose circuit is OPEN so a failing provider is never
 *    contacted during route discovery or quote generation.
 *  - Record success/failure outcomes so the breaker can trip, cool down,
 *    half-open, and eventually restore the provider.
 *
 * Accepts either a pre-built registry (to share state with the rest of the
 * application) or circuit-breaker options (to construct one internally).
 */
export class StellarCircuitBreakerMiddleware {
  readonly registry: StellarProviderCircuitBreakerRegistry;
  private readonly onBypass?: (providerId: string) => void;

  constructor(
    registryOrOptions:
      | StellarProviderCircuitBreakerRegistry
      | (CircuitBreakerOptions & CircuitBreakerMiddlewareOptions) = {},
  ) {
    if (registryOrOptions instanceof StellarProviderCircuitBreakerRegistry) {
      this.registry = registryOrOptions;
      this.onBypass = undefined;
    } else {
      const { onBypass, ...breakerOptions } = registryOrOptions;
      this.registry = new StellarProviderCircuitBreakerRegistry(breakerOptions);
      this.onBypass = onBypass;
    }
  }

  // ─── Call protection ────────────────────────────────────────────────────

  /**
   * Execute a provider call behind the circuit breaker.
   *
   * When the provider's circuit is OPEN the underlying function is NOT
   * invoked; the call is short-circuited and a `bypassed` result is returned.
   * Otherwise the function runs, its success/failure is recorded, and the
   * resolved value is returned (failures are re-thrown).
   */
  async execute<T>(
    providerId: string,
    fn: () => Promise<T>,
  ): Promise<ProviderCallResult<T>> {
    if (!this.registry.isAvailable(providerId)) {
      this.onBypass?.(providerId);
      return { providerId, bypassed: true, value: undefined };
    }

    try {
      const value = await fn();
      this.registry.reportSuccess(providerId);
      return { providerId, bypassed: false, value };
    } catch (error) {
      this.registry.reportFailure(providerId);
      throw error;
    }
  }

  // ─── Routing helpers ────────────────────────────────────────────────────

  /** Whether a provider may currently be dispatched to. */
  isAvailable(providerId: string): boolean {
    return this.registry.isAvailable(providerId);
  }

  /**
   * Filter an ordered candidate list down to providers whose circuit is not
   * OPEN, preserving the caller's priority ordering.
   */
  filterAvailable(providerIds: string[]): string[] {
    return this.registry.availableProviders(providerIds);
  }

  /**
   * Select the first available provider from an ordered list.
   * Returns `null` when every candidate's circuit is OPEN.
   */
  selectProvider(providerIds: string[]): string | null {
    return this.registry.selectProvider(providerIds);
  }

  // ─── Reporting ──────────────────────────────────────────────────────────

  /** Record the outcome of a provider call. */
  report(providerId: string, ok: boolean): void {
    this.registry.report(providerId, ok);
  }

  // ─── Recovery ───────────────────────────────────────────────────────────

  /**
   * Manually restore a provider by resetting its breaker to CLOSED.
   * Typically used after an operator confirms the provider has recovered.
   */
  recover(providerId: string): void {
    this.registry.resetProvider(providerId);
  }

  /** Reset every tracked breaker to CLOSED. */
  reset(): void {
    this.registry.resetAll();
  }

  // ─── Inspection ─────────────────────────────────────────────────────────

  /** Providers whose circuit is currently OPEN (suspended). */
  suspendedProviders(): string[] {
    return this.registry.suspendedProviders();
  }

  /** Full snapshot of every known provider. */
  allStatuses(): ProviderStatus[] {
    return this.registry.allStatuses();
  }

  /** Snapshot for a single provider, or `null` if never contacted. */
  statusFor(providerId: string): ProviderStatus | null {
    return this.registry.statusFor(providerId);
  }
}
