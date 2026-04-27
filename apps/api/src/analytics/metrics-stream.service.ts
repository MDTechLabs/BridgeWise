/**
 * Real-Time Metrics Streaming Service
 *
 * Provides real-time analytics metrics via Server-Sent Events (SSE)
 * for live dashboard updates.
 */

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AnalyticsService } from '../analytics/analytics.service';
import { PerformanceMetricService } from '../analytics/performance-metric.service';

export interface MetricsSnapshot {
  timestamp: Date;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  successRate: number;
  averageSettlementTime: number;
  totalVolume: number;
  activeRoutes: number;
  topBridges: Array<{ name: string; volume: number; successRate: number }>;
}

export interface MetricsUpdate {
  type: 'snapshot' | 'incremental';
  data: Partial<MetricsSnapshot>;
  timestamp: Date;
}

@Injectable()
export class MetricsStreamService {
  private readonly logger = new Logger(MetricsStreamService.name);
  private currentMetrics: MetricsSnapshot = {
    timestamp: new Date(),
    totalTransactions: 0,
    successfulTransactions: 0,
    failedTransactions: 0,
    successRate: 0,
    averageSettlementTime: 0,
    totalVolume: 0,
    activeRoutes: 0,
    topBridges: [],
  };

  private subscribers: Set<(update: MetricsUpdate) => void> = new Set();
  private updateInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly analyticsService: AnalyticsService,
    private readonly performanceMetricService: PerformanceMetricService,
  ) {
    this.setupEventListeners();
    this.startPeriodicUpdates();
  }

  /**
   * Subscribe to metrics updates
   */
  subscribe(callback: (update: MetricsUpdate) => void): () => void {
    this.subscribers.add(callback);

    // Send current snapshot immediately
    callback({
      type: 'snapshot',
      data: this.currentMetrics,
      timestamp: new Date(),
    });

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Get current metrics snapshot
   */
  getCurrentMetrics(): MetricsSnapshot {
    return { ...this.currentMetrics };
  }

  /**
   * Setup event listeners for real-time updates
   */
  private setupEventListeners(): void {
    // Listen for transaction completion
    this.eventEmitter.on('transaction.updated', async (transaction: any) => {
      await this.handleTransactionUpdate(transaction);
    });

    // Listen for analytics updates
    this.eventEmitter.on('analytics.updated', async (payload: any) => {
      await this.handleAnalyticsUpdate(payload);
    });
  }

  /**
   * Handle transaction update event
   */
  private async handleTransactionUpdate(transaction: any): Promise<void> {
    try {
      // Update counters
      this.currentMetrics.totalTransactions++;

      if (
        transaction.status === 'completed' ||
        transaction.status === 'confirmed'
      ) {
        this.currentMetrics.successfulTransactions++;
      } else if (transaction.status === 'failed') {
        this.currentMetrics.failedTransactions++;
      }

      // Calculate success rate
      this.currentMetrics.successRate =
        this.currentMetrics.totalTransactions > 0
          ? (this.currentMetrics.successfulTransactions /
              this.currentMetrics.totalTransactions) *
            100
          : 0;

      // Update volume if available
      if (transaction.metadata?.amount) {
        this.currentMetrics.totalVolume += parseFloat(
          transaction.metadata.amount,
        );
      }

      // Notify subscribers
      this.notifySubscribers({
        type: 'incremental',
        data: {
          totalTransactions: this.currentMetrics.totalTransactions,
          successfulTransactions: this.currentMetrics.successfulTransactions,
          failedTransactions: this.currentMetrics.failedTransactions,
          successRate: this.currentMetrics.successRate,
          totalVolume: this.currentMetrics.totalVolume,
        },
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Error handling transaction update:', error);
    }
  }

  /**
   * Handle analytics update event
   */
  private async handleAnalyticsUpdate(payload: any): Promise<void> {
    try {
      if (payload.settlementTime) {
        // Update rolling average settlement time
        const n = this.currentMetrics.successfulTransactions;
        this.currentMetrics.averageSettlementTime =
          (this.currentMetrics.averageSettlementTime * (n - 1) +
            payload.settlementTime) /
          n;
      }

      this.notifySubscribers({
        type: 'incremental',
        data: {
          averageSettlementTime: this.currentMetrics.averageSettlementTime,
        },
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Error handling analytics update:', error);
    }
  }

  /**
   * Start periodic full metrics refresh
   */
  private startPeriodicUpdates(): void {
    // Refresh full metrics every 30 seconds
    this.updateInterval = setInterval(async () => {
      await this.refreshFullMetrics();
    }, 30000);
  }

  /**
   * Refresh full metrics from database
   */
  private async refreshFullMetrics(): Promise<void> {
    try {
      // Get aggregated analytics
      const topBridges = await this.analyticsService.getTopPerformingBridges(5);

      // Get user activity insights
      const userActivity =
        await this.analyticsService.getUserActivityInsights();

      // Update current metrics
      this.currentMetrics = {
        ...this.currentMetrics,
        timestamp: new Date(),
        activeRoutes: userActivity.popularRoutes?.length || 0,
        topBridges: topBridges.byVolume.slice(0, 5).map((bridge) => ({
          name: bridge.bridgeName,
          volume: bridge.totalVolume,
          successRate: bridge.successRate,
        })),
      };

      // Send full snapshot to all subscribers
      this.notifySubscribers({
        type: 'snapshot',
        data: this.currentMetrics,
        timestamp: new Date(),
      });

      this.logger.debug('Full metrics refresh completed');
    } catch (error) {
      this.logger.error('Error refreshing full metrics:', error);
    }
  }

  /**
   * Notify all subscribers of metrics update
   */
  private notifySubscribers(update: MetricsUpdate): void {
    this.subscribers.forEach((callback) => {
      try {
        callback(update);
      } catch (error) {
        this.logger.error('Error notifying subscriber:', error);
      }
    });
  }

  /**
   * Cleanup on service destruction
   */
  onModuleDestroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.subscribers.clear();
  }
}
