import { Injectable, Logger } from '@nestjs/common';

export interface RecoverableTransaction {
  id: string;
  /** Arbitrary payload the recovery worker needs to retry the operation. */
  payload?: Record<string, unknown>;
}

export interface QueuedRecovery extends RecoverableTransaction {
  attempts: number;
  enqueuedAt: string;
  lastAttemptAt?: string;
  lastError?: string;
}

export enum RecoveryOutcome {
  RECOVERED = 'RECOVERED',
  RETRY_SCHEDULED = 'RETRY_SCHEDULED',
  EXHAUSTED = 'EXHAUSTED',
}

export interface RecoveryQueueConfig {
  maxRetries?: number;
}

/**
 * Queue for bridge transactions requiring asynchronous recovery. Enforces a
 * retry limit, tracks attempts per transaction, removes successfully recovered
 * items, and moves permanently-failed items to a dead-letter list.
 */
@Injectable()
export class TransactionRecoveryQueueService {
  private readonly logger = new Logger(TransactionRecoveryQueueService.name);

  private readonly queue = new Map<string, QueuedRecovery>();
  private readonly deadLetter = new Map<string, QueuedRecovery>();
  private readonly maxRetries: number;

  constructor(config: RecoveryQueueConfig = {}) {
    this.maxRetries = config.maxRetries ?? 3;
  }

  /** Enqueue a transaction for recovery (idempotent by id). */
  enqueue(tx: RecoverableTransaction): QueuedRecovery {
    const existing = this.queue.get(tx.id);
    if (existing) return existing;
    const item: QueuedRecovery = { ...tx, attempts: 0, enqueuedAt: new Date().toISOString() };
    this.queue.set(tx.id, item);
    return item;
  }

  /** The transactions currently awaiting recovery. */
  pending(): QueuedRecovery[] {
    return [...this.queue.values()];
  }

  size(): number {
    return this.queue.size;
  }

  has(id: string): boolean {
    return this.queue.has(id);
  }

  /**
   * Record the outcome of a recovery attempt. Success removes the item; failure
   * increments attempts and either schedules a retry or exhausts the item into
   * the dead-letter list once the retry limit is reached.
   */
  recordAttempt(id: string, success: boolean, error?: string): RecoveryOutcome {
    const item = this.queue.get(id);
    if (!item) {
      throw new Error(`No queued recovery for transaction "${id}".`);
    }

    if (success) {
      this.queue.delete(id);
      return RecoveryOutcome.RECOVERED;
    }

    item.attempts += 1;
    item.lastAttemptAt = new Date().toISOString();
    item.lastError = error;

    if (item.attempts >= this.maxRetries) {
      this.queue.delete(id);
      this.deadLetter.set(id, item);
      this.logger.warn(`Transaction "${id}" exhausted recovery after ${item.attempts} attempts.`);
      return RecoveryOutcome.EXHAUSTED;
    }

    return RecoveryOutcome.RETRY_SCHEDULED;
  }

  getDeadLettered(): QueuedRecovery[] {
    return [...this.deadLetter.values()];
  }
}
