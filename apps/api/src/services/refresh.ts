/**
 * Auto Refresh Service for Real-Time Fee and Speed Updates
 *
 * Polls bridge providers periodically and updates UI reactively.
 * Ensures data freshness with configurable refresh intervals.
 *
 * Implementation Scope: src/services/refresh.ts
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Refresh configuration for different data types
 */
export interface RefreshConfig {
  /** Refresh interval in milliseconds */
  intervalMs: number;
  /** Enable/disable auto-refresh */
  enabled: boolean;
  /** Maximum retry attempts on failure */
  maxRetries: number;
  /** Delay between retries in milliseconds */
  retryDelayMs: number;
  /** Exponential backoff multiplier */
  backoffMultiplier?: number;
}

/**
 * Data types that can be refreshed
 */
export enum RefreshDataType {
  FEES = 'fees',
  SPEEDS = 'speeds',
  LIQUIDITY = 'liquidity',
  QUOTES = 'quotes',
  RELIABILITY = 'reliability',
}

/**
 * Refresh event payload
 */
export interface RefreshEvent {
  dataType: RefreshDataType;
  timestamp: Date;
  data: any;
  source?: string;
  error?: Error;
}

/**
 * Refresh state tracking
 */
export interface RefreshState {
  isRefreshing: boolean;
  lastRefreshed: Date | null;
  lastError: Error | null;
  retryCount: number;
  refreshCount: number;
}

/**
 * Default refresh configurations
 */
const DEFAULT_CONFIGS: Record<RefreshDataType, RefreshConfig> = {
  [RefreshDataType.FEES]: {
    intervalMs: 15_000, // 15 seconds
    enabled: true,
    maxRetries: 3,
    retryDelayMs: 1_000,
    backoffMultiplier: 2,
  },
  [RefreshDataType.SPEEDS]: {
    intervalMs: 30_000, // 30 seconds
    enabled: true,
    maxRetries: 3,
    retryDelayMs: 1_000,
    backoffMultiplier: 2,
  },
  [RefreshDataType.LIQUIDITY]: {
    intervalMs: 60_000, // 1 minute
    enabled: true,
    maxRetries: 2,
    retryDelayMs: 2_000,
    backoffMultiplier: 2,
  },
  [RefreshDataType.QUOTES]: {
    intervalMs: 15_000, // 15 seconds
    enabled: true,
    maxRetries: 3,
    retryDelayMs: 500,
    backoffMultiplier: 1.5,
  },
  [RefreshDataType.RELIABILITY]: {
    intervalMs: 300_000, // 5 minutes
    enabled: true,
    maxRetries: 2,
    retryDelayMs: 5_000,
    backoffMultiplier: 2,
  },
};

/**
 * Data fetcher function type
 */
export type DataFetcher<T = any> = (dataType: RefreshDataType) => Promise<T>;

/**
 * Auto Refresh Service - Polls providers and updates data reactively
 */
@Injectable()
export class AutoRefreshService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutoRefreshService.name);

  /** Refresh interval timers */
  private intervals: Map<RefreshDataType, NodeJS.Timeout> = new Map();

  /** Refresh state for each data type */
  private states: Map<RefreshDataType, RefreshState> = new Map();

  /** Current configurations */
  private configs: Map<RefreshDataType, RefreshConfig> = new Map();

  /** Data fetcher callback */
  private fetcher: DataFetcher | null = null;

  /** Pause all refreshers flag */
  private isPaused = false;

  constructor(private eventEmitter: EventEmitter2) {
    // Initialize states and configs
    Object.values(RefreshDataType).forEach((dataType) => {
      this.states.set(dataType, {
        isRefreshing: false,
        lastRefreshed: null,
        lastError: null,
        retryCount: 0,
        refreshCount: 0,
      });
      this.configs.set(dataType, { ...DEFAULT_CONFIGS[dataType] });
    });
  }

  onModuleInit(): void {
    this.logger.log('AutoRefreshService initialized');
  }

  onModuleDestroy(): void {
    this.stopAll();
    this.logger.log('AutoRefreshService destroyed');
  }

  /**
   * Set the data fetcher callback
   */
  setFetcher(fetcher: DataFetcher): void {
    this.fetcher = fetcher;
  }

  /**
   * Start auto-refresh for a specific data type
   */
  async start(dataType: RefreshDataType): Promise<void> {
    const config = this.configs.get(dataType);

    if (!config.enabled) {
      this.logger.debug(`Auto-refresh disabled for ${dataType}`);
      return;
    }

    if (this.intervals.has(dataType)) {
      this.logger.debug(`Auto-refresh already running for ${dataType}`);
      return;
    }

    this.logger.log(
      `Starting auto-refresh for ${dataType} (every ${config.intervalMs}ms)`,
    );

    // Trigger immediate first refresh
    await this.refresh(dataType);

    // Set up interval
    const interval = setInterval(() => {
      if (!this.isPaused) {
        this.refresh(dataType).catch((error: unknown) => {
          this.logger.error(`Auto-refresh failed for ${dataType}`, error);
        });
      }
    }, config.intervalMs);

    this.intervals.set(dataType, interval);
  }

  /**
   * Stop auto-refresh for a specific data type
   */
  stop(dataType: RefreshDataType): void {
    const interval = this.intervals.get(dataType);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(dataType);
      this.logger.log(`Stopped auto-refresh for ${dataType}`);
    }
  }

  /**
   * Stop all auto-refreshers
   */
  stopAll(): void {
    this.intervals.forEach((interval, dataType) => {
      clearInterval(interval);
    });
    this.intervals.clear();
    this.logger.log('Stopped all auto-refreshers');
  }

  /**
   * Pause all refreshers without clearing intervals
   */
  pause(): void {
    this.isPaused = true;
    this.logger.log('Paused all auto-refreshers');
  }

  /**
   * Resume all refreshers
   */
  resume(): void {
    this.isPaused = false;
    this.logger.log('Resumed all auto-refreshers');
  }

  /**
   * Trigger manual refresh
   */
  async refresh(dataType: RefreshDataType): Promise<any> {
    const state = this.states.get(dataType);
    const config = this.configs.get(dataType);

    if (state.isRefreshing) {
      this.logger.debug(`Refresh already in progress for ${dataType}`);
      return null;
    }

    if (!this.fetcher) {
      this.logger.error('No data fetcher configured');
      return null;
    }

    // Update state
    state.isRefreshing = true;
    state.retryCount = 0;

    try {
      this.logger.debug(`Refreshing ${dataType}...`);

      // Emit refresh start event
      this.eventEmitter.emit('refresh:start', {
        dataType,
        timestamp: new Date(),
      });

      // Fetch data with retry logic
      const data = await this.fetchWithRetry(dataType, config);

      // Update state on success
      state.isRefreshing = false;
      state.lastRefreshed = new Date();
      state.lastError = null;
      state.retryCount = 0;
      state.refreshCount++;

      // Emit success event with data
      this.eventEmitter.emit('refresh:success', {
        dataType,
        timestamp: new Date(),
        data,
      });

      this.logger.log(
        `Successfully refreshed ${dataType} (refresh #${state.refreshCount})`,
      );

      return data;
    } catch (error) {
      // Update state on error
      state.isRefreshing = false;
      state.lastError = error as Error;

      // Emit error event
      this.eventEmitter.emit('refresh:error', {
        dataType,
        timestamp: new Date(),
        error: error as Error,
      });

      this.logger.error(`Failed to refresh ${dataType}: ${error}`);

      throw error;
    }
  }

  /**
   * Fetch data with retry logic and exponential backoff
   */
  private async fetchWithRetry(
    dataType: RefreshDataType,
    config: RefreshConfig,
  ): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        if (!this.fetcher) {
          throw new Error('No data fetcher configured');
        }

        return await this.fetcher(dataType);
      } catch (error) {
        lastError = error as Error;

        if (attempt < config.maxRetries) {
          const delay =
            config.retryDelayMs *
            Math.pow(config.backoffMultiplier || 2, attempt);

          this.logger.warn(
            `Retry ${attempt + 1}/${config.maxRetries} for ${dataType} in ${delay}ms`,
          );

          await this.sleep(delay);
        }
      }
    }

    throw (
      lastError ||
      new Error(
        `Failed to fetch ${dataType} after ${config.maxRetries} retries`,
      )
    );
  }

  /**
   * Update refresh configuration
   */
  updateConfig(
    dataType: RefreshDataType,
    config: Partial<RefreshConfig>,
  ): void {
    const current = this.configs.get(dataType);
    const updated = { ...current, ...config };
    this.configs.set(dataType, updated);

    this.logger.debug(
      `Updated config for ${dataType}: ${JSON.stringify(updated)}`,
    );

    // Restart if interval changed
    if (config.intervalMs && this.intervals.has(dataType)) {
      this.stop(dataType);
      this.start(dataType);
    }
  }

  /**
   * Get current refresh state
   */
  getState(dataType: RefreshDataType): RefreshState {
    return { ...this.states.get(dataType) };
  }

  /**
   * Get all refresh states
   */
  getAllStates(): Record<string, RefreshState> {
    const states: Record<string, RefreshState> = {};
    this.states.forEach((state, dataType) => {
      states[dataType] = { ...state };
    });
    return states;
  }

  /**
   * Get current configuration
   */
  getConfig(dataType: RefreshDataType): RefreshConfig {
    return { ...this.configs.get(dataType) };
  }

  /**
   * Check if a data type is currently refreshing
   */
  isRefreshing(dataType: RefreshDataType): boolean {
    return this.states.get(dataType)?.isRefreshing || false;
  }

  /**
   * Get last refresh timestamp
   */
  getLastRefreshed(dataType: RefreshDataType): Date | null {
    return this.states.get(dataType)?.lastRefreshed || null;
  }

  /**
   * Utility: sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
