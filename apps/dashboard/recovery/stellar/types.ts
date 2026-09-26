export interface FailedTransfer {
  id: string;
  transferHash: string;
  sourceChain: string;
  destinationChain: string;
  asset: string;
  amount: string;
  failureReason: string;
  failedAt: string;
  recoveryStatus: 'pending' | 'in_progress' | 'recovered' | 'failed';
  retryCount: number;
  lastRetryAt?: string;
}

export interface RecoverySummary {
  total: number;
  pending: number;
  inProgress: number;
  recovered: number;
  failed: number;
}

export interface RecoveryFilter {
  status?: string;
  sourceChain?: string;
  asset?: string;
}
