/**
 * Stellar Bridge Execution State Machine.
 *
 * Models the complete lifecycle of a bridge transfer through the execution
 * layer and enforces deterministic, valid state transitions. Each transition
 * is recorded so the full history is available for auditing and debugging.
 *
 * Valid transition paths:
 *
 * Happy path:
 *   idle → initiated → locking → locked → bridging → minting → confirming → completed
 *
 * Failure paths (from any in-flight state):
 *   initiated/locking/locked → failed → rolling_back → refunded
 *   bridging → failed → rolling_back → refunded
 *   minting → failed → rolling_back → refunded
 *   confirming → failed → rolling_back → refunded
 *
 * Terminal states: completed, refunded
 */

import {
  BridgeExecutionState,
  BridgeTransitionRecord,
  BridgeExecutionLifecycle,
} from '../types/bridge-execution-state-machine.types';

/**
 * Allowed transitions: state → states reachable from it.
 *
 * The graph covers:
 *   • happy-path flow (idle → completed)
 *   • failure at any in-flight stage
 *   • rollback and refund recovery
 */
const TRANSITIONS: Record<BridgeExecutionState, readonly BridgeExecutionState[]> = {
  idle: ['initiated'],
  initiated: ['locking', 'failed'],
  locking: ['locked', 'failed'],
  locked: ['bridging', 'failed'],
  bridging: ['minting', 'failed'],
  minting: ['confirming', 'failed'],
  confirming: ['completed', 'failed'],
  completed: [],
  failed: ['rolling_back', 'refunded'],
  rolling_back: ['refunded'],
  refunded: [],
};

/**
 * Thrown when a transition is attempted that is not in the allowed graph.
 */
export class InvalidBridgeTransitionError extends Error {
  constructor(
    public readonly from: BridgeExecutionState,
    public readonly to: BridgeExecutionState,
  ) {
    super(`Invalid bridge execution transition: ${from} -> ${to}`);
    this.name = 'InvalidBridgeTransitionError';
  }
}

/**
 * Deterministic state machine for the Stellar bridge execution lifecycle.
 *
 * ```ts
 * const sm = new StellarBridgeExecutionStateMachine();
 * sm.transition('initiated');  // → initiated
 * sm.transition('locking');    // → locking
 * sm.transition('locked');     // → locked
 * // …
 * ```
 */
export class StellarBridgeExecutionStateMachine {
  private state: BridgeExecutionState;
  private readonly transitions: BridgeTransitionRecord[] = [];

  constructor(
    initialState: BridgeExecutionState = 'idle',
    private readonly now: () => number = () => Date.now(),
  ) {
    this.state = initialState;
  }

  /** Current lifecycle state. */
  get current(): BridgeExecutionState {
    return this.state;
  }

  /** Ordered history of transitions taken. */
  get history(): readonly BridgeTransitionRecord[] {
    return this.transitions;
  }

  /** A terminal state has no outgoing transitions. */
  isTerminal(): boolean {
    return TRANSITIONS[this.state].length === 0;
  }

  /** Whether the machine may move to `next` from its current state. */
  canTransition(next: BridgeExecutionState): boolean {
    return TRANSITIONS[this.state].includes(next);
  }

  /** States reachable from the current state. */
  nextStates(): readonly BridgeExecutionState[] {
    return TRANSITIONS[this.state];
  }

  /**
   * Return a snapshot of the full execution lifecycle.
   */
  toLifecycle(transferId: string): BridgeExecutionLifecycle {
    return {
      transferId,
      current: this.current,
      history: this.history,
      isTerminal: this.isTerminal(),
      nextStates: this.nextStates(),
    };
  }

  /**
   * Move to `next`, recording the transition. Throws
   * {@link InvalidBridgeTransitionError} if the transition is not allowed.
   *
   * @returns The new state after transition.
   */
  transition(next: BridgeExecutionState): BridgeExecutionState {
    if (!this.canTransition(next)) {
      throw new InvalidBridgeTransitionError(this.state, next);
    }

    this.transitions.push({
      from: this.state,
      to: next,
      at: this.now(),
    });
    this.state = next;
    return this.state;
  }
}
