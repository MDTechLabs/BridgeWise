import { describe, beforeEach, it, expect } from 'vitest';
import { SorobanTransferRecoveryPlannerService } from './soroban-transfer-recovery-planner.service';
import {
  RecoveryActionType,
  TransferFailureReason,
} from './soroban-recovery.types';

describe('SorobanTransferRecoveryPlannerService', () => {
  let planner: SorobanTransferRecoveryPlannerService;

  beforeEach(() => {
    planner = new SorobanTransferRecoveryPlannerService();
  });

  it('should generate an automated fee-bump recovery plan for INSUFFICIENT_FEE', () => {
    const plan = planner.generateRecoveryPlan({
      transferId: 'tx-101',
      sourceAccount: 'GSOURCE123',
      destinationAccount: 'GDEST456',
      assetCode: 'XLM',
      amount: '100',
      failureReason: TransferFailureReason.INSUFFICIENT_FEE,
      txHash: '0xabc123',
    });

    expect(plan.isAutoRecoverable).toBe(true);
    expect(plan.recommendedAction).toBe(RecoveryActionType.RETRY_WITH_HIGHER_FEE);
    expect(plan.steps[0].payload?.recommendedFeeBumpFactor).toBe(1.5);
  });

  it('should generate a trustline creation path for DESTINATION_ACCOUNT_NOT_FOUND', () => {
    const plan = planner.generateRecoveryPlan({
      transferId: 'tx-102',
      sourceAccount: 'GSOURCE123',
      destinationAccount: 'GNEWDEST789',
      assetCode: 'USDC',
      amount: '500',
      failureReason: TransferFailureReason.DESTINATION_ACCOUNT_NOT_FOUND,
    });

    expect(plan.recommendedAction).toBe(RecoveryActionType.CREATE_TRUSTLINE_AND_RETRY);
    expect(plan.steps[0].canAutoExecute).toBe(false);
  });

  it('should recommend refund step for contract reverts', () => {
    const plan = planner.generateRecoveryPlan({
      transferId: 'tx-103',
      sourceAccount: 'GSOURCE123',
      destinationAccount: 'GDEST456',
      assetCode: 'XLM',
      amount: '250',
      failureReason: TransferFailureReason.CONTRACT_REVERT,
    });

    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].actionType).toBe(RecoveryActionType.REFUND_TO_SOURCE);
  });
});