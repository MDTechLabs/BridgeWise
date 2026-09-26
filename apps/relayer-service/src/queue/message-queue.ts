import { EventEmitter } from 'events';
import {
  CrossChainMessage,
  MessageStatus,
  MessageQueueItem,
  QueueConfig,
  ExecutionResult,
} from '../types';

const DEFAULT_CONFIG: QueueConfig = {
  maxRetries: 5,
  retryDelayMs: 5000,
  concurrency: 10,
  pollIntervalMs: 1000,
};

export class MessageQueue extends EventEmitter {
  private config: QueueConfig;
  private queue: Map<string, MessageQueueItem> = new Map();
  private processing: Set<string> = new Set();
  private failed: Map<string, MessageQueueItem> = new Map();
  private completed: Map<string, ExecutionResult> = new Map();
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<QueueConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  enqueue(message: CrossChainMessage): void {
    const existing = this.queue.get(message.id);
    if (existing) {
      this.emit('duplicate-message', { messageId: message.id });
      return;
    }

    const item: MessageQueueItem = {
      message: { ...message, status: 'queued' },
      queuedAt: Date.now(),
      nextRetryAt: Date.now(),
      attempts: 0,
    };
    this.queue.set(message.id, item);
    this.emit('message-enqueued', { messageId: message.id, destinationChainId: message.destinationChainId });
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
    this.processing.add(oldest.message.id);
    oldest.message.status = 'processing';

    this.emit('message-dequeued', { messageId: oldest.message.id });
    return oldest.message;
  }

  async complete(result: ExecutionResult): Promise<void> {
    this.processing.delete(result.messageId);
    this.completed.set(result.messageId, result);

    if (result.success) {
      this.emit('message-completed', result);
    } else {
      const item = this.getMessage(result.messageId, result);
      if (item) {
        item.attempts++;
        if (item.attempts < this.config.maxRetries) {
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
    }
  }

  getPendingCount(): number {
    return this.queue.size;
  }

  getProcessingCount(): number {
    return this.processing.size;
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

  clear(): void {
    this.queue.clear();
    this.processing.clear();
    this.failed.clear();
    this.completed.clear();
    this.emit('queue-cleared');
  }

  private getMessage(messageId: string, result?: ExecutionResult): MessageQueueItem | null {
    const fromQueue = this.queue.get(messageId);
    if (fromQueue) return fromQueue;
    const fromFailed = this.failed.get(messageId);
    if (fromFailed) return fromFailed;
    return null;
  }
}
