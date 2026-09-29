import { EventEmitter } from 'events';
import {
  CrossChainMessage,
  InflightMessageSnapshot,
  MessageStatus,
  MessageQueueItem,
  MessageValidationOptions,
  MessageValidationStats,
  QueueConfig,
  ExecutionResult,
  DuplicateCheckResult,
  DuplicateDetectorStats,
} from '../types';
import { DuplicateMessageDetector, computeMessageFingerprint } from '../dedup/duplicate-message-detector';
import { validateCrossChainMessage, DEFAULT_MESSAGE_VALIDATION_OPTIONS } from '../validation/message-validator';

const DEFAULT_CONFIG: QueueConfig = {
  maxRetries: 5,
  retryDelayMs: 5000,
  concurrency: 10,
  pollIntervalMs: 1000,
};

export class MessageQueue extends EventEmitter {
  private config: QueueConfig;
  private queue: Map<string, MessageQueueItem> = new Map();
  private processing: Map<string, MessageQueueItem> = new Map();
  private failed: Map<string, MessageQueueItem> = new Map();
  private completed: Map<string, ExecutionResult> = new Map();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private detector: DuplicateMessageDetector | null;
  private validation: MessageValidationOptions | false;
  private validationStats: MessageValidationStats = { checked: 0, accepted: 0, rejected: 0 };

  constructor(config?: Partial<QueueConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.detector =
      this.config.deduplication === false ? null : new DuplicateMessageDetector(this.config.deduplication);
    this.validation =
      this.config.validation === false
        ? false
        : { ...DEFAULT_MESSAGE_VALIDATION_OPTIONS, ...this.config.validation };
  }

  /**
   * Accepts a message for delivery.
   *
   * Returns `false` when the message was rejected, either as malformed or as
   * a duplicate. Malformed messages are rejected before duplicate detection
   * so a bad message cannot occupy a slot in the detector's window and evict a
   * legitimate one.
   */
  enqueue(message: CrossChainMessage): boolean {
    if (!this.validate(message)) return false;

    const check = this.checkDuplicate(message);
    if (check.duplicate) {
      const event = {
        messageId: message.id,
        reason: check.reason,
        originalMessageId: check.originalMessageId,
        fingerprint: check.fingerprint,
        occurrences: check.occurrences,
      };
      this.emit('duplicate-message', event);
      if (check.reason === 'message-id-conflict') {
        this.emit('message-id-conflict', event);
      }
      return false;
    }

    const item: MessageQueueItem = {
      message: { ...message, status: 'queued' },
      queuedAt: Date.now(),
      nextRetryAt: Date.now(),
      attempts: 0,
    };
    this.queue.set(message.id, item);
    this.emit('message-enqueued', { messageId: message.id, destinationChainId: message.destinationChainId });
    return true;
  }

  dequeue(): CrossChainMessage | null {
    if (this.processing.size >= this.config.concurrency) return null;

    const now = Date.now();
    let oldest: MessageQueueItem | null = null;

    for (const item of this.queue.values()) {
      if (item.nextRetryAt <= now) {
        if (!oldest || item.queuedAt < oldest.queuedAt) {
          oldest = item;
        }
      }
    }

    if (!oldest) return null;

    this.queue.delete(oldest.message.id);
    this.processing.set(oldest.message.id, oldest);
    oldest.inflightAt = Date.now();
    oldest.message.status = 'processing';

    this.emit('message-dequeued', { messageId: oldest.message.id });
    return oldest.message;
  }

  async complete(result: ExecutionResult): Promise<void> {
    const item = this.processing.get(result.messageId) ?? null;
    if (!item) {
      // Completion for a message the queue no longer tracks, for example a late
      // reconciled result racing the executor's own completion. Record it once
      // so the real outcome is never overwritten.
      if (!this.completed.has(result.messageId)) {
        this.completed.set(result.messageId, result);
      }
      return;
    }

    this.processing.delete(result.messageId);
    if (result.success) {
      item.message.status = 'confirmed';
    }
    this.completed.set(result.messageId, result);

    if (result.success) {
      this.emit('message-completed', result);
      return;
    }

    item.attempts++;
    if (item.attempts <= this.config.maxRetries) {
      item.nextRetryAt = Date.now() + this.config.retryDelayMs * Math.pow(2, item.attempts - 1);
      item.message.status = 'queued';
      item.message.lastError = result.error;
      this.queue.set(result.messageId, item);
      this.emit('message-retrying', {
        messageId: result.messageId,
        attempt: item.attempts,
        maxRetries: this.config.maxRetries,
        nextRetryAt: item.nextRetryAt,
        error: result.error,
      });
    } else {
      item.message.status = 'failed';
      this.failed.set(result.messageId, item);
      this.emit('message-failed', {
        messageId: result.messageId,
        attempts: item.attempts,
        lastError: result.error,
      });
    }
  }

  getPendingCount(): number {
    return this.queue.size;
  }

  getProcessingCount(): number {
    return this.processing.size;
  }

  /** Number of in-flight messages whose transaction has been broadcast. */
  getSubmittedCount(): number {
    let count = 0;
    for (const item of this.processing.values()) {
      if (item.message.status === 'submitted') count++;
    }
    return count;
  }

  /**
   * Records that a dequeued message was broadcast to its destination chain.
   * The message stays in flight under the `submitted` status until it is
   * completed, forced to `failed`, or reconciled. Returns `false` when the
   * message is not actually in flight.
   */
  markSubmitted(messageId: string, txHash: string): boolean {
    const item = this.processing.get(messageId);
    if (!item) return false;
    item.submittedTxHash = txHash;
    item.submittedAt = Date.now();
    item.message.status = 'submitted';
    this.emit('message-submitted', {
      messageId,
      txHash,
      destinationChainId: item.message.destinationChainId,
    });
    return true;
  }

  /** The tracked status of a message, or `null` when the queue does not know it. */
  getMessageStatus(messageId: string): MessageStatus | null {
    const pending = this.queue.get(messageId);
    if (pending) return pending.message.status;
    const inflight = this.processing.get(messageId);
    if (inflight) return inflight.message.status;
    if (this.failed.has(messageId)) return 'failed';
    if (this.completed.has(messageId)) return 'confirmed';
    return null;
  }

  /** Read-only view of every message currently being delivered, for monitoring and reconciliation. */
  getInflightSnapshot(): InflightMessageSnapshot[] {
    return Array.from(this.processing.values()).map((item) => ({
      messageId: item.message.id,
      status: item.message.status,
      attempts: item.attempts,
      queuedAt: item.queuedAt,
      inflightAt: item.inflightAt,
      submittedAt: item.submittedAt,
      submittedTxHash: item.submittedTxHash,
      destinationChainId: item.message.destinationChainId,
      message: { ...item.message },
    }));
  }

  /**
   * Marks an in-flight message failed immediately, with no further delivery
   * attempt. Used when the destination chain proves the attempt cannot
   * succeed, such as a reverted transaction. Returns `false` when the message
   * is not in flight.
   */
  fail(messageId: string, error?: string): boolean {
    const item = this.processing.get(messageId);
    if (!item) return false;
    this.processing.delete(messageId);
    item.message.status = 'failed';
    item.message.lastError = error;
    this.failed.set(messageId, item);
    this.emit('message-failed', {
      messageId,
      attempts: item.attempts,
      lastError: error,
      reason: 'forced',
    });
    return true;
  }

  getCompletedCount(): number {
    return this.completed.size;
  }

  getFailedCount(): number {
    return this.failed.size;
  }

  getFailedMessages(): CrossChainMessage[] {
    return Array.from(this.failed.values()).map((item) => item.message);
  }

  getCompletedMessages(): ExecutionResult[] {
    return Array.from(this.completed.values());
  }

  retryFailed(messageId: string): boolean {
    const item = this.failed.get(messageId);
    if (!item) return false;

    this.failed.delete(messageId);
    item.attempts = 0;
    item.nextRetryAt = Date.now();
    item.message.status = 'queued';
    this.queue.set(messageId, item);
    this.emit('message-retry-queued', { messageId });
    return true;
  }

  retryAllFailed(): number {
    let count = 0;
    for (const [id, item] of this.failed.entries()) {
      this.failed.delete(id);
      item.attempts = 0;
      item.nextRetryAt = Date.now();
      item.message.status = 'queued';
      this.queue.set(id, item);
      count++;
    }
    if (count > 0) {
      this.emit('all-failed-retry-queued', { count });
    }
    return count;
  }

  getDuplicateStats(): DuplicateDetectorStats | null {
    return this.detector ? this.detector.getStats() : null;
  }

  /** Intake counters. A rising `rejected` count points at a broken producer. */
  getValidationStats(): MessageValidationStats {
    return { ...this.validationStats };
  }

  clear(): void {
    this.queue.clear();
    this.processing.clear();
    this.failed.clear();
    this.completed.clear();
    this.detector?.clear();
    this.validationStats = { checked: 0, accepted: 0, rejected: 0 };
    this.emit('queue-cleared');
  }

  /**
   * Rejects structurally malformed messages before they reach the queue or the
   * duplicate detector. `messageId` is reported as a string even when the
   * field is missing or of the wrong type, so the event stays loggable.
   *
   * Counters describe validation outcomes only; duplicate rejections are
   * reported by `getDuplicateStats`.
   */
  private validate(message: CrossChainMessage): boolean {
    if (this.validation === false) return true;

    this.validationStats.checked++;
    const result = validateCrossChainMessage(message, this.validation);
    if (result.valid) {
      this.validationStats.accepted++;
      return true;
    }

    this.validationStats.rejected++;
    this.emit('message-rejected', {
      messageId: typeof message?.id === 'string' ? message.id : undefined,
      reason: 'malformed',
      errors: result.errors,
    });
    return false;
  }

  /**
   * The detector catches content re-deliveries within its window; the
   * lifecycle maps catch ID re-deliveries for as long as the queue holds the
   * message, including after it has left the detector window.
   */
  private checkDuplicate(message: CrossChainMessage): DuplicateCheckResult {
    const detected = this.detector?.register(message);
    if (detected?.duplicate) return detected;

    const known = this.queue.get(message.id) ?? this.processing.get(message.id) ?? this.failed.get(message.id);
    if (known || this.completed.has(message.id)) {
      // Aged out of the detector window: don't let the rejected copy be recorded as new.
      this.detector?.release(message.id);
      const fingerprint = detected?.fingerprint ?? computeMessageFingerprint(message);
      const conflict = known !== undefined && computeMessageFingerprint(known.message) !== fingerprint;
      return {
        duplicate: true,
        reason: conflict ? 'message-id-conflict' : 'message-id',
        fingerprint,
        originalMessageId: message.id,
      };
    }

    return detected ?? { duplicate: false, fingerprint: computeMessageFingerprint(message) };
  }
}
