/**
 * Abandonment Tracking Service
 * 
 * Tracks quote abandonment rate by logging quote request vs execution events.
 * 
 * Metric Definition:
 * - Abandonment Rate = (Quotes Requested - Quotes Executed) / Quotes Requested * 100
 * - A "quote requested" event is logged every time a user fetches quotes
 * - A "quote executed" event is logged when a user initiates a transaction
 * 
 * Time Window:
 * - Default analysis window: 24 hours
 * - Configurable via query parameters
 * 
 * Grouping:
 * - Can be aggregated by: bridge, sourceChain, destinationChain, token
 */

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { paginate, PaginatedResult } from '../common/pagination';

/**
 * Quote event types
 */
export enum QuoteEventType {
  QUOTE_REQUESTED = 'quote_requested',
  QUOTE_EXECUTED = 'quote_executed',
}

/**
 * Quote event data
 */
export interface QuoteEvent {
  eventType: QuoteEventType;
  sessionId: string;
  quoteId?: string;
  bridgeName?: string;
  sourceChain: string;
  destinationChain: string;
  sourceToken: string;
  destinationToken: string;
  amount: string;
  timestamp: Date;
  userAgent?: string;
  ipHash?: string;
}

/**
 * Abandonment metrics by dimension
 */
export interface AbandonmentMetrics {
  totalQuotesRequested: number;
  totalQuotesExecuted: number;
  abandonmentRate: number;
  avgTimeToExecute?: number; // Average time from quote request to execution (ms)
  byBridge?: Record<string, AbandonmentMetrics>;
  byChain?: Record<string, AbandonmentMetrics>;
  byToken?: Record<string, AbandonmentMetrics>;
}

/**
 * Query parameters for abandonment metrics
 */
export interface AbandonmentQueryParams {
  startDate?: Date;
  endDate?: Date;
  bridgeName?: string;
  sourceChain?: string;
  destinationChain?: string;
  token?: string;
  groupBy?: 'bridge' | 'sourceChain' | 'destinationChain' | 'token' | 'none';
}

/**
 * Quote session for tracking request->execution flow
 */
interface QuoteSession {
  sessionId: string;
  quoteId: string;
  requestedAt: Date;
  executedAt?: Date;
  bridgeName?: string;
  sourceChain: string;
  destinationChain: string;
  sourceToken: string;
  destinationToken: string;
  amount: string;
}

@Injectable()
export class AbandonmentTrackingService {
  private readonly logger = new Logger(AbandonmentTrackingService.name);
  private sessions: Map<string, QuoteSession> = new Map();
  private eventLog: QuoteEvent[] = [];
  private readonly MAX_EVENTS = 100000; // Keep last 100k events in memory
  private readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes timeout

  constructor(private readonly eventEmitter: EventEmitter2) {
    // Start periodic cleanup of old sessions
    setInterval(() => this.cleanupOldSessions(), 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Log a quote request event
   * Called when users fetch quotes from the bridge compare UI
   */
  logQuoteRequested(data: {
    sessionId: string;
    bridgeName?: string;
    sourceChain: string;
    destinationChain: string;
    sourceToken: string;
    destinationToken?: string;
    amount: string;
    quoteId?: string;
  }): void {
    const event: QuoteEvent = {
      eventType: QuoteEventType.QUOTE_REQUESTED,
      sessionId: data.sessionId,
      quoteId: data.quoteId,
      bridgeName: data.bridgeName,
      sourceChain: data.sourceChain,
      destinationChain: data.destinationChain,
      sourceToken: data.sourceToken,
      destinationToken: data.destinationToken || data.sourceToken,
      amount: data.amount,
      timestamp: new Date(),
    };

    // Store session for tracking execution
    const session: QuoteSession = {
      sessionId: data.sessionId,
      quoteId: data.quoteId || this.generateQuoteId(),
      requestedAt: new Date(),
      bridgeName: data.bridgeName,
      sourceChain: data.sourceChain,
      destinationChain: data.destinationChain,
      sourceToken: data.sourceToken,
      destinationToken: data.destinationToken || data.sourceToken,
      amount: data.amount,
    };

    this.sessions.set(data.sessionId, session);
    this.addEvent(event);

    // Emit event for other services
    this.eventEmitter.emit('quote.requested', event);

    this.logger.debug(
      `Quote requested: session=${data.sessionId} bridge=${data.bridgeName || 'all'} ` +
        `${data.sourceToken} ${data.sourceChain}→${data.destinationChain}`,
    );
  }

  /**
   * Log a quote execution event
   * Called when users actually execute a transaction
   */
  logQuoteExecuted(data: {
    sessionId: string;
    quoteId?: string;
    bridgeName: string;
    sourceChain: string;
    destinationChain: string;
    sourceToken: string;
    destinationToken?: string;
    amount: string;
    transactionHash?: string;
  }): void {
    // Find existing session or create new one
    let session = this.sessions.get(data.sessionId);
    
    if (!session) {
      // Create new session if not found (direct execution without quote fetch)
      session = {
        sessionId: data.sessionId,
        quoteId: data.quoteId || this.generateQuoteId(),
        requestedAt: new Date(),
        bridgeName: data.bridgeName,
        sourceChain: data.sourceChain,
        destinationChain: data.destinationChain,
        sourceToken: data.sourceToken,
        destinationToken: data.destinationToken || data.sourceToken,
        amount: data.amount,
      };
    }

    // Update session with execution info
    session.executedAt = new Date();
    this.sessions.set(data.sessionId, session);

    const event: QuoteEvent = {
      eventType: QuoteEventType.QUOTE_EXECUTED,
      sessionId: data.sessionId,
      quoteId: session.quoteId,
      bridgeName: data.bridgeName,
      sourceChain: data.sourceChain,
      destinationChain: data.destinationChain,
      sourceToken: data.sourceToken,
      destinationToken: data.destinationToken || data.sourceToken,
      amount: data.amount,
      timestamp: new Date(),
    };

    this.addEvent(event);

    // Emit event for other services
    this.eventEmitter.emit('quote.executed', event);

    this.logger.debug(
      `Quote executed: session=${data.sessionId} bridge=${data.bridgeName} ` +
        `${data.sourceToken} ${data.sourceChain}→${data.destinationChain}`,
    );
  }

  /**
   * Get abandonment metrics for a time period
   */
  getAbandonmentMetrics(params: AbandonmentQueryParams = {}): AbandonmentMetrics {
    const startDate = params.startDate || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const endDate = params.endDate || new Date();

    // Filter sessions in the time window
    const relevantSessions = Array.from(this.sessions.values()).filter(
      (session) =>
        session.requestedAt >= startDate &&
        session.requestedAt <= endDate &&
        this.matchesFilters(session, params),
    );

    const totalRequested = relevantSessions.length;
    const totalExecuted = relevantSessions.filter((s) => s.executedAt).length;
    const abandonmentRate = totalRequested > 0 
      ? ((totalRequested - totalExecuted) / totalRequested) * 100 
      : 0;

    // Calculate average time to execute
    const executedSessions = relevantSessions.filter((s) => s.executedAt);
    const avgTimeToExecute = executedSessions.length > 0
      ? executedSessions.reduce(
          (sum, s) => sum + (s.executedAt!.getTime() - s.requestedAt.getTime()),
          0,
        ) / executedSessions.length
      : undefined;

    const metrics: AbandonmentMetrics = {
      totalQuotesRequested: totalRequested,
      totalQuotesExecuted: totalExecuted,
      abandonmentRate: Math.round(abandonmentRate * 100) / 100,
      avgTimeToExecute: avgTimeToExecute ? Math.round(avgTimeToExecute) : undefined,
    };

    // Add grouping if requested
    if (params.groupBy && params.groupBy !== 'none') {
      metrics[`by${params.groupBy.charAt(0).toUpperCase() + params.groupBy.slice(1)}`] = 
        this.getGroupedMetrics(relevantSessions, params.groupBy);
    }

    return metrics;
  }

  /**
   * Get abandonment metrics grouped by a specific dimension
   */
  private getGroupedMetrics(
    sessions: QuoteSession[],
    groupBy: string,
  ): Record<string, AbandonmentMetrics> {
    const groups: Record<string, QuoteSession[]> = {};

    // Group sessions
    for (const session of sessions) {
      let key: string;
      switch (groupBy) {
        case 'bridge':
          key = session.bridgeName || 'unknown';
          break;
        case 'sourceChain':
          key = session.sourceChain;
          break;
        case 'destinationChain':
          key = session.destinationChain;
          break;
        case 'token':
          key = session.sourceToken;
          break;
        default:
          key = 'all';
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(session);
    }

    // Calculate metrics for each group
    const result: Record<string, AbandonmentMetrics> = {};
    for (const [key, groupSessions] of Object.entries(groups)) {
      const total = groupSessions.length;
      const executed = groupSessions.filter((s) => s.executedAt).length;
      
      result[key] = {
        totalQuotesRequested: total,
        totalQuotesExecuted: executed,
        abandonmentRate: total > 0 
          ? Math.round(((total - executed) / total) * 100 * 100) / 100 
          : 0,
      };
    }

    return result;
  }

  /**
   * Check if session matches filters
   */
  private matchesFilters(session: QuoteSession, params: AbandonmentQueryParams): boolean {
    if (params.bridgeName && session.bridgeName !== params.bridgeName) {
      return false;
    }
    if (params.sourceChain && session.sourceChain !== params.sourceChain) {
      return false;
    }
    if (params.destinationChain && session.destinationChain !== params.destinationChain) {
      return false;
    }
    if (params.token && session.sourceToken !== params.token) {
      return false;
    }
    return true;
  }

  /**
   * Get events for export
   */
  getEvents(params: {
    startDate?: Date;
    endDate?: Date;
    eventType?: QuoteEventType;
    limit?: number;
  }): QuoteEvent[] {
    const limit = params.limit || 1000;
    return this.filterEvents(params).slice(0, limit);
  }

  /**
   * Get a single page of events (most recent first) with pagination metadata
   */
  getEventsPage(
    params: {
      startDate?: Date;
      endDate?: Date;
      eventType?: QuoteEventType;
    },
    pagination: { page?: number; limit?: number },
  ): PaginatedResult<QuoteEvent> {
    return paginate(this.filterEvents(params), pagination);
  }

  /**
   * Filter the event log, returning the most recent events first
   */
  private filterEvents(params: {
    startDate?: Date;
    endDate?: Date;
    eventType?: QuoteEventType;
  }): QuoteEvent[] {
    let filtered = this.eventLog;

    if (params.startDate) {
      filtered = filtered.filter((e) => e.timestamp >= params.startDate!);
    }
    if (params.endDate) {
      filtered = filtered.filter((e) => e.timestamp <= params.endDate!);
    }
    if (params.eventType) {
      filtered = filtered.filter((e) => e.eventType === params.eventType);
    }

    return [...filtered].reverse();
  }

  /**
   * Add event to log
   */
  private addEvent(event: QuoteEvent): void {
    this.eventLog.push(event);
    
    // Trim old events if exceeding max
    if (this.eventLog.length > this.MAX_EVENTS) {
      this.eventLog = this.eventLog.slice(-this.MAX_EVENTS);
    }
  }

  /**
   * Generate unique quote ID
   */
  private generateQuoteId(): string {
    return `quote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up old sessions that have timed out
   */
  private cleanupOldSessions(): void {
    const cutoff = Date.now() - this.SESSION_TIMEOUT_MS;
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.requestedAt.getTime() < cutoff && !session.executedAt) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} abandoned sessions`);
    }
  }

  /**
   * Get current statistics
   */
  getStats(): {
    activeSessions: number;
    totalEvents: number;
  } {
    return {
      activeSessions: this.sessions.size,
      totalEvents: this.eventLog.length,
    };
  }
}