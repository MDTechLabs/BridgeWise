import {
  FailedTransferDetails,
  RecoveryActionType,
  RecoveryPlan,
  RecoveryStep,
  TransferFailureReason,
} from './soroban-recovery.types';

export class SorobanTransferRecoveryPlannerService {
  /**
   * Evaluates a failed transfer and builds a structured recovery plan.
   */
  public generateRecoveryPlan(details: FailedTransferDetails): RecoveryPlan {
    const { transferId, failureReason } = details;

    const steps = this.determineRecoverySteps(details);
    const recommendedAction = steps[0]?.actionType ?? RecoveryActionType.MANUAL_INTERVENTION_REQUIRED;
    const isAutoRecoverable = steps.some((step) => step.canAutoExecute);

    return {
      transferId,
      failureReason,
      recommendedAction,
      isAutoRecoverable,
      steps,
      generatedAt: new Date(),
    };
  }

  private determineRecoverySteps(details: FailedTransferDetails): RecoveryStep[] {
    switch (details.failureReason) {
      case TransferFailureReason.INSUFFICIENT_FEE:
        return [
          {
            stepNumber: 1,
            actionType: RecoveryActionType.RETRY_WITH_HIGHER_FEE,
            description: 'Increase gas limit / inclusion fee and resubmit the transaction.',
            canAutoExecute: true,
            payload: {
              recommendedFeeBumpFactor: 1.5,
              originalTxHash: details.txHash,
            },
          },
        ];

      case TransferFailureReason.DESTINATION_ACCOUNT_NOT_FOUND:
        return [
          {
            stepNumber: 1,
            actionType: RecoveryActionType.CREATE_TRUSTLINE_AND_RETRY,
            description: 'Create a trustline/account on the destination network, then re-trigger transfer.',
            canAutoExecute: false,
            payload: {
              destinationAccount: details.destinationAccount,
              assetCode: details.assetCode,
            },
          },
        ];

      case TransferFailureReason.SLIPPAGE_EXCEEDED:
        return [
          {
            stepNumber: 1,
            actionType: RecoveryActionType.RETRY_WITH_SLIPPAGE_ADJUSTMENT,
            description: 'Adjust maximum allowed slippage tolerance and re-execute.',
            canAutoExecute: true,
            payload: {
              suggestedSlippagePercent: 1.0,
            },
          },
        ];

      case TransferFailureReason.TIMEOUT_EXPIRED:
      case TransferFailureReason.NETWORK_CONGESTION:
        return [
          {
            stepNumber: 1,
            actionType: RecoveryActionType.RETRY_WITH_HIGHER_FEE,
            description: 'Retry transfer with updated network sequence number.',
            canAutoExecute: true,
          },
          {
            stepNumber: 2,
            actionType: RecoveryActionType.REFUND_TO_SOURCE,
            description: 'If secondary attempt times out, initiate auto-refund to source account.',
            canAutoExecute: true,
            payload: {
              refundAddress: details.sourceAccount,
            },
          },
        ];

      case TransferFailureReason.CONTRACT_REVERT:
      default:
        return [
          {
            stepNumber: 1,
            actionType: RecoveryActionType.REFUND_TO_SOURCE,
            description: 'Initiate bridge contract state rollback and issue refund.',
            canAutoExecute: true,
            payload: {
              refundAddress: details.sourceAccount,
            },
          },
          {
            stepNumber: 2,
            actionType: RecoveryActionType.MANUAL_INTERVENTION_REQUIRED,
            description: 'Escalate to support team for contract state inspection.',
            canAutoExecute: false,
          },
        ];
    }
  }
}