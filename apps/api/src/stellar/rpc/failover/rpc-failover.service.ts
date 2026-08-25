import { Injectable, Logger } from '@nestjs/common';

export interface RpcEndpoint {
  id: string;
  url: string;
}

interface EndpointState {
  endpoint: RpcEndpoint;
  healthy: boolean;
  downUntil: number;
  failures: number;
}

type Clock = () => number;

export interface FailoverConfig {
  /** How long (ms) a failed endpoint is bypassed before being retried. */
  cooldownMs?: number;
}

export class AllEndpointsFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AllEndpointsFailedError';
  }
}

/**
 * Automatically fails over Soroban RPC calls across multiple endpoints: it tries
 * the active endpoint first, bypasses failed endpoints for a cooldown, promotes
 * the next healthy endpoint, and tracks recovery — all while preserving the
 * caller's request context (the operation is re-run against each endpoint).
 */
@Injectable()
export class RpcFailoverService {
  private readonly logger = new Logger(RpcFailoverService.name);

  private readonly states: EndpointState[] = [];
  private readonly cooldownMs: number;

  constructor(
    endpoints: RpcEndpoint[],
    config: FailoverConfig = {},
    private readonly now: Clock = () => Date.now(),
  ) {
    if (endpoints.length === 0) {
      throw new Error('At least one RPC endpoint is required.');
    }
    this.cooldownMs = config.cooldownMs ?? 30_000;
    for (const endpoint of endpoints) {
      this.states.push({ endpoint, healthy: true, downUntil: 0, failures: 0 });
    }
  }

  /** The endpoint that would currently be attempted first, if any is available. */
  getActiveEndpoint(): RpcEndpoint | null {
    const state = this.states.find((s) => this.isAvailable(s));
    return state?.endpoint ?? null;
  }

  /**
   * Execute `operation` against endpoints in priority order, failing over on
   * error. `operation` receives the endpoint so it can preserve request context.
   */
  async execute<T>(operation: (endpoint: RpcEndpoint) => Promise<T>): Promise<T> {
    const errors: string[] = [];
    for (const state of this.states) {
      if (!this.isAvailable(state)) continue;
      try {
        const result = await operation(state.endpoint);
        this.markHealthy(state);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${state.endpoint.id}: ${message}`);
        this.markDown(state);
      }
    }
    throw new AllEndpointsFailedError(`All RPC endpoints failed: ${errors.join('; ')}`);
  }

  private isAvailable(state: EndpointState): boolean {
    if (state.healthy) return true;
    if (this.now() >= state.downUntil) {
      // Cooldown elapsed — allow a probe attempt.
      state.healthy = true;
      return true;
    }
    return false;
  }

  private markHealthy(state: EndpointState): void {
    state.healthy = true;
    state.downUntil = 0;
    state.failures = 0;
  }

  private markDown(state: EndpointState): void {
    state.healthy = false;
    state.failures += 1;
    state.downUntil = this.now() + this.cooldownMs;
    this.logger.warn(`RPC endpoint "${state.endpoint.id}" marked down until ${state.downUntil}.`);
  }
}
