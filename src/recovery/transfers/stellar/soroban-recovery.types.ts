export enum TransferFailureReason {
  INSUFFICIENT_FEE = 'INSUFFICIENT_FEE',
  TIMEOUT_EXPIRED = 'TIMEOUT_EXPIRED',
  SLIPPAGE_EXCEEDED = 'SLIPPAGE_EXCEEDED',
  DESTINATION_ACCOUNT_NOT_FOUND = 'DESTINATION_ACCOUNT_NOT_FOUND',
  CONTRACT_REVERT = 'CONTRACT_REVERT',
  NETWORK_CONGESTION = 'NETWORK_CONGESTION',
}

export enum RecoveryActionType {
  RETRY_WITH_HIGHER_FEE = 'RETRY_WITH_HIGHER_FEE',
  REFUND_TO_SOURCE = 'REFUND_TO_SOURCE',
  CREATE_TRUSTLINE_AND_RETRY = 'CREATE_TRUSTLINE_AND_RETRY',
  RETRY_WITH_SLIPPAGE_ADJUSTMENT = 'RETRY_WITH_SLIPPAGE_ADJUSTMENT',
  MANUAL_INTERVENTION_REQUIRED = 'MANUAL_INTERVENTION_REQUIRED',
}

export interface FailedTransferDetails {
  transferId: string;
  sourceAccount: string;
  destinationAccount: string;
  assetCode: string;
  amount: string;
  failureReason: TransferFailureReason;
  rawErrorDetails?: string;
  txHash?: string;
}

export interface RecoveryStep {
  stepNumber: number;
  actionType: RecoveryActionType;
  description: string;
  canAutoExecute: boolean;
  payload?: Record<string, any>;
}

export interface RecoveryPlan {
  transferId: string;
  failureReason: TransferFailureReason;
  recommendedAction: RecoveryActionType;
  isAutoRecoverable: boolean;
  steps: RecoveryStep[];
  generatedAt: Date;
}