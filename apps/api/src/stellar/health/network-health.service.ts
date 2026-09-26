import { Injectable, Logger } from '@nestjs/common';
import {
  EndpointHealth,
  HealthProbe,
  HealthStatus,
  NetworkEndpoint,
  NetworkHealthConfig,
} from './network-health.types';

/**
 * Monitors the health of configured Stellar/Soroban RPC endpoints: it probes
 * availability, measures latency, classifies each endpoint, and exposes the
 * latest status so routing can avoid degraded or unavailable providers.
 */
@Injectable()
export class NetworkHealthService {
  private readonly logger = new Logger(NetworkHealthService.name);
  private readonly latest = new Map<string, EndpointHealth>();
  private readonly degradedLatencyMs: number;

  constructor(
    private readonly probe: HealthProbe,
    config: NetworkHealthConfig = {},
  ) {
    this.degradedLatencyMs = config.degradedLatencyMs ?? 1000;
  }

  async check(endpoint: NetworkEndpoint): Promise<EndpointHealth> {
    const checkedAt = new Date().toISOString();
    try {
      const latencyMs = await this.probe(endpoint);
      const status =
        latencyMs >= this.degradedLatencyMs ? HealthStatus.DEGRADED : HealthStatus.HEALTHY;
      const health: EndpointHealth = { id: endpoint.id, url: endpoint.url, status, latencyMs, checkedAt };
      this.latest.set(endpoint.id, health);
      return health;
    } catch (err) {
      const health: EndpointHealth = {
        id: endpoint.id,
        url: endpoint.url,
        status: HealthStatus.UNAVAILABLE,
        latencyMs: null,
        checkedAt,
        error: err instanceof Error ? err.message : String(err),
      };
      this.latest.set(endpoint.id, health);
      this.logger.warn(`Endpoint ${endpoint.id} unavailable: ${health.error}`);
      return health;
    }
  }

  async checkAll(endpoints: NetworkEndpoint[]): Promise<EndpointHealth[]> {
    return Promise.all(endpoints.map((e) => this.check(e)));
  }

  getStatus(id: string): EndpointHealth | undefined {
    return this.latest.get(id);
  }

  /** Endpoints currently usable for execution (HEALTHY or DEGRADED). */
  getHealthyEndpoints(): EndpointHealth[] {
    return [...this.latest.values()].filter((h) => h.status !== HealthStatus.UNAVAILABLE);
  }

  isHealthy(id: string): boolean {
    return this.latest.get(id)?.status === HealthStatus.HEALTHY;
  }
}
