import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PollingIntervals {
  /** How often to re-fetch live quote prices (ms). Default: 10 000 */
  quoteRefreshMs: number;
  /** How often to poll for transaction/bridge status updates (ms). Default: 5 000 */
  statusPollMs: number;
  /** How often to run the benchmark analytics aggregation job (ms). Default: 60 000 */
  benchmarkAggregationMs: number;
  /** How often to check for stale/stuck transactions (ms). Default: 30 000 */
  staleTransactionCheckMs: number;
}

/**
 * PollingConfigService
 *
 * Single source of truth for all polling intervals across the API.
 * Values are read from environment variables with sensible defaults so
 * developers can tune them per-environment without code changes.
 *
 * Environment variables (all optional):
 *   POLLING_QUOTE_REFRESH_MS          — default 10000
 *   POLLING_STATUS_POLL_MS            — default 5000
 *   POLLING_BENCHMARK_AGGREGATION_MS  — default 60000
 *   POLLING_STALE_TRANSACTION_MS      — default 30000
 *
 * Usage:
 *   constructor(private readonly pollingConfig: PollingConfigService) {}
 *   const interval = this.pollingConfig.get('quoteRefreshMs');
 */
@Injectable()
export class PollingConfigService {
  private readonly intervals: PollingIntervals;

  constructor(private readonly configService: ConfigService) {
    this.intervals = {
      quoteRefreshMs: this.resolveMs('POLLING_QUOTE_REFRESH_MS', 10_000),
      statusPollMs: this.resolveMs('POLLING_STATUS_POLL_MS', 5_000),
      benchmarkAggregationMs: this.resolveMs(
        'POLLING_BENCHMARK_AGGREGATION_MS',
        60_000,
      ),
      staleTransactionCheckMs: this.resolveMs(
        'POLLING_STALE_TRANSACTION_MS',
        30_000,
      ),
    };
  }

  /**
   * Get a specific polling interval by key.
   */
  get<K extends keyof PollingIntervals>(key: K): PollingIntervals[K] {
    return this.intervals[key];
  }

  /**
   * Get all intervals — useful for logging / diagnostics.
   */
  getAll(): Readonly<PollingIntervals> {
    return Object.freeze({ ...this.intervals });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private resolveMs(envKey: string, defaultMs: number): number {
    const raw = this.configService.get<string>(envKey);
    if (!raw) return defaultMs;

    const parsed = parseInt(raw, 10);
    if (isNaN(parsed) || parsed <= 0) {
      return defaultMs;
    }

    return parsed;
  }
}