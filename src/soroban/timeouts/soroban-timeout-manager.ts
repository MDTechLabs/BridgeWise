/**
 * Configuration for a timeout policy.
 */
export interface TimeoutPolicy {
  /** Unique policy identifier */
  readonly id: string;
  /** Maximum age in milliseconds before a transaction is considered expired */
  readonly maxAgeMs: number;
  /** Maximum number of retries allowed before marking as expired */
  readonly maxRetries?: number;
  /** Optional description for debugging */
  readonly description?: string;
}

/**
 * Represents the current state of a tracked transaction.
 */
export interface TrackedTransaction {
  /** Unique transaction identifier */
  readonly transactionId: string;
  /** Policy ID applied to this transaction */
  readonly policyId: string;
  /** Timestamp when tracking started (ms since epoch) */
  readonly createdAt: number;
  /** Number of times this transaction has been retried */
  retryCount: number;
  /** Current status of the transaction */
  status: TransactionStatus;
  /** Timestamp when the transaction expired, if applicable */
  expiredAt?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Possible statuses for a tracked transaction.
 */
export type TransactionStatus =
  | 'pending'
  | 'confirmed'
  | 'expired'
  | 'failed'
  | 'cancelled';

/**
 * Callback invoked when a transaction expires.
 */
export type TimeoutCallback = (
  transaction: TrackedTransaction,
  policy: TimeoutPolicy,
) => void | Promise<void>;

/**
 * Options for creating a SorobanTimeoutManager.
 */
export interface SorobanTimeoutManagerOptions {
  /** Default timeout policy to use when no policy is specified */
  defaultPolicy?: TimeoutPolicy;
  /** Interval in milliseconds to check for expired transactions. Defaults to 1000. */
  checkIntervalMs?: number;
  /** Custom clock function for testing. Defaults to Date.now(). */
  now?: () => number;
  /** Custom timer function for testing. Defaults to setInterval. */
  setInterval?: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  /** Custom timer function for testing. Defaults to clearInterval. */
  clearInterval?: (id: ReturnType<typeof setInterval>) => void;
}

/**
 * Manages execution and confirmation timeouts for Soroban transactions.
 *
 * Tracks transaction age, marks expired operations, and triggers timeout callbacks.
 */
export class SorobanTimeoutManager {
  private readonly policies = new Map<string, TimeoutPolicy>();
  private readonly tracked = new Map<string, TrackedTransaction>();
  private readonly callbacks = new Map<string, TimeoutCallback[]>();
  private readonly globalCallbacks: TimeoutCallback[] = [];
  private readonly now: () => number;
  private readonly checkIntervalMs: number;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private readonly setIntervalFn: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  private readonly clearIntervalFn: (id: ReturnType<typeof setInterval>) => void;
  private defaultPolicy: TimeoutPolicy | null;

  constructor(options: SorobanTimeoutManagerOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.checkIntervalMs = options.checkIntervalMs ?? 1000;
    this.setIntervalFn = options.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    this.clearIntervalFn = options.clearInterval ?? clearInterval;
    this.defaultPolicy = options.defaultPolicy ?? null;

    if (options.defaultPolicy) {
      this.policies.set(options.defaultPolicy.id, options.defaultPolicy);
    }
  }

  /**
   * Register a timeout policy.
   */
  addPolicy(policy: TimeoutPolicy): void {
    if (!policy.id?.trim()) throw new Error('Policy id is required');
    if (policy.maxAgeMs <= 0) throw new Error('Policy maxAgeMs must be positive');
    this.policies.set(policy.id, policy);
  }

  /**
   * Remove a timeout policy. Tracked transactions using this policy are not affected.
   */
  removePolicy(policyId: string): boolean {
    return this.policies.delete(policyId);
  }

  /**
   * Get a registered policy by ID.
   */
  getPolicy(policyId: string): TimeoutPolicy | undefined {
    return this.policies.get(policyId);
  }

  /**
   * Set the default policy used when no policy is specified during tracking.
   */
  setDefaultPolicy(policyId: string): void {
    const policy = this.policies.get(policyId);
    if (!policy) throw new Error(`Policy "${policyId}" not found`);
    this.defaultPolicy = policy;
  }

  /**
   * Start tracking a transaction with the given policy.
   * If no policyId is provided, the default policy is used.
   */
  trackTransaction(
    transactionId: string,
    policyId?: string,
    metadata?: Record<string, unknown>,
  ): TrackedTransaction {
    if (!transactionId?.trim()) throw new Error('transactionId is required');

    const resolvedPolicyId = policyId ?? this.defaultPolicy?.id;
    if (!resolvedPolicyId) throw new Error('No policy specified and no default policy configured');
    if (!this.policies.has(resolvedPolicyId)) {
      throw new Error(`Policy "${resolvedPolicyId}" not found`);
    }

    const existing = this.tracked.get(transactionId);
    if (existing) {
      throw new Error(`Transaction "${transactionId}" is already tracked`);
    }

    const transaction: TrackedTransaction = {
      transactionId,
      policyId: resolvedPolicyId,
      createdAt: this.now(),
      retryCount: 0,
      status: 'pending',
      metadata,
    };

    this.tracked.set(transactionId, transaction);
    return transaction;
  }

  /**
   * Mark a transaction as confirmed (successfully completed).
   */
  confirmTransaction(transactionId: string): TrackedTransaction | undefined {
    const tx = this.tracked.get(transactionId);
    if (tx && tx.status === 'pending') {
      tx.status = 'confirmed';
    }
    return tx;
  }

  /**
   * Mark a transaction as failed.
   */
  failTransaction(transactionId: string): TrackedTransaction | undefined {
    const tx = this.tracked.get(transactionId);
    if (tx && tx.status === 'pending') {
      tx.status = 'failed';
    }
    return tx;
  }

  /**
   * Cancel a pending transaction.
   */
  cancelTransaction(transactionId: string): TrackedTransaction | undefined {
    const tx = this.tracked.get(transactionId);
    if (tx && tx.status === 'pending') {
      tx.status = 'cancelled';
    }
    return tx;
  }

  /**
   * Increment the retry count for a transaction.
   * Returns the updated transaction, or undefined if not found.
   */
  retryTransaction(transactionId: string): TrackedTransaction | undefined {
    const tx = this.tracked.get(transactionId);
    if (tx && tx.status === 'pending') {
      tx.retryCount += 1;
      const policy = this.policies.get(tx.policyId);
      if (policy?.maxRetries !== undefined && tx.retryCount > policy.maxRetries) {
        this.markExpired(tx, policy);
      }
    }
    return tx;
  }

  /**
   * Calculate the age of a tracked transaction in milliseconds.
   */
  getTransactionAge(transactionId: string): number | undefined {
    const tx = this.tracked.get(transactionId);
    if (!tx) return undefined;
    return this.now() - tx.createdAt;
  }

  /**
   * Check if a specific transaction has expired based on its policy.
   */
  isExpired(transactionId: string): boolean {
    const tx = this.tracked.get(transactionId);
    if (!tx || tx.status !== 'pending') return false;
    const policy = this.policies.get(tx.policyId);
    if (!policy) return false;
    return this.now() - tx.createdAt > policy.maxAgeMs;
  }

  /**
   * Get all tracked transactions, optionally filtered by status.
   */
  getTransactions(status?: TransactionStatus): TrackedTransaction[] {
    const all = Array.from(this.tracked.values());
    if (status) return all.filter((tx) => tx.status === status);
    return all;
  }

  /**
   * Get a specific tracked transaction.
   */
  getTransaction(transactionId: string): TrackedTransaction | undefined {
    return this.tracked.get(transactionId);
  }

  /**
   * Remove a transaction from tracking. Only confirmed, expired, failed, or cancelled
   * transactions can be removed.
   */
  untrackTransaction(transactionId: string): boolean {
    const tx = this.tracked.get(transactionId);
    if (!tx) return false;
    if (tx.status === 'pending') {
      throw new Error('Cannot untrack a pending transaction. Confirm, fail, or cancel it first.');
    }
    return this.tracked.delete(transactionId);
  }

  /**
   * Register a callback to be invoked when a specific policy's transactions expire.
   */
  onTimeout(policyId: string, callback: TimeoutCallback): void {
    if (!policyId?.trim()) throw new Error('policyId is required');
    if (!this.callbacks.has(policyId)) {
      this.callbacks.set(policyId, []);
    }
    this.callbacks.get(policyId)!.push(callback);
  }

  /**
   * Register a callback to be invoked when any transaction expires.
   */
  onAnyTimeout(callback: TimeoutCallback): void {
    this.globalCallbacks.push(callback);
  }

  /**
   * Start the periodic check for expired transactions.
   */
  start(): void {
    if (this.timerId !== null) return;
    this.timerId = this.setIntervalFn(
      () => this.checkExpired(),
      this.checkIntervalMs,
    );
  }

  /**
   * Stop the periodic check.
   */
  stop(): void {
    if (this.timerId !== null) {
      this.clearIntervalFn(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Manually trigger an expiration check. Returns the list of newly expired transactions.
   */
  checkExpired(): TrackedTransaction[] {
    const newlyExpired: TrackedTransaction[] = [];
    const now = this.now();

    for (const tx of this.tracked.values()) {
      if (tx.status !== 'pending') continue;
      const policy = this.policies.get(tx.policyId);
      if (!policy) continue;

      const age = now - tx.createdAt;
      const expiredByAge = age > policy.maxAgeMs;
      const expiredByRetries =
        policy.maxRetries !== undefined && tx.retryCount > policy.maxRetries;

      if (expiredByAge || expiredByRetries) {
        this.markExpired(tx, policy);
        newlyExpired.push(tx);
      }
    }

    return newlyExpired;
  }

  /**
   * Get the count of transactions by status.
   */
  getStats(): Record<TransactionStatus, number> {
    const stats: Record<TransactionStatus, number> = {
      pending: 0,
      confirmed: 0,
      expired: 0,
      failed: 0,
      cancelled: 0,
    };
    for (const tx of this.tracked.values()) {
      stats[tx.status] += 1;
    }
    return stats;
  }

  /**
   * Clear all tracked transactions and stop the timer.
   */
  dispose(): void {
    this.stop();
    this.tracked.clear();
    this.callbacks.clear();
    this.globalCallbacks.length = 0;
  }

  private markExpired(tx: TrackedTransaction, policy: TimeoutPolicy): void {
    tx.status = 'expired';
    tx.expiredAt = this.now();

    const policyCallbacks = this.callbacks.get(tx.policyId) ?? [];
    for (const cb of [...policyCallbacks, ...this.globalCallbacks]) {
      try {
        const result = cb(tx, policy);
        if (result && typeof (result as Promise<void>).then === 'function') {
          (result as Promise<void>).catch(() => {
            // Swallow async callback errors to prevent timer crashes
          });
        }
      } catch {
        // Swallow sync callback errors to prevent timer crashes
      }
    }
  }
}
