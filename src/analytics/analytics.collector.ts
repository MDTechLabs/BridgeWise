import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { AnalyticsService } from './analytics.service';
import { AnalyticsUpdatePayload } from './types/analytics.types';

/**
 * Transaction status types
 */
type TransactionStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'partial';

/**
 * Transaction update event payload
 */
interface TransactionUpdatedEvent {
  id: string;
  type: string;
  status: TransactionStatus;
  metadata?: Record<string, unknown>;
  state?: Record<string, unknown>;
  completedAt?: Date;
  createdAt?: Date;
  error?: string;
}

/**
 * Benchmark completed event payload
 */
interface BenchmarkCompletedEvent {
  id: string;
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  token: string;
  status: 'confirmed' | 'failed';
  durationMs: number;
  amount?: number;
  slippagePercent?: number;
  fee?: number;
  completedAt: Date;
}

/**
 * Analytics Collector
 *
 * Listens to transaction and benchmark events to update analytics in real-time.
 * Integrates with the existing EventEmitter2 system.
 */
@Injectable()
export class AnalyticsCollector implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsCollector.name);
  private batchQueue: AnalyticsUpdatePayload[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 100;
  private readonly BATCH_INTERVAL_MS = 5000; // 5 seconds

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    this.logger.log('AnalyticsCollector initialized');
  }

  /**
   * Listen for transaction updates
   */
  @OnEvent('transaction.updated')
  async handleTransactionUpdate(event: TransactionUpdatedEvent): Promise<void> {
    this.logger.debug(`Received transaction update: ${event.id} - ${event.status}`);

    // Only process completed or failed transactions
    if (event.status !== 'completed' && event.status !== 'failed') {
      return;
    }

    const payload = this.buildPayloadFromTransaction(event);
    if (payload) {
      await this.processUpdate(payload);
    }
  }

  /**
   * Listen for benchmark completion events
   */
  @OnEvent('benchmark.completed')
  async handleBenchmarkCompleted(event: BenchmarkCompletedEvent): Promise<void> {
    this.logger.debug(`Received benchmark completion: ${event.id}`);

    const payload: AnalyticsUpdatePayload = {
      route: {
        bridgeName: event.bridgeName,
        sourceChain: event.sourceChain,
        destinationChain: event.destinationChain,
        token: event.token,
      },
      settlementTimeMs: event.durationMs,
      fee: event.fee,
      slippagePercent: event.slippagePercent,
      volume: event.amount,
      status: event.status === 'confirmed' ? 'success' : 'failed',
      timestamp: event.completedAt,
    };

    await this.processUpdate(payload);
  }

  /**
   * Listen for slippage alert events
   */
  @OnEvent('slippage.alert')
  async handleSlippageAlert(event: {
    bridge: string;
    routeId: string;
    slippage: string;
    threshold: string;
  }): Promise<void> {
    this.logger.debug(`Received slippage alert: ${event.bridge} - ${event.slippage}%`);
    // Could track high slippage events separately for alerting
  }

  /**
   * Process a single analytics update
   */
  private async processUpdate(payload: AnalyticsUpdatePayload): Promise<void> {
    // Add to batch queue
    this.batchQueue.push(payload);

    // Process immediately if batch size reached
    if (this.batchQueue.length >= this.BATCH_SIZE) {
      await this.flushBatch();
    } else {
      // Schedule batch flush
      this.scheduleBatchFlush();
    }
  }

  /**
   * Schedule a batch flush
   */
  private scheduleBatchFlush(): void {
    if (this.batchTimeout) {
      return; // Already scheduled
    }

    this.batchTimeout = setTimeout(() => {
      this.flushBatch();
    }, this.BATCH_INTERVAL_MS);
  }

  /**
   * Flush the batch queue
   */
  private async flushBatch(): Promise<void> {
    if (this.batchQueue.length === 0) {
      return;
    }

    // Clear timeout if exists
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    // Get current batch and clear queue
    const batch = [...this.batchQueue];
    this.batchQueue = [];

    this.logger.debug(`Flushing analytics batch: ${batch.length} updates`);

    // Process each update
    for (const payload of batch) {
      try {
        await this.analyticsService.updateAnalytics(payload);
      } catch (error) {
        this.logger.error(
          `Failed to update analytics for ${payload.route.bridgeName}: ${error.message}`,
          error.stack,
        );
      }
    }

    this.logger.debug(`Batch flush complete: ${batch.length} updates processed`);
  }

  /**
   * Build analytics payload from transaction event
   */
  private buildPayloadFromTransaction(
    event: TransactionUpdatedEvent,
  ): AnalyticsUpdatePayload | null {
    // Extract route information from metadata
    const metadata = event.metadata || {};
    const state = event.state || {};

    const bridgeName = (metadata.bridge as string) ||
      (metadata.bridgeName as string) ||
      (state.bridge as string);
    const sourceChain = (metadata.sourceChain as string) ||
      (metadata.fromChain as string) ||
      (state.sourceChain as string);
    const destinationChain = (metadata.destinationChain as string) ||
      (metadata.toChain as string) ||
      (state.destinationChain as string);
    const token = (metadata.token as string) || (state.token as string);

    if (!bridgeName || !sourceChain || !destinationChain) {
      this.logger.warn(
        `Cannot build analytics payload: missing route info for transaction ${event.id}`,
      );
      return null;
    }

    // Calculate settlement time if available
    let settlementTimeMs: number | undefined;
    if (event.completedAt && event.createdAt) {
      settlementTimeMs =
        new Date(event.completedAt).getTime() -
        new Date(event.createdAt).getTime();
    }

    return {
      route: {
        bridgeName,
        sourceChain,
        destinationChain,
        token,
      },
      settlementTimeMs,
      fee: state.fee as number | undefined,
      slippagePercent: state.slippage as number | undefined,
      volume: metadata.amount as number | undefined,
      status: event.status === 'completed' ? 'success' : 'failed',
      timestamp: event.completedAt || new Date(),
    };
  }

  /**
   * Force immediate batch flush
   * Useful for graceful shutdown
   */
  async forceFlush(): Promise<void> {
    this.logger.log('Forcing analytics batch flush...');
    await this.flushBatch();
  }

  /**
   * Get current batch queue size
   */
  getQueueSize(): number {
    return this.batchQueue.length;
  }
}
