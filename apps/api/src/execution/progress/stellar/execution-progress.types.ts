export enum ExecutionState {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  CONFIRMING = 'CONFIRMING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  RECOVERING = 'RECOVERING',
  CANCELLED = 'CANCELLED',
}

export const TERMINAL_STATES: ReadonlySet<ExecutionState> = new Set([
  ExecutionState.CONFIRMED,
  ExecutionState.FAILED,
  ExecutionState.CANCELLED,
]);

export interface ExecutionProgressEvent {
  executionId: string;
  state: ExecutionState;
  /** Stellar transaction id/hash once available. */
  transactionId?: string;
  message?: string;
  /** Monotonic per-execution sequence number. */
  sequence: number;
  timestamp: string;
}

export interface EmitProgressOptions {
  transactionId?: string;
  message?: string;
}
