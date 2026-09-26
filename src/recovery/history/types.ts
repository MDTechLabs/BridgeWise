/**
 * src/recovery/history/types.ts
 *
 * Shared types for tracking automated recovery attempts made against a
 * bridge transfer. These types are transport/network-agnostic; network
 * specific adapters (e.g. src/recovery/history/stellar) build on top of
 * them.
 */

/** Lifecycle status of a transfer's recovery process. */
export enum RecoveryStatus {
  /** No attempts have been made yet. */
  PENDING = 'PENDING',
  /** A recovery attempt is currently in flight. */
  IN_PROGRESS = 'IN_PROGRESS',
  /** Recovery succeeded — the transfer was resolved. */
  RECOVERED = 'RECOVERED',
  /** The most recent attempt failed, but more attempts remain. */
  FAILED = 'FAILED',
  /** All allowed attempts have been exhausted without success. */
  MAX_ATTEMPTS_EXCEEDED = 'MAX_ATTEMPTS_EXCEEDED',
}

/** A single recorded recovery attempt. */
export interface RecoveryAttempt {
  /** 1-indexed position of this attempt for the transfer. */
  attemptNumber: number;
  /** ISO-8601 timestamp of when the attempt was recorded. */
  timestamp: string;
  /** Outcome status of this specific attempt. */
  status: RecoveryStatus.RECOVERED | RecoveryStatus.FAILED;
  /** Human/machine readable failure reason. Omitted on success. */
  reason?: string;
  /** Arbitrary network-specific context (tx hash, ledger sequence, etc). */
  metadata?: Record<string, unknown>;
}

/** Full recovery history for a single transfer. */
export interface RecoveryHistoryRecord {
  /** Identifier of the transfer being recovered. */
  transferId: string;
  /** Network/chain this transfer belongs to, e.g. "stellar". */
  network: string;
  /** All attempts made so far, in chronological order. */
  attempts: RecoveryAttempt[];
  /** Current overall status derived from the attempts. */
  finalStatus: RecoveryStatus;
  /** Maximum number of attempts allowed for this transfer. */
  maxAttempts: number;
  /** ISO-8601 timestamp of when the record was first created. */
  createdAt: string;
  /** ISO-8601 timestamp of the last update to the record. */
  updatedAt: string;
}

/** Input describing the outcome of a recovery attempt to be recorded. */
export interface RecordAttemptInput {
  transferId: string;
  network: string;
  /** Whether this attempt succeeded. */
  success: boolean;
  /** Required when success is false. */
  reason?: string;
  /** Optional network-specific metadata to attach to the attempt. */
  metadata?: Record<string, unknown>;
  /**
   * Maximum attempts allowed for this transfer. Only needs to be supplied
   * once (e.g. on the first attempt) — subsequent calls reuse the stored
   * value unless a new one is explicitly passed.
   */
  maxAttempts?: number;
}

/** Thrown when a recovery attempt is made after max attempts is reached. */
export class MaxRecoveryAttemptsExceededError extends Error {
  constructor(
    public readonly transferId: string,
    public readonly maxAttempts: number,
  ) {
    super(
      `Recovery history for transfer "${transferId}" has already reached its maximum of ${maxAttempts} attempt(s).`,
    );
    this.name = 'MaxRecoveryAttemptsExceededError';
  }
}

/** Default cap used when no maxAttempts is supplied for a new record. */
export const DEFAULT_MAX_RECOVERY_ATTEMPTS = 5;
