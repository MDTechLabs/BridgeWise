import {
  DEFAULT_EMERGENCY_WITHDRAWAL_POLICY,
  EmergencyWithdrawalConfig,
  EmergencyWithdrawalControlsReview,
  WithdrawalControlSeverity,
} from './emergency-withdrawal-review';

function compliantConfig(
  overrides: Partial<EmergencyWithdrawalConfig> = {},
): EmergencyWithdrawalConfig {
  return {
    guardianCount: 4,
    requiredApprovals: 2,
    timelockSeconds: 7200,
    perTransactionCapUsd: 500_000,
    dailyCapUsd: 1_000_000,
    recipientAllowlistEnabled: true,
    eventsEmitted: true,
    ownerSignerCount: 3,
    pauseInterlockRequired: true,
    ...overrides,
  };
}

describe('EmergencyWithdrawalControlsReview', () => {
  const review = new EmergencyWithdrawalControlsReview();

  it('approves a fully compliant configuration', () => {
    const result = review.review(compliantConfig());

    expect(result.approved).toBe(true);
    expect(result.findings).toHaveLength(0);
    expect(result.highestSeverity).toBeNull();
  });

  it('flags too few guardians as critical', () => {
    const result = review.review(compliantConfig({ guardianCount: 1 }));

    expect(result.approved).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain('INSUFFICIENT_GUARDIANS');
    expect(result.highestSeverity).toBe(WithdrawalControlSeverity.CRITICAL);
  });

  it('flags too few required approvals as critical', () => {
    const result = review.review(compliantConfig({ requiredApprovals: 1 }));

    expect(result.approved).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain('INSUFFICIENT_APPROVALS');
  });

  it('flags a controller that requires more approvals than guardians', () => {
    const result = review.review(compliantConfig({ requiredApprovals: 9 }));

    expect(result.findings.map((f) => f.code)).toContain(
      'APPROVALS_EXCEED_GUARDIANS',
    );
  });

  it('flags a timelock below the policy minimum', () => {
    const result = review.review(compliantConfig({ timelockSeconds: 60 }));

    expect(result.approved).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain('TIMELOCK_TOO_SHORT');
  });

  it('flags caps that exceed the policy maximum', () => {
    const result = review.review(
      compliantConfig({
        perTransactionCapUsd: 5_000_000,
        dailyCapUsd: 9_000_000,
      }),
    );

    const codes = result.findings.map((f) => f.code);
    expect(codes).toContain('PER_TRANSACTION_CAP_EXCEEDS_POLICY');
    expect(codes).toContain('DAILY_CAP_EXCEEDS_POLICY');
  });

  it('flags a disabled allowlist and missing events as major', () => {
    const result = review.review(
      compliantConfig({ recipientAllowlistEnabled: false, eventsEmitted: false }),
    );

    const codes = result.findings.map((f) => f.code);
    expect(codes).toContain('ALLOWLIST_DISABLED');
    expect(codes).toContain('EVENTS_MISSING');
    expect(result.approved).toBe(false);
  });

  it('flags too few owner signers', () => {
    const result = review.review(compliantConfig({ ownerSignerCount: 1 }));

    expect(result.findings.map((f) => f.code)).toContain(
      'OWNER_SIGNERS_INSUFFICIENT',
    );
  });

  it('still approves a configuration with only minor findings', () => {
    const result = review.review(
      compliantConfig({ pauseInterlockRequired: false, dailyCapUsd: 400_000 }),
    );

    expect(result.approved).toBe(true);
    expect(result.highestSeverity).toBe(WithdrawalControlSeverity.MINOR);
    expect(result.findings.map((f) => f.code)).toEqual(
      expect.arrayContaining([
        'DAILY_CAP_BELOW_TRANSACTION_CAP',
        'PAUSE_NOT_INTERLOCKED',
      ]),
    );
  });

  it('honours a caller-supplied policy', () => {
    const strict = new EmergencyWithdrawalControlsReview({
      minGuardians: 5,
      minTimelockSeconds: 86_400,
    });

    expect(strict.getPolicy().minGuardians).toBe(5);
    expect(strict.review(compliantConfig()).approved).toBe(false);
    expect(
      strict.getPolicy().maxDailyCapUsd,
    ).toBe(DEFAULT_EMERGENCY_WITHDRAWAL_POLICY.maxDailyCapUsd);
  });
});
