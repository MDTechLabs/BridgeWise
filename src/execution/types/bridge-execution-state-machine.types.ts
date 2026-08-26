/**
 * Types for the Stellar Bridge Execution State Machine.
 *
 * Models the complete lifecycle of a bridge transfer through the execution
 * layer, covering source-chain locking, cross-chain bridging, target-chain
 * minting, and rollback/refund paths.
 */

/**
 * All possible states a bridge execution can be in.
 *
 * - idle         – no active transfer
 * - initiated    – transfer request received, preparing execution
 * - locking      – source-chain assets are being locked
 * - locked       – source-chain assets confirmed locked
 * - bridging     – cross-chain message or proof relay in progress
 * - minting      – target-chain tokens are being minted/released
 * - confirming   – waiting for target-chain finality
 * - completed    – transfer successfully finalised
 * - failed       – unrecoverable error occurred
 * - rolling_back – source-chain lock is being reverted
 * - refunded     – assets returned to sender
 */
export type BridgeExecutionState =
  | 'idle'
  | 'initiated'
  | 'locking'
  | 'locked'
  | 'bridging'
  | 'minting'
  | 'confirming'
  | 'completed'
  | 'failed'
  | 'rolling_back'
  | 'refunded';

/**
 * Record of a single state transition.
 */
export interface BridgeTransitionRecord {
  from: BridgeExecutionState;
  to: BridgeExecutionState;
  at: number;
}

/**
 * Snapshot of the full execution lifecycle.
 */
export interface BridgeExecutionLifecycle {
  transferId: string;
  current: BridgeExecutionState;
  history: readonly BridgeTransitionRecord[];
  isTerminal: boolean;
  nextStates: readonly BridgeExecutionState[];
}
