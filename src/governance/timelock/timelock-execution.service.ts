/**
 * Timelock Execution Service
 * 
 * Enforces mandatory time delays on high-impact administrative actions,
 * contract upgrades, treasury payouts, and protocol parameter updates.
 */

export interface TimelockConfig {
  minDelayMs: number; // Minimum required delay in ms (e.g. 24h = 86400000)
  maxDelayMs: number; // Maximum allowable delay in ms (e.g. 7d = 604800000)
  gracePeriodMs: number; // Window after ready time before expiration (e.g. 7d)
}

export type TimelockStatus = 'QUEUED' | 'READY' | 'EXECUTED' | 'CANCELLED' | 'EXPIRED';

export interface TimelockOperation<T = Record<string, unknown>> {
  id: string;
  category: 'UPGRADE' | 'PARAMETER_CHANGE' | 'TREASURY' | 'ALLOWLIST' | 'EMERGENCY';
  target: string;
  payload: T;
  proposer: string;
  createdAt: number;
  eta: number; // Estimated time of arrival (ready timestamp)
  gracePeriodEndsAt: number;
  executedAt?: number;
  cancelledAt?: number;
  cancelledBy?: string;
  status: TimelockStatus;
}

export interface TimelockQueueResult {
  success: boolean;
  operationId?: string;
  eta?: number;
  error?: string;
}

export class TimelockExecutionService {
  private minDelayMs: number;
  private maxDelayMs: number;
  private gracePeriodMs: number;
  private operations: Map<string, TimelockOperation> = new Map();

  constructor(config?: Partial<TimelockConfig>) {
    this.minDelayMs = config?.minDelayMs ?? 86400000; // Default 24h
    this.maxDelayMs = config?.maxDelayMs ?? 604800000; // Default 7d
    this.gracePeriodMs = config?.gracePeriodMs ?? 604800000; // Default 7d
  }

  /**
   * Queue a new administrative operation for timelocked execution.
   */
  public queueOperation(
    category: TimelockOperation['category'],
    target: string,
    payload: Record<string, unknown>,
    proposer: string,
    delayMs: number = this.minDelayMs
  ): TimelockQueueResult {
    if (delayMs < this.minDelayMs) {
      return {
        success: false,
        error: `Requested delay (${delayMs}ms) is less than minimum required delay (${this.minDelayMs}ms)`,
      };
    }

    if (delayMs > this.maxDelayMs) {
      return {
        success: false,
        error: `Requested delay (${delayMs}ms) exceeds maximum allowable delay (${this.maxDelayMs}ms)`,
      };
    }

    const now = Date.now();
    const eta = now + delayMs;
    const gracePeriodEndsAt = eta + this.gracePeriodMs;
    const operationId = `tl-${now}-${Math.random().toString(36).substring(2, 8)}`;

    const op: TimelockOperation = {
      id: operationId,
      category,
      target,
      payload,
      proposer,
      createdAt: now,
      eta,
      gracePeriodEndsAt,
      status: 'QUEUED',
    };

    this.operations.set(operationId, op);
    return { success: true, operationId, eta };
  }

  /**
   * Cancel a queued timelocked operation before execution (e.g. by Guardian or Multisig).
   */
  public cancelOperation(operationId: string, canceller: string): { success: boolean; error?: string } {
    const op = this.operations.get(operationId);
    if (!op) {
      return { success: false, error: `Operation ${operationId} not found` };
    }

    this.updateOperationStatus(op);

    if (op.status === 'EXECUTED') {
      return { success: false, error: `Operation ${operationId} has already been executed` };
    }

    if (op.status === 'CANCELLED') {
      return { success: false, error: `Operation ${operationId} is already cancelled` };
    }

    op.status = 'CANCELLED';
    op.cancelledAt = Date.now();
    op.cancelledBy = canceller;

    return { success: true };
  }

  /**
   * Execute a timelocked operation after its mandatory delay has elapsed.
   */
  public executeOperation(operationId: string, executor: string): { success: boolean; error?: string } {
    const op = this.operations.get(operationId);
    if (!op) {
      return { success: false, error: `Operation ${operationId} not found` };
    }

    this.updateOperationStatus(op);

    if (op.status === 'CANCELLED') {
      return { success: false, error: `Operation ${operationId} was cancelled` };
    }

    if (op.status === 'EXECUTED') {
      return { success: false, error: `Operation ${operationId} has already been executed` };
    }

    if (op.status === 'EXPIRED') {
      return { success: false, error: `Operation ${operationId} has expired past its grace period` };
    }

    if (op.status === 'QUEUED') {
      const remainingMs = op.eta - Date.now();
      return {
        success: false,
        error: `Timelock delay not elapsed. Operation ready in ${Math.ceil(remainingMs / 1000)}s`,
      };
    }

    // Status is READY
    op.status = 'EXECUTED';
    op.executedAt = Date.now();

    return { success: true };
  }

  /**
   * Get current status of an operation, taking into account current timestamp.
   */
  public getOperation(operationId: string): TimelockOperation | undefined {
    const op = this.operations.get(operationId);
    if (!op) return undefined;

    this.updateOperationStatus(op);
    return { ...op };
  }

  /**
   * List all queued or ready operations.
   */
  public getPendingOperations(): TimelockOperation[] {
    const pending: TimelockOperation[] = [];
    for (const op of this.operations.values()) {
      this.updateOperationStatus(op);
      if (op.status === 'QUEUED' || op.status === 'READY') {
        pending.push({ ...op });
      }
    }
    return pending;
  }

  private updateOperationStatus(op: TimelockOperation): void {
    if (op.status === 'EXECUTED' || op.status === 'CANCELLED') {
      return;
    }

    const now = Date.now();
    if (now > op.gracePeriodEndsAt) {
      op.status = 'EXPIRED';
    } else if (now >= op.eta) {
      op.status = 'READY';
    } else {
      op.status = 'QUEUED';
    }
  }
}
