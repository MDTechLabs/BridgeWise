import {
  SorobanTransferRecoveryPlanner,
  classifyFailure,
} from '../../transfers/stellar/transfer-recovery-planner';
import type {
  RecoveryPlan,
  RecoveryExecutor,
  TransferFailure,
  AutomationResult,
} from '../../transfers/stellar/transfer-recovery-planner.types';

export class StellarExecutionRecoveryPolicy {
  private readonly planner = new SorobanTransferRecoveryPlanner();

  classify(reason: string): ReturnType<typeof classifyFailure> {
    return classifyFailure(reason);
  }

  assess(failure: TransferFailure): RecoveryPlan {
    return this.planner.plan(failure);
  }

  automate(
    failure: TransferFailure,
    executor: RecoveryExecutor,
    maxSteps?: number,
  ): Promise<AutomationResult> {
    return this.planner.automate(failure, executor, maxSteps);
  }
}
