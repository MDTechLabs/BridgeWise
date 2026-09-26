import {
  SorobanTimeoutManager,
  TimeoutPolicy,
  TrackedTransaction,
  TransactionStatus,
  TimeoutCallback,
} from '../../soroban/timeouts';

/**
 * Represents a lifecycle event for a transaction.
 */
export interface LifecycleEvent {
  /** Event type */
  readonly type: 'created' | 'confirmed' | 'failed' | 'expired' | 'cancelled' | 'retried';
  /** Timestamp of the event */
  readonly timestamp: number;
  /** Associated transaction ID */
  readonly transactionId: string;
  /** Optional event details */
  readonly details?: string;
}

/**
 * Full lifecycle record for a transaction.
 */
export interface TransactionLifecycle {
  /** Transaction ID */
  readonly transactionId: string;
  /** All lifecycle events in chronological order */
  readonly events: ReadonlyArray<LifecycleEvent>;
  /** Current status */
  readonly status: TransactionStatus;
  /** Time since creation in ms */
  readonly ageMs: number;
  /** Whether the transaction has timed out */
  readonly hasTimedOut: boolean;
}

/**
 * Options for the TransactionLifecycleManager.
 */
export interface TransactionLifecycleManagerOptions {
  /** Pre-configured timeout policies */
  policies?: TimeoutPolicy[];
  /** Default policy ID to use when tracking new transactions */
  defaultPolicyId?: string;
  /** Check interval for timeout detection. Defaults to 1000ms. */
  checkIntervalMs?: number;
  /** Custom clock for testing */
  now?: () => number;
  /** Custom timer functions for testing */
  setInterval?: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval?: (id: ReturnType<typeof setInterval>) => void;
}

/**
 * Manages the full lifecycle of Soroban transactions, integrating
 * with the SorobanTimeoutManager for timeout detection and callbacks.
 */
export class TransactionLifecycleManager {
  private readonly timeoutManager: SorobanTimeoutManager;
  private readonly lifecycleRecords = new Map<string, LifecycleEvent[]>();
  private readonly now: () => number;

  constructor(options: TransactionLifecycleManagerOptions = {}) {
    this.now = options.now ?? (() => Date.now());

    this.timeoutManager = new SorobanTimeoutManager({
      checkIntervalMs: options.checkIntervalMs,
      now: this.now,
      setInterval: options.setInterval,
      clearInterval: options.clearInterval,
    });

    if (options.policies) {
      for (const policy of options.policies) {
        this.timeoutManager.addPolicy(policy);
      }
    }

    if (options.defaultPolicyId) {
      this.timeoutManager.setDefaultPolicy(options.defaultPolicyId);
    }
  }

  /**
   * Add a timeout policy.
   */
  addPolicy(policy: TimeoutPolicy): void {
    this.timeoutManager.addPolicy(policy);
  }

  /**
   * Begin tracking a new transaction through its full lifecycle.
   */
  trackTransaction(
    transactionId: string,
    policyId?: string,
    metadata?: Record<string, unknown>,
  ): TransactionLifecycle {
    const tx = this.timeoutManager.trackTransaction(transactionId, policyId, metadata);
    this.recordEvent({
      type: 'created',
      timestamp: tx.createdAt,
      transactionId,
    });
    return this.buildLifecycle(tx);
  }

  /**
   * Mark a transaction as confirmed.
   */
  confirmTransaction(transactionId: string): TransactionLifecycle | undefined {
    const tx = this.timeoutManager.confirmTransaction(transactionId);
    if (tx) {
      this.recordEvent({
        type: 'confirmed',
        timestamp: this.now(),
        transactionId,
      });
    }
    return tx ? this.buildLifecycle(tx) : undefined;
  }

  /**
   * Mark a transaction as failed.
   */
  failTransaction(transactionId: string, reason?: string): TransactionLifecycle | undefined {
    const tx = this.timeoutManager.failTransaction(transactionId);
    if (tx) {
      this.recordEvent({
        type: 'failed',
        timestamp: this.now(),
        transactionId,
        details: reason,
      });
    }
    return tx ? this.buildLifecycle(tx) : undefined;
  }

  /**
   * Cancel a transaction.
   */
  cancelTransaction(transactionId: string, reason?: string): TransactionLifecycle | undefined {
    const tx = this.timeoutManager.cancelTransaction(transactionId);
    if (tx) {
      this.recordEvent({
        type: 'cancelled',
        timestamp: this.now(),
        transactionId,
        details: reason,
      });
    }
    return tx ? this.buildLifecycle(tx) : undefined;
  }

  /**
   * Retry a transaction (increment retry count).
   */
  retryTransaction(transactionId: string): TransactionLifecycle | undefined {
    const tx = this.timeoutManager.retryTransaction(transactionId);
    if (tx) {
      this.recordEvent({
        type: 'retried',
        timestamp: this.now(),
        transactionId,
        details: `Retry #${tx.retryCount}`,
      });
    }
    return tx ? this.buildLifecycle(tx) : undefined;
  }

  /**
   * Get the full lifecycle record for a transaction.
   */
  getLifecycle(transactionId: string): TransactionLifecycle | undefined {
    const tx = this.timeoutManager.getTransaction(transactionId);
    if (!tx) return undefined;
    return this.buildLifecycle(tx);
  }

  /**
   * Get all pending transactions.
   */
  getPendingTransactions(): TransactionLifecycle[] {
    return this.timeoutManager
      .getTransactions('pending')
      .map((tx) => this.buildLifecycle(tx));
  }

  /**
   * Get transactions that have expired.
   */
  getExpiredTransactions(): TransactionLifecycle[] {
    return this.timeoutManager
      .getTransactions('expired')
      .map((tx) => this.buildLifecycle(tx));
  }

  /**
   * Register a timeout callback for a specific policy.
   */
  onTimeout(policyId: string, callback: TimeoutCallback): void {
    this.timeoutManager.onTimeout(policyId, (tx, policy) => {
      this.recordEvent({
        type: 'expired',
        timestamp: this.now(),
        transactionId: tx.transactionId,
        details: `Expired after ${this.now() - tx.createdAt}ms`,
      });
      return callback(tx, policy);
    });
  }

  /**
   * Register a global timeout callback.
   */
  onAnyTimeout(callback: TimeoutCallback): void {
    this.timeoutManager.onAnyTimeout((tx, policy) => {
      this.recordEvent({
        type: 'expired',
        timestamp: this.now(),
        transactionId: tx.transactionId,
        details: `Expired after ${this.now() - tx.createdAt}ms`,
      });
      return callback(tx, policy);
    });
  }

  /**
   * Start the periodic timeout check.
   */
  start(): void {
    this.timeoutManager.start();
  }

  /**
   * Stop the periodic timeout check.
   */
  stop(): void {
    this.timeoutManager.stop();
  }

  /**
   * Manually trigger expiration check.
   */
  checkExpired(): TransactionLifecycle[] {
    const expired = this.timeoutManager.checkExpired();
    for (const tx of expired) {
      this.recordEvent({
        type: 'expired',
        timestamp: this.now(),
        transactionId: tx.transactionId,
        details: `Expired after ${this.now() - tx.createdAt}ms`,
      });
    }
    return expired.map((tx) => this.buildLifecycle(tx));
  }

  /**
   * Get aggregate statistics.
   */
  getStats(): Record<TransactionStatus, number> {
    return this.timeoutManager.getStats();
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.timeoutManager.dispose();
    this.lifecycleRecords.clear();
  }

  private recordEvent(event: LifecycleEvent): void {
    const existing = this.lifecycleRecords.get(event.transactionId) ?? [];
    existing.push(event);
    this.lifecycleRecords.set(event.transactionId, existing);
  }

  private buildLifecycle(tx: TrackedTransaction): TransactionLifecycle {
    const events = this.lifecycleRecords.get(tx.transactionId) ?? [];
    const ageMs = tx.expiredAt
      ? tx.expiredAt - tx.createdAt
      : this.now() - tx.createdAt;

    return {
      transactionId: tx.transactionId,
      events,
      status: tx.status,
      ageMs,
      hasTimedOut: tx.status === 'expired',
    };
  }
}
