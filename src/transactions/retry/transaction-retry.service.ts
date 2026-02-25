import { Injectable } from '@nestjs/common';
import { TransactionService } from '../transactions.service';
import { Transaction, TransactionStatus } from '../entities/transaction.entity';

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  backoffStrategy: 'exponential' | 'fixed';
}

export interface RetryAttemptLog {
  transactionId: string;
  attempt: number;
  error: string;
  timestamp: Date;
}

@Injectable()
export class TransactionRetryService {
  private retryLogs: RetryAttemptLog[] = [];
  private retryPolicy: RetryPolicy = {
    maxRetries: 3,
    backoffMs: 1000,
    backoffStrategy: 'exponential',
  };

  constructor(private readonly transactionService: TransactionService) {}

  setPolicy(policy: Partial<RetryPolicy>) {
    this.retryPolicy = { ...this.retryPolicy, ...policy };
  }

  async retryTransaction(transaction: Transaction): Promise<Transaction | null> {
    if (!this.isSafeToRetry(transaction)) return null;
    let attempt = 0;
    let lastError = '';
    while (attempt < this.retryPolicy.maxRetries) {
      try {
        // Custom retry logic: re-execute transaction
        const updated = await this.transactionService.update(transaction.id, {
          status: TransactionStatus.IN_PROGRESS,
        });
        // Simulate execution (replace with actual execution logic)
        // If successful:
        return updated;
      } catch (err) {
        lastError = err.message || String(err);
        this.logRetryAttempt(transaction.id, attempt + 1, lastError);
        attempt++;
        await this.backoff(attempt);
      }
    }
    // Mark as failed after max retries
    await this.transactionService.markFailed(transaction.id, lastError);
    return null;
  }

  private isSafeToRetry(transaction: Transaction): boolean {
    // Only retry if status is FAILED and not completed
    return (
      transaction.status === TransactionStatus.FAILED &&
      !transaction.completedAt
    );
  }

  private logRetryAttempt(transactionId: string, attempt: number, error: string) {
    this.retryLogs.push({
      transactionId,
      attempt,
      error,
      timestamp: new Date(),
    });
    // TODO: Integrate with analytics collector
  }

  private async backoff(attempt: number) {
    let ms = this.retryPolicy.backoffMs;
    if (this.retryPolicy.backoffStrategy === 'exponential') {
      ms = ms * Math.pow(2, attempt - 1);
    }
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getRetryLogs(transactionId?: string): RetryAttemptLog[] {
    if (!transactionId) return this.retryLogs;
    return this.retryLogs.filter((log) => log.transactionId === transactionId);
  }
}
