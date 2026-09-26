import { Injectable, Logger } from '@nestjs/common';

export enum ProviderAvailability {
  AVAILABLE = 'AVAILABLE',
  DEGRADED = 'DEGRADED',
  UNAVAILABLE = 'UNAVAILABLE',
}

/** Normalized health shape all providers are mapped onto. */
export interface NormalizedProviderHealth {
  providerId: string;
  availability: ProviderAvailability;
  latencyMs: number | null;
  checkedAt: string;
  error?: string;
}

/**
 * Standard health-check interface every Stellar bridge provider adapter
 * implements, so heterogeneous provider health APIs can be monitored uniformly.
 */
export interface ProviderHealthAdapter {
  readonly providerId: string;
  checkHealth(): Promise<NormalizedProviderHealth>;
}

/**
 * Adapter that turns a provider-specific raw health call + normalizer into the
 * standard {@link NormalizedProviderHealth} shape, measuring latency and
 * capturing failures safely.
 */
export class GenericProviderHealthAdapter<TRaw> implements ProviderHealthAdapter {
  constructor(
    public readonly providerId: string,
    private readonly fetchRaw: () => Promise<TRaw>,
    private readonly normalize: (raw: TRaw) => { available: boolean; degraded?: boolean },
    private readonly degradedLatencyMs = 1000,
  ) {}

  async checkHealth(): Promise<NormalizedProviderHealth> {
    const startedAt = Date.now();
    const checkedAt = new Date().toISOString();
    try {
      const raw = await this.fetchRaw();
      const latencyMs = Date.now() - startedAt;
      const { available, degraded } = this.normalize(raw);
      let availability: ProviderAvailability;
      if (!available) availability = ProviderAvailability.UNAVAILABLE;
      else if (degraded || latencyMs >= this.degradedLatencyMs) availability = ProviderAvailability.DEGRADED;
      else availability = ProviderAvailability.AVAILABLE;
      return { providerId: this.providerId, availability, latencyMs, checkedAt };
    } catch (err) {
      return {
        providerId: this.providerId,
        availability: ProviderAvailability.UNAVAILABLE,
        latencyMs: null,
        checkedAt,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

/** Runs a set of provider health adapters and exposes their latest status. */
@Injectable()
export class ProviderHealthService {
  private readonly logger = new Logger(ProviderHealthService.name);
  private readonly adapters = new Map<string, ProviderHealthAdapter>();
  private readonly latest = new Map<string, NormalizedProviderHealth>();

  register(adapter: ProviderHealthAdapter): void {
    this.adapters.set(adapter.providerId, adapter);
  }

  async checkAll(): Promise<NormalizedProviderHealth[]> {
    const results = await Promise.all(
      [...this.adapters.values()].map((a) => a.checkHealth()),
    );
    for (const r of results) this.latest.set(r.providerId, r);
    return results;
  }

  getStatus(providerId: string): NormalizedProviderHealth | undefined {
    return this.latest.get(providerId);
  }

  getAvailableProviders(): string[] {
    return [...this.latest.values()]
      .filter((h) => h.availability !== ProviderAvailability.UNAVAILABLE)
      .map((h) => h.providerId);
  }
}
