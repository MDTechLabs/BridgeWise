import {
  SorobanTransferRecoveryPlanner,
  classifyFailure,
} from './transfer-recovery-planner';
import { DEFAULT_RECOVERY_PLANNER_CONFIG } from './transfer-recovery-planner.types';
import type { RecoveryAction, TransferFailure } from './transfer-recovery-planner.types';

// ---------------------------------------------------------------------------
// classifyFailure
// ---------------------------------------------------------------------------

describe('classifyFailure', () => {
  it.each([
    ['TIMEOUT', 'TX_TIMEOUT'],
    ['TIMEOUT', 'transfer timed out after 30s'],
    ['INSUFFICIENT_FEE', 'INSUFFICIENT_FEE'],
    ['INSUFFICIENT_FEE', 'txFee too low'],
    ['SEQUENCE_MISMATCH', 'SEQUENCE_MISMATCH'],
    ['SEQUENCE_MISMATCH', 'bad seq'],
    ['ACCOUNT_ERROR', 'ACCOUNT_NOT_FOUND'],
    ['ACCOUNT_ERROR', 'unauthorized signer'],
    ['CONTRACT_ERROR', 'SOROBAN_INVOCATION_FAILED'],
    ['CONTRACT_ERROR', 'trustline missing'],
    ['NETWORK_ERROR', 'connection refused'],
    ['NETWORK_ERROR', 'HTTP 503 Service Unavailable'],
    ['NETWORK_ERROR', 'rate limit exceeded'],
    ['UNKNOWN', 'something completely unrelated'],
  ])('classifies %s from reason %s', (expected, reason) => {
    expect(classifyFailure(reason)).toBe(expected);
  });

  it('returns UNKNOWN for empty input', () => {
    expect(classifyFailure('')).toBe('UNKNOWN');
  });
});

// ---------------------------------------------------------------------------
// SorobanTransferRecoveryPlanner.plan
// ---------------------------------------------------------------------------

describe('SorobanTransferRecoveryPlanner.plan', () => {
  const planner = new SorobanTransferRecoveryPlanner();

  function failure(reason: string, previousAttempts = 0): TransferFailure {
    return {
      transferHash: 'tx-1',
      sourceChain: 'stellar',
      destinationChain: 'ethereum',
      reason,
      baseFeeStroops: 100,
      previousAttempts,
    };
  }

  it('returns a timeout retry plan with backoff', () => {
    const plan = planner.plan(failure('TX_TIMEOUT'));
    expect(plan.scenario).toBe('TIMEOUT');
    expect(plan.severity).toBe('medium');
    expect(plan.automatable).toBe(true);
    expect(plan.actions).toHaveLength(DEFAULT_RECOVERY_PLANNER_CONFIG.maxRetries);
    expect(plan.actions[0]).toMatchObject({ type: 'retry', attempt: 1 });
  });

  it('reduces retries when previous attempts consumed the budget', () => {
    const plan = planner.plan(failure('TX_TIMEOUT', 3));
    expect(plan.actions).toHaveLength(0);
    // No retries left → manual review.
    expect(plan.actions[plan.actions.length - 1]?.type).toBe('manual_review');
  });

  it('produces a fee-bump plan for INSUFFICIENT_FEE', () => {
    const plan = planner.plan(failure('INSUFFICIENT_FEE'));
    expect(plan.scenario).toBe('INSUFFICIENT_FEE');
    expect(plan.actions[0].type).toBe('increase_fee');
    if (plan.actions[0].type === 'increase_fee') {
      expect(plan.actions[0].newBaseFeeStroops).toBe(
        100 + DEFAULT_RECOVERY_PLANNER_CONFIG.feeBumpStroops,
      );
    }
    expect(plan.actions.slice(1).every((a) => a.type === 'retry')).toBe(true);
  });

  it('escalates ACCOUNT_ERROR to manual review', () => {
    const plan = planner.plan(failure('ACCOUNT_NOT_FOUND'));
    expect(plan.scenario).toBe('ACCOUNT_ERROR');
    expect(plan.automatable).toBe(false);
    expect(plan.actions[0].type).toBe('manual_review');
  });

  it('escalates CONTRACT_ERROR to manual review', () => {
    const plan = planner.plan(failure('SOROBAN_INVOCATION_FAILED'));
    expect(plan.scenario).toBe('CONTRACT_ERROR');
    expect(plan.automatable).toBe(false);
  });

  it('produces a resubmit plan for SEQUENCE_MISMATCH', () => {
    const plan = planner.plan(failure('SEQUENCE_MISMATCH'));
    expect(plan.scenario).toBe('SEQUENCE_MISMATCH');
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toMatchObject({ type: 'resubmit' });
  });

  it('uses exponential backoff capped at maxDelayMs', () => {
    const custom = new SorobanTransferRecoveryPlanner({
      maxRetries: 5,
      initialDelayMs: 100,
      backoffMultiplier: 10,
      maxDelayMs: 5_000,
    });
    const plan = custom.plan(failure('TX_TIMEOUT'));
    const delays = (plan.actions as RecoveryAction[])
      .filter((a): a is Extract<RecoveryAction, { type: 'retry' }> => a.type === 'retry')
      .map((a) => a.delayMs);
    expect(delays).toEqual([100, 1_000, 5_000, 5_000, 5_000]);
  });
});

// ---------------------------------------------------------------------------
// SorobanTransferRecoveryPlanner.automate
// ---------------------------------------------------------------------------

describe('SorobanTransferRecoveryPlanner.automate', () => {
  const planner = new SorobanTransferRecoveryPlanner({ maxRetries: 2 });
  const failure: TransferFailure = {
    transferHash: 'tx-1',
    sourceChain: 'stellar',
    destinationChain: 'ethereum',
    reason: 'TX_TIMEOUT',
  };

  it('runs the plan and reports success when executor succeeds', async () => {
    const executor = jest.fn().mockResolvedValue('recovery-tx');
    const result = await planner.automate(failure, executor);

    expect(result.recovered).toBe(true);
    expect(result.requiresHumanReview).toBe(false);
    expect(result.steps).toHaveLength(2);
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('stops at the first executor error and reports recovered=false', async () => {
    const executor = jest.fn().mockRejectedValue(new Error('bridge offline'));
    const result = await planner.automate(failure, executor);

    expect(result.recovered).toBe(false);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].success).toBe(false);
    expect(result.steps[0].error).toBe('bridge offline');
  });

  it('halts at manual_review and marks requiresHumanReview=true', async () => {
    const manualPlanner = new SorobanTransferRecoveryPlanner();
    const accountFailure: TransferFailure = { ...failure, reason: 'ACCOUNT_NOT_FOUND' };
    const executor = jest.fn().mockResolvedValue('ok');
    const result = await manualPlanner.automate(accountFailure, executor);

    expect(result.requiresHumanReview).toBe(true);
    expect(result.recovered).toBe(false);
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it('respects maxSteps and marks truncated when capped', async () => {
    const executor = jest.fn().mockResolvedValue('recovery-tx');
    const result = await planner.automate(failure, executor, 1);

    expect(result.steps).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });
});
