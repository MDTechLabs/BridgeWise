import { Injectable, Logger } from '@nestjs/common';

export interface RateLimitConfig {
  /** Max requests allowed within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface AcquireResult {
  allowed: boolean;
  remaining: number;
  /** Milliseconds to wait before the next request is allowed (0 when allowed). */
  retryAfterMs: number;
}

type Clock = () => number;

interface WindowState {
  windowStart: number;
  count: number;
}

/**
 * Fixed-window rate-limit manager for Stellar bridge provider requests. Tracks
 * per-provider usage, throttles once a provider's configured limit is reached,
 * and reports how long callers should wait (for handling 429-style responses).
 */
@Injectable()
export class ProviderRateLimitService {
  private readonly logger = new Logger(ProviderRateLimitService.name);

  private readonly configs = new Map<string, RateLimitConfig>();
  private readonly windows = new Map<string, WindowState>();

  constructor(private readonly now: Clock = () => Date.now()) {}

  configure(providerId: string, config: RateLimitConfig): void {
    if (config.limit <= 0 || config.windowMs <= 0) {
      throw new Error('Rate-limit config requires positive limit and windowMs.');
    }
    this.configs.set(providerId, config);
  }

  /** Attempt to consume one request slot for a provider. */
  tryAcquire(providerId: string): AcquireResult {
    const config = this.configs.get(providerId);
    // Unconfigured providers are unlimited.
    if (!config) return { allowed: true, remaining: Infinity, retryAfterMs: 0 };

    const t = this.now();
    let state = this.windows.get(providerId);
    if (!state || t - state.windowStart >= config.windowMs) {
      state = { windowStart: t, count: 0 };
      this.windows.set(providerId, state);
    }

    if (state.count < config.limit) {
      state.count += 1;
      return { allowed: true, remaining: config.limit - state.count, retryAfterMs: 0 };
    }

    const retryAfterMs = config.windowMs - (t - state.windowStart);
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, retryAfterMs) };
  }

  /**
   * Record that a provider responded with a rate-limit signal, saturating the
   * current window so subsequent calls back off immediately.
   */
  registerRateLimited(providerId: string): void {
    const config = this.configs.get(providerId);
    if (!config) return;
    this.windows.set(providerId, { windowStart: this.now(), count: config.limit });
    this.logger.warn(`Provider "${providerId}" reported rate limiting; backing off.`);
  }

  remaining(providerId: string): number {
    const config = this.configs.get(providerId);
    if (!config) return Infinity;
    const state = this.windows.get(providerId);
    if (!state || this.now() - state.windowStart >= config.windowMs) return config.limit;
    return Math.max(0, config.limit - state.count);
  }
}
