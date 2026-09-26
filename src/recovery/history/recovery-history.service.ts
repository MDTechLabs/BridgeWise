/**
 * src/recovery/history/recovery-history.service.ts
 *
 * Tracks every automated recovery attempt made for a bridge transfer:
 * timestamps, failure reasons, attempt counts, and final recovery status.
 * Enforces a maximum-attempts ceiling per transfer.
 */

import {
  DEFAULT_MAX_RECOVERY_ATTEMPTS,
  MaxRecoveryAttemptsExceededError,
  RecordAttemptInput,
  RecoveryAttempt,
  RecoveryHistoryRecord,
  RecoveryStatus,
} from './types';
import {
  InMemoryRecoveryHistoryStore,
  RecoveryHistoryStore,
} from './recovery-history.store';

export class RecoveryHistoryService {
  constructor(
    private readonly store: RecoveryHistoryStore = new InMemoryRecoveryHistoryStore(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /**
   * Records a recovery attempt for a transfer, creating the history
   * record on first use. Throws MaxRecoveryAttemptsExceededError if the
   * transfer has already exhausted its allowed attempts.
   */
  recordAttempt(input: RecordAttemptInput): RecoveryHistoryRecord {
    const now = this.clock().toISOString();
    const existing = this.store.get(input.transferId);

    if (
      existing &&
      existing.finalStatus === RecoveryStatus.MAX_ATTEMPTS_EXCEEDED
    ) {
      throw new MaxRecoveryAttemptsExceededError(
        input.transferId,
        existing.maxAttempts,
      );
    }

    if (existing && existing.finalStatus === RecoveryStatus.RECOVERED) {
      // Already resolved; nothing further to record.
      return existing;
    }

    const maxAttempts =
      input.maxAttempts ??
      existing?.maxAttempts ??
      DEFAULT_MAX_RECOVERY_ATTEMPTS;

    const nextAttemptNumber = (existing?.attempts.length ?? 0) + 1;

    if (nextAttemptNumber > maxAttempts) {
      const record: RecoveryHistoryRecord = {
        transferId: input.transferId,
        network: input.network,
        attempts: existing?.attempts ?? [],
        finalStatus: RecoveryStatus.MAX_ATTEMPTS_EXCEEDED,
        maxAttempts,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      this.store.save(record);
      throw new MaxRecoveryAttemptsExceededError(input.transferId, maxAttempts);
    }

    if (!input.success && !input.reason) {
      throw new Error(
        'A failure reason is required when recording an unsuccessful recovery attempt.',
      );
    }

    const attempt: RecoveryAttempt = {
      attemptNumber: nextAttemptNumber,
      timestamp: now,
      status: input.success ? RecoveryStatus.RECOVERED : RecoveryStatus.FAILED,
      ...(input.success ? {} : { reason: input.reason }),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };

    const attempts = [...(existing?.attempts ?? []), attempt];

    let finalStatus: RecoveryStatus;
    if (input.success) {
      finalStatus = RecoveryStatus.RECOVERED;
    } else if (attempts.length >= maxAttempts) {
      finalStatus = RecoveryStatus.MAX_ATTEMPTS_EXCEEDED;
    } else {
      finalStatus = RecoveryStatus.FAILED;
    }

    const record: RecoveryHistoryRecord = {
      transferId: input.transferId,
      network: input.network,
      attempts,
      finalStatus,
      maxAttempts,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.store.save(record);
    return record;
  }

  /** Returns the full history for a transfer, or undefined if none exists. */
  getHistory(transferId: string): RecoveryHistoryRecord | undefined {
    return this.store.get(transferId);
  }

  /** Returns the number of attempts recorded so far for a transfer. */
  getAttemptCount(transferId: string): number {
    return this.store.get(transferId)?.attempts.length ?? 0;
  }

  /** Returns the failure reasons recorded for a transfer, in order. */
  getFailureReasons(transferId: string): string[] {
    return (this.store.get(transferId)?.attempts ?? [])
      .filter((attempt): attempt is RecoveryAttempt & { reason: string } =>
        Boolean(attempt.reason),
      )
      .map((attempt) => attempt.reason);
  }

  /** Returns the current overall recovery status for a transfer. */
  getStatus(transferId: string): RecoveryStatus {
    return this.store.get(transferId)?.finalStatus ?? RecoveryStatus.PENDING;
  }

  /** Whether the transfer has hit its maximum allowed recovery attempts. */
  isMaxAttemptsReached(transferId: string): boolean {
    return this.getStatus(transferId) === RecoveryStatus.MAX_ATTEMPTS_EXCEEDED;
  }

  /** Removes all history for a transfer (e.g. after archival). */
  clearHistory(transferId: string): void {
    this.store.delete(transferId);
  }
}
