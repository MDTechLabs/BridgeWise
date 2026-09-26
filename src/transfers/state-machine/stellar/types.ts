/**
 * Types for the Soroban Transfer State Machine (#535).
 *
 * Defines transfer states, lifecycle events, and recovery paths for the
 * higher-level transfer lifecycle manager.
 */

export type TransferState =
  | 'CREATED'
  | 'VALIDATING'
  | 'ROUTE_SELECTED'
  | 'BRIDGE_LOCKING'
  | 'BRIDGE_LOCKED'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'RECOVERING'
  | 'REFUNDED';

export type RecoveryPath = 'auto-retry' | 'fallback-route' | 'manual-intervention' | 'refund';

export interface TransferEvent {
  from: TransferState;
  to: TransferState;
  timestamp: number;
  reason?: string;
}

export interface RecoveryPathDefinition {
  path: RecoveryPath;
  description: string;
  triggeredAt?: number;
}

export interface TransferLifecycle {
  transferId: string;
  currentState: TransferState;
  events: TransferEvent[];
  recoveryPath?: RecoveryPathDefinition;
  createdAt: number;
  updatedAt: number;
}
