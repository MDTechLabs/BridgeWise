export type TransferState =
  | 'pending'
  | 'locked'
  | 'validated'
  | 'submitted'
  | 'confirmed'
  | 'completed'
  | 'failed'
  | 'refunded';

export interface TransitionRecord {
  from: TransferState;
  to: TransferState;
  at: number;
}

export interface TransferLifecycle {
  transferId: string;
  current: TransferState;
  history: TransitionRecord[];
  isTerminal: boolean;
  nextStates: TransferState[];
}
