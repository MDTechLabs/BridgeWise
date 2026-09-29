/**
 * Paused contract behaviour.
 *
 * Pausing a bridge contract is the emergency brake: normal state-changing
 * operations must stop, and only the few recovery operations needed to unwind
 * a stuck transfer may continue. This harness models those transitions
 * deterministically so the pause behaviour can be asserted directly, without
 * deploying a contract.
 */

export type PausableOperation =
  | 'deposit'
  | 'withdraw'
  | 'settle'
  | 'upgrade'
  | 'rotate-guardian'
  | 'recover';

export type PausableResultCode =
  | 'EXECUTED'
  | 'PAUSED'
  | 'UNPAUSED'
  | 'REJECTED_PAUSED'
  | 'UNAUTHORIZED'
  | 'NOOP';

export interface PausableContractResult {
  ok: boolean;
  code: PausableResultCode;
  message: string;
}

export type PausableLifecycleEvent =
  | 'paused'
  | 'unpaused'
  | 'executed'
  | 'rejected';

export interface PausableLifecycleRecord {
  event: PausableLifecycleEvent;
  operation?: PausableOperation;
  actor: string;
  at: number;
}

export interface PausableContractState {
  paused: boolean;
  pausedBy?: string;
  changedAt?: number;
  executions: number;
  rejections: number;
  log: PausableLifecycleRecord[];
}

export interface PausableContractHarnessConfig {
  admin: string;
  /** Operations that remain available while paused. Defaults to `recover`. */
  recoveryOperations?: PausableOperation[];
  /** Injectable clock for deterministic tests. */
  clock?: () => number;
}

const DEFAULT_RECOVERY_OPERATIONS: PausableOperation[] = ['recover'];

export class PausableContractHarness {
  private readonly admin: string;
  private readonly recoveryOperations: Set<PausableOperation>;
  private readonly clock: () => number;
  private state: PausableContractState = {
    paused: false,
    executions: 0,
    rejections: 0,
    log: [],
  };

  constructor(config: PausableContractHarnessConfig) {
    this.admin = config.admin;
    this.recoveryOperations = new Set(
      config.recoveryOperations ?? DEFAULT_RECOVERY_OPERATIONS,
    );
    this.clock = config.clock ?? Date.now;
  }

  isPaused(): boolean {
    return this.state.paused;
  }

  pause(actor: string): PausableContractResult {
    if (actor !== this.admin) {
      return this.reject('UNAUTHORIZED', `Caller ${actor} may not pause the contract`, actor);
    }

    if (this.state.paused) {
      return { ok: true, code: 'NOOP', message: 'Contract is already paused' };
    }

    this.state.paused = true;
    this.state.pausedBy = actor;
    this.state.changedAt = this.clock();
    this.state.log.push({ event: 'paused', actor, at: this.state.changedAt });

    return { ok: true, code: 'PAUSED', message: 'Contract paused' };
  }

  unpause(actor: string): PausableContractResult {
    if (actor !== this.admin) {
      return this.reject('UNAUTHORIZED', `Caller ${actor} may not unpause the contract`, actor);
    }

    if (!this.state.paused) {
      return { ok: true, code: 'NOOP', message: 'Contract is not paused' };
    }

    this.state.paused = false;
    this.state.changedAt = this.clock();
    this.state.log.push({ event: 'unpaused', actor, at: this.state.changedAt });

    return { ok: true, code: 'UNPAUSED', message: 'Contract unpaused' };
  }

  /**
   * Execute an operation. While paused, only the configured recovery
   * operations are allowed; everything else is rejected and recorded.
   */
  execute(actor: string, operation: PausableOperation): PausableContractResult {
    if (this.state.paused && !this.recoveryOperations.has(operation)) {
      return this.reject(
        'REJECTED_PAUSED',
        `Operation ${operation} is blocked while the contract is paused`,
        actor,
        operation,
      );
    }

    this.state.executions += 1;
    this.state.log.push({
      event: 'executed',
      operation,
      actor,
      at: this.clock(),
    });

    return {
      ok: true,
      code: 'EXECUTED',
      message: `Operation ${operation} executed`,
    };
  }

  getState(): PausableContractState {
    return { ...this.state, log: [...this.state.log] };
  }

  reset(): void {
    this.state = { paused: false, executions: 0, rejections: 0, log: [] };
  }

  private reject(
    code: PausableResultCode,
    message: string,
    actor: string,
    operation?: PausableOperation,
  ): PausableContractResult {
    this.state.rejections += 1;
    this.state.log.push({ event: 'rejected', operation, actor, at: this.clock() });

    return { ok: false, code, message };
  }
}
