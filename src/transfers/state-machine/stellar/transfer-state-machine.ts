import {
  RecoveryPath,
  RecoveryPathDefinition,
  TransferEvent,
  TransferLifecycle,
  TransferState,
} from './types';

/**
 * Allowed state transitions for the transfer lifecycle.
 */
const ALLOWED_TRANSITIONS: Record<TransferState, TransferState[]> = {
  CREATED: ['VALIDATING', 'FAILED'],
  VALIDATING: ['ROUTE_SELECTED', 'FAILED'],
  ROUTE_SELECTED: ['BRIDGE_LOCKING', 'FAILED'],
  BRIDGE_LOCKING: ['BRIDGE_LOCKED', 'FAILED', 'RECOVERING'],
  BRIDGE_LOCKED: ['EXECUTING', 'FAILED', 'RECOVERING'],
  EXECUTING: ['COMPLETED', 'FAILED', 'RECOVERING'],
  COMPLETED: [],
  FAILED: ['RECOVERING', 'REFUNDED'],
  RECOVERING: ['BRIDGE_LOCKING', 'ROUTE_SELECTED', 'EXECUTING', 'FAILED', 'REFUNDED'],
  REFUNDED: [],
};

/**
 * Recovery path definitions with descriptions.
 */
const RECOVERY_PATH_DEFINITIONS: Record<RecoveryPath, string> = {
  'auto-retry': 'Automatically retry the transfer with the same parameters',
  'fallback-route': 'Switch to an alternate route and retry',
  'manual-intervention': 'Requires manual review and intervention',
  'refund': 'Initiate a refund to the source chain',
};

const TERMINAL_STATES: TransferState[] = ['COMPLETED', 'REFUNDED'];

/**
 * Higher-level transfer lifecycle manager (#535).
 *
 * Wraps the low-level state machine with transfer-level semantics including
 * recovery paths, event tracking, and lifecycle management.
 */
export class TransferStateMachine {
  private readonly lifecycle: TransferLifecycle;

  constructor(
    transferId: string,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.lifecycle = {
      transferId,
      currentState: 'CREATED',
      events: [],
      createdAt: now(),
      updatedAt: now(),
    };
  }

  get state(): TransferLifecycle {
    return { ...this.lifecycle, events: [...this.lifecycle.events] };
  }

  get currentState(): TransferState {
    return this.lifecycle.currentState;
  }

  get events(): readonly TransferEvent[] {
    return this.lifecycle.events;
  }

  get recoveryPath(): RecoveryPathDefinition | undefined {
    return this.lifecycle.recoveryPath;
  }

  isTerminal(): boolean {
    return TERMINAL_STATES.includes(this.lifecycle.currentState);
  }

  canTransitionTo(next: TransferState): boolean {
    return ALLOWED_TRANSITIONS[this.lifecycle.currentState].includes(next);
  }

  nextStates(): TransferState[] {
    return [...ALLOWED_TRANSITIONS[this.lifecycle.currentState]];
  }

  transition(next: TransferState, reason?: string): TransferState {
    if (!this.canTransitionTo(next)) {
      throw new Error(
        `Invalid transfer transition: ${this.lifecycle.currentState} -> ${next}`,
      );
    }

    const event: TransferEvent = {
      from: this.lifecycle.currentState,
      to: next,
      timestamp: this.now(),
      reason,
    };

    this.lifecycle.events.push(event);
    this.lifecycle.currentState = next;
    this.lifecycle.updatedAt = this.now();

    return next;
  }

  setRecoveryPath(path: RecoveryPath): RecoveryPathDefinition {
    const definition: RecoveryPathDefinition = {
      path,
      description: RECOVERY_PATH_DEFINITIONS[path],
      triggeredAt: this.now(),
    };
    this.lifecycle.recoveryPath = definition;
    return definition;
  }

  availableRecoveryPaths(): RecoveryPath[] {
    if (this.lifecycle.currentState === 'FAILED') {
      return ['auto-retry', 'fallback-route', 'manual-intervention', 'refund'];
    }
    if (this.lifecycle.currentState === 'RECOVERING') {
      return ['refund'];
    }
    return [];
  }

  reset(): void {
    this.lifecycle.currentState = 'CREATED';
    this.lifecycle.recoveryPath = undefined;
    this.lifecycle.updatedAt = this.now();
  }
}
