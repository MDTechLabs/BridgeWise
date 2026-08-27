/**
 * Failure codes from the Stellar/Soroban failure analysis that are considered
 * transient and safe to retry automatically.
 */
export const RETRYABLE_FAILURE_CODES = new Set<string>([
  'SEQUENCE_MISMATCH',
  'TRANSACTION_EXPIRED',
  'NETWORK_UNAVAILABLE',
  'RATE_LIMIT_EXCEEDED',
  'INSUFFICIENT_FEE',
]);

/**
 * Configuration that controls retry timing and attempt limits.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts before abandoning the operation */
  maxAttempts: number;
  /** Delay before the first retry in milliseconds */
  initialDelayMs: number;
  /** Upper bound on any computed delay in milliseconds */
  maxDelayMs: number;
  /** Multiplier applied to the delay on each successive attempt */
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
  backoffMultiplier: 2,
};

/**
 * Record of a single retry attempt.
 */
export interface RetryAttempt {
  /** 1-based attempt number */
  attemptNumber: number;
  /** Unix timestamp (ms) when this attempt began */
  startedAt: number;
  /** Whether this specific attempt succeeded */
  success: boolean;
  /** Error message if the attempt failed */
  error?: string;
  /** Delay in ms that will be applied before the next attempt, if any */
  nextRetryDelayMs?: number;
}

/**
 * Aggregated outcome of all retry attempts for a single transfer.
 */
export interface RetryResult {
  /** Stellar transaction hash of the transfer that was retried */
  transferHash: string;
  /** Number of operation invocations made (0 if the failure was non-retryable) */
  totalAttempts: number;
  /** Whether the operation ultimately succeeded within the configured attempts */
  success: boolean;
  /** Recovery transaction hash returned by the operation on success */
  recoveryTransactionHash?: string;
  /** Error from the last attempt, or reason skipped when non-retryable */
  finalError?: string;
  /** Chronological history of every attempt made (empty if non-retryable) */
  attempts: RetryAttempt[];
}

/**
 * A function that performs the bridge operation for a given transfer hash.
 * Must resolve to the recovery transaction hash on success, or throw on failure.
 */
export type BridgeOperationFn = (transferHash: string) => Promise<string>;
