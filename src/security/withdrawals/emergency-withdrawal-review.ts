/**
 * Emergency withdrawal controls review.
 *
 * An emergency withdrawal path exists to move funds fast when something has
 * gone wrong, which makes it the most dangerous path in the protocol. This
 * review checks a proposed configuration against a policy and reports each
 * deviation as a finding, so a controller can be reasoned about before it can
 * be used.
 */

export enum WithdrawalControlSeverity {
  INFO = 'info',
  MINOR = 'minor',
  MAJOR = 'major',
  CRITICAL = 'critical',
}

export type WithdrawalFindingCode =
  | 'INSUFFICIENT_GUARDIANS'
  | 'INSUFFICIENT_APPROVALS'
  | 'APPROVALS_EXCEED_GUARDIANS'
  | 'TIMELOCK_TOO_SHORT'
  | 'PER_TRANSACTION_CAP_EXCEEDS_POLICY'
  | 'DAILY_CAP_EXCEEDS_POLICY'
  | 'DAILY_CAP_BELOW_TRANSACTION_CAP'
  | 'ALLOWLIST_DISABLED'
  | 'EVENTS_MISSING'
  | 'OWNER_SIGNERS_INSUFFICIENT'
  | 'PAUSE_NOT_INTERLOCKED';

export interface EmergencyWithdrawalConfig {
  /** Number of independent guardians that can approve a withdrawal. */
  guardianCount: number;
  /** Approvals required to release an emergency withdrawal. */
  requiredApprovals: number;
  /** Delay between approval and execution, in seconds. */
  timelockSeconds: number;
  /** Maximum value of a single emergency withdrawal. */
  perTransactionCapUsd: number;
  /** Maximum value of all emergency withdrawals in a rolling day. */
  dailyCapUsd: number;
  /** Whether withdrawals can only be sent to allow-listed recipients. */
  recipientAllowlistEnabled: boolean;
  /** Whether the controller emits an event for every step. */
  eventsEmitted: boolean;
  /** Number of owner multisig signers. */
  ownerSignerCount: number;
  /** Whether the emergency withdrawal can proceed while the contract is paused. */
  pauseInterlockRequired: boolean;
}

export interface EmergencyWithdrawalPolicy {
  minGuardians: number;
  minApprovals: number;
  minTimelockSeconds: number;
  maxPerTransactionCapUsd: number;
  maxDailyCapUsd: number;
  requireAllowlist: boolean;
  requireEvents: boolean;
  minOwnerSigners: number;
  requirePauseInterlock: boolean;
}

export interface WithdrawalFinding {
  code: WithdrawalFindingCode;
  severity: WithdrawalControlSeverity;
  message: string;
}

export interface EmergencyWithdrawalReview {
  approved: boolean;
  findings: WithdrawalFinding[];
  /** Highest severity encountered, or null when the config is fully compliant. */
  highestSeverity: WithdrawalControlSeverity | null;
}

export const DEFAULT_EMERGENCY_WITHDRAWAL_POLICY: EmergencyWithdrawalPolicy = {
  minGuardians: 3,
  minApprovals: 2,
  minTimelockSeconds: 3600,
  maxPerTransactionCapUsd: 1_000_000,
  maxDailyCapUsd: 2_000_000,
  requireAllowlist: true,
  requireEvents: true,
  minOwnerSigners: 2,
  requirePauseInterlock: true,
};

const SEVERITY_ORDER = [
  WithdrawalControlSeverity.INFO,
  WithdrawalControlSeverity.MINOR,
  WithdrawalControlSeverity.MAJOR,
  WithdrawalControlSeverity.CRITICAL,
];

export class EmergencyWithdrawalControlsReview {
  private readonly policy: EmergencyWithdrawalPolicy;

  constructor(policy: Partial<EmergencyWithdrawalPolicy> = {}) {
    this.policy = { ...DEFAULT_EMERGENCY_WITHDRAWAL_POLICY, ...policy };
  }

  getPolicy(): EmergencyWithdrawalPolicy {
    return { ...this.policy };
  }

  review(config: EmergencyWithdrawalConfig): EmergencyWithdrawalReview {
    const findings: WithdrawalFinding[] = [];

    if (config.guardianCount < this.policy.minGuardians) {
      findings.push({
        code: 'INSUFFICIENT_GUARDIANS',
        severity: WithdrawalControlSeverity.CRITICAL,
        message: `Only ${config.guardianCount} guardian(s) configured; policy requires at least ${this.policy.minGuardians}`,
      });
    }

    if (config.requiredApprovals < this.policy.minApprovals) {
      findings.push({
        code: 'INSUFFICIENT_APPROVALS',
        severity: WithdrawalControlSeverity.CRITICAL,
        message: `Only ${config.requiredApprovals} approval(s) required; policy requires at least ${this.policy.minApprovals}`,
      });
    }

    if (config.requiredApprovals > config.guardianCount) {
      findings.push({
        code: 'APPROVALS_EXCEED_GUARDIANS',
        severity: WithdrawalControlSeverity.MAJOR,
        message: `Required approvals (${config.requiredApprovals}) exceed the number of guardians (${config.guardianCount}), making the controller unusable`,
      });
    }

    if (config.timelockSeconds < this.policy.minTimelockSeconds) {
      findings.push({
        code: 'TIMELOCK_TOO_SHORT',
        severity: WithdrawalControlSeverity.MAJOR,
        message: `Timelock of ${config.timelockSeconds}s is below the required ${this.policy.minTimelockSeconds}s`,
      });
    }

    if (config.perTransactionCapUsd > this.policy.maxPerTransactionCapUsd) {
      findings.push({
        code: 'PER_TRANSACTION_CAP_EXCEEDS_POLICY',
        severity: WithdrawalControlSeverity.CRITICAL,
        message: `Per-transaction cap $${config.perTransactionCapUsd} exceeds policy maximum $${this.policy.maxPerTransactionCapUsd}`,
      });
    }

    if (config.dailyCapUsd > this.policy.maxDailyCapUsd) {
      findings.push({
        code: 'DAILY_CAP_EXCEEDS_POLICY',
        severity: WithdrawalControlSeverity.CRITICAL,
        message: `Daily cap $${config.dailyCapUsd} exceeds policy maximum $${this.policy.maxDailyCapUsd}`,
      });
    }

    if (config.dailyCapUsd < config.perTransactionCapUsd) {
      findings.push({
        code: 'DAILY_CAP_BELOW_TRANSACTION_CAP',
        severity: WithdrawalControlSeverity.MINOR,
        message: `Daily cap $${config.dailyCapUsd} is below the per-transaction cap $${config.perTransactionCapUsd}`,
      });
    }

    if (this.policy.requireAllowlist && !config.recipientAllowlistEnabled) {
      findings.push({
        code: 'ALLOWLIST_DISABLED',
        severity: WithdrawalControlSeverity.MAJOR,
        message: 'Recipient allowlist is disabled',
      });
    }

    if (this.policy.requireEvents && !config.eventsEmitted) {
      findings.push({
        code: 'EVENTS_MISSING',
        severity: WithdrawalControlSeverity.MAJOR,
        message: 'Emergency withdrawals do not emit events',
      });
    }

    if (config.ownerSignerCount < this.policy.minOwnerSigners) {
      findings.push({
        code: 'OWNER_SIGNERS_INSUFFICIENT',
        severity: WithdrawalControlSeverity.MAJOR,
        message: `Only ${config.ownerSignerCount} owner signer(s); policy requires at least ${this.policy.minOwnerSigners}`,
      });
    }

    if (this.policy.requirePauseInterlock && !config.pauseInterlockRequired) {
      findings.push({
        code: 'PAUSE_NOT_INTERLOCKED',
        severity: WithdrawalControlSeverity.MINOR,
        message: 'Emergency withdrawal is not interlocked with the pause state',
      });
    }

    const highestSeverity = findings.reduce<WithdrawalControlSeverity | null>(
      (highest, finding) =>
        highest === null || severityRank(finding.severity) > severityRank(highest)
          ? finding.severity
          : highest,
      null,
    );

    return {
      approved: findings.every(
        (finding) =>
          severityRank(finding.severity) <
          severityRank(WithdrawalControlSeverity.MAJOR),
      ),
      findings,
      highestSeverity,
    };
  }
}

export function severityRank(severity: WithdrawalControlSeverity): number {
  return SEVERITY_ORDER.indexOf(severity);
}
