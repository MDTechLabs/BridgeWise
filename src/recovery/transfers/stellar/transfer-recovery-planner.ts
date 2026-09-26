import {
  AutomationResult,
  AutomationStepResult,
  DEFAULT_RECOVERY_PLANNER_CONFIG,
  RECOVERY_SCENARIOS,
  RecoveryAction,
  RecoveryExecutor,
  RecoveryPlan,
  RecoveryPlannerConfig,
  RecoveryScenario,
  RecoverySeverity,
  TransferFailure,
} from './transfer-recovery-planner.types';

/**
 * Classify a failure reason into a high-level {@link RecoveryScenario}.
 *
 * The matcher is case-insensitive and tolerates free-form error messages by
 * scanning for canonical tokens (codes, substrings, regex patterns).
 */
export function classifyFailure(reason: string): RecoveryScenario {
  const upper = (reason ?? '').toUpperCase();

  if (/TIMEOUT|TIMED\s*OUT|TOOK\s*TOO\s*LONG/i.test(upper)) {
    return 'TIMEOUT';
  }
  if (/INSUFFICIENT_FEE|FEE_TOO_LOW|UNDERFUNDED_FEE|INSUFFICIENT_FUNDS/i.test(upper)) {
    return 'INSUFFICIENT_FEE';
  }
  if (/SEQUENCE_MISMATCH|BAD_SEQ|SEQNUM/i.test(upper)) {
    return 'SEQUENCE_MISMATCH';
  }
  if (/ACCOUNT|NOT_FOUND|UNAUTHORIZED|FORBIDDEN|AUTH/i.test(upper)) {
    return 'ACCOUNT_ERROR';
  }
  if (/CONTRACT|SOROBAN|INVOCATION|HOST_FUNCTION|TRUSTLINE/i.test(upper)) {
    return 'CONTRACT_ERROR';
  }
  if (/NETWORK|UNREACHABLE|REFUSED|503|429|RATE_LIMIT/i.test(upper)) {
    return 'NETWORK_ERROR';
  }
  return 'UNKNOWN';
}

/** Default severity assigned to each scenario. */
const SCENARIO_SEVERITY: Record<RecoveryScenario, RecoverySeverity> = {
  TIMEOUT: 'medium',
  INSUFFICIENT_FEE: 'low',
  SEQUENCE_MISMATCH: 'low',
  ACCOUNT_ERROR: 'high',
  CONTRACT_ERROR: 'high',
  NETWORK_ERROR: 'medium',
  UNKNOWN: 'critical',
};

/**
 * Soroban Transfer Recovery Planner (#619).
 *
 * Given a {@link TransferFailure}, produces a deterministic
 * {@link RecoveryPlan} with a classified scenario and an ordered list of
 * {@link RecoveryAction} steps. Optionally executes the plan via a
 * user-supplied {@link RecoveryExecutor} with bounded retries.
 *
 * Example:
 *   const planner = new SorobanTransferRecoveryPlanner();
 *   const plan = planner.plan({
 *     transferHash: 'abc',
 *     sourceChain: 'stellar',
 *     destinationChain: 'ethereum',
 *     reason: 'TX_TIMEOUT after 5s',
 *   });
 */
export class SorobanTransferRecoveryPlanner {
  private readonly config: Required<RecoveryPlannerConfig>;

  constructor(config: RecoveryPlannerConfig = {}) {
    this.config = { ...DEFAULT_RECOVERY_PLANNER_CONFIG, ...config };
  }

  /**
   * Generate a recovery plan for a single failure.
   */
  plan(failure: TransferFailure): RecoveryPlan {
    const scenario = classifyFailure(failure.reason);
    const severity = SCENARIO_SEVERITY[scenario];
    const { actions, rationale, automatable } = this.buildActions(scenario, failure);

    return {
      transferHash: failure.transferHash,
      scenario,
      severity,
      rationale,
      actions,
      automatable,
      generatedAt: Date.now(),
    };
  }

  /**
   * Plan + execute. Stops at the first `manual_review` or non-retryable
   * failure. Returns a structured {@link AutomationResult}.
   *
   * @param failure     The failure to recover from.
   * @param executor    Function that performs the bridge action.
   * @param maxSteps    Optional cap on automation steps (defaults to total plan length).
   */
  async automate(
    failure: TransferFailure,
    executor: RecoveryExecutor,
    maxSteps: number = Number.MAX_SAFE_INTEGER,
  ): Promise<AutomationResult> {
    const plan = this.plan(failure);
    const steps: AutomationStepResult[] = [];
    const limit = Math.min(maxSteps, plan.actions.length);
    const truncated = maxSteps < plan.actions.length;

    for (let i = 0; i < limit; i++) {
      const action = plan.actions[i];
      try {
        await executor(action, failure);
        steps.push({ action, attempted: true, success: true });
        if (action.type === 'cancel' || action.type === 'manual_review') {
          return {
            plan,
            steps,
            recovered: action.type === 'cancel',
            requiresHumanReview: action.type === 'manual_review',
            truncated: truncated && i === limit - 1,
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        steps.push({ action, attempted: true, success: false, error: message });
        return {
          plan,
          steps,
          recovered: false,
          requiresHumanReview: false,
          truncated: truncated && i === limit - 1,
        };
      }
    }

    return {
      plan,
      steps,
      recovered: steps.length > 0 && steps.every((s) => s.success),
      requiresHumanReview: false,
      truncated: truncated && limit === plan.actions.length,
    };
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private buildActions(
    scenario: RecoveryScenario,
    failure: TransferFailure,
  ): { actions: RecoveryAction[]; rationale: string; automatable: boolean } {
    switch (scenario) {
      case 'TIMEOUT':
        return {
          rationale: 'Transfer timed out — retry with exponential backoff.',
          automatable: true,
          actions: this.retrySequence(failure.previousAttempts ?? 0),
        };
      case 'NETWORK_ERROR':
        return {
          rationale: 'Network-level failure detected — retry after a short backoff.',
          automatable: true,
          actions: this.retrySequence(failure.previousAttempts ?? 0),
        };
      case 'SEQUENCE_MISMATCH':
        return {
          rationale: 'Account sequence mismatch — resubmit to refresh ledger state.',
          automatable: true,
          actions: [
            { type: 'resubmit', delayMs: this.config.initialDelayMs },
          ],
        };
      case 'INSUFFICIENT_FEE':
        return {
          rationale: 'Fee too low — bump the base fee and retry.',
          automatable: true,
          actions: [
            this.feeBumpAction(failure.baseFeeStroops),
            ...this.retrySequence(failure.previousAttempts ?? 0),
          ],
        };
      case 'ACCOUNT_ERROR':
        return {
          rationale:
            'Account-level error detected (auth, missing account, etc.). Operator input required.',
          automatable: false,
          actions: [
            { type: 'manual_review', reason: 'Account-level failure requires operator review.' },
          ],
        };
      case 'CONTRACT_ERROR':
        return {
          rationale:
            'Contract / Soroban invocation failed. Likely deterministic — retry unlikely to help.',
          automatable: false,
          actions: [
            { type: 'manual_review', reason: 'Contract execution failed; needs investigation.' },
          ],
        };
      case 'UNKNOWN':
      default:
        return {
          rationale: 'Failure reason not recognized — escalating to manual review.',
          automatable: false,
          actions: [
            { type: 'manual_review', reason: 'Unclassified failure requires operator review.' },
          ],
        };
    }
  }

  private retrySequence(previousAttempts: number): RecoveryAction[] {
    const remaining = Math.max(0, this.config.maxRetries - previousAttempts);
    const actions: RecoveryAction[] = [];
    let delay = this.config.initialDelayMs;
    for (let i = 1; i <= remaining; i++) {
      actions.push({ type: 'retry', attempt: previousAttempts + i, delayMs: delay });
      delay = Math.min(delay * this.config.backoffMultiplier, this.config.maxDelayMs);
    }
    if (actions.length === 0) {
      actions.push({ type: 'manual_review', reason: 'No retries remaining.' });
    }
    return actions;
  }

  private feeBumpAction(currentBaseFeeStroops?: number): RecoveryAction {
    const base = currentBaseFeeStroops ?? this.config.defaultBaseFeeStroops;
    return {
      type: 'increase_fee',
      extraStroops: this.config.feeBumpStroops,
      newBaseFeeStroops: base + this.config.feeBumpStroops,
    };
  }
}

// Re-export the public surface for convenient imports.
export { RECOVERY_SCENARIOS };
export type {
  AutomationResult,
  AutomationStepResult,
  RecoveryAction,
  RecoveryExecutor,
  RecoveryPlan,
  RecoveryPlannerConfig,
  RecoveryScenario,
  RecoverySeverity,
  TransferFailure,
};
