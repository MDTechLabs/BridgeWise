import { ChallengeMonitor, ChallengeAlert, ChallengeExpiredEvent, StateRootAssertion } from './challenge-monitor';

const baseAssertion: StateRootAssertion = {
  chainId: 42161,
  assertionId: 'assertion-1',
  proposer: '0xproposer',
  claimedStateRoot: '0xclaimed',
  submittedAtBlock: 1000,
  submittedAtTimestamp: 1_000_000,
  challengeWindowSeconds: 1000,
};

describe('ChallengeMonitor', () => {
  it('emits validated and does not track an assertion whose claimed root matches canonical state', async () => {
    const monitor = new ChallengeMonitor({
      resolveCanonicalStateRoot: async () => '0xclaimed',
      now: () => 1_000_000,
    });

    const validated = jest.fn();
    monitor.on('validated', validated);

    await monitor.trackAssertion(baseAssertion);

    expect(validated).toHaveBeenCalledWith(baseAssertion);
    expect(monitor.pendingCount).toBe(0);
  });

  it('detects a mismatched root and tracks the assertion', async () => {
    const monitor = new ChallengeMonitor({
      resolveCanonicalStateRoot: async () => '0xcanonical',
      now: () => 1_000_000,
    });

    const detected = jest.fn();
    monitor.on('invalidAssertionDetected', detected);

    await monitor.trackAssertion(baseAssertion);

    expect(detected).toHaveBeenCalledWith(baseAssertion, '0xcanonical');
    expect(monitor.pendingCount).toBe(1);
  });

  it('does not alert while more than the threshold fraction of the window remains', async () => {
    let now = 1_000_000;
    const monitor = new ChallengeMonitor({
      resolveCanonicalStateRoot: async () => '0xcanonical',
      now: () => now,
      alertRemainingFraction: 0.2,
    });

    const alert = jest.fn();
    monitor.on('alert', alert);

    await monitor.trackAssertion(baseAssertion);

    // Window is 1000s; advance 500s (50% remaining) — above the 20% threshold.
    now += 500;
    monitor.checkPendingAssertions();

    expect(alert).not.toHaveBeenCalled();
  });

  it('fires an alert with exact remaining time once <=20% of the window remains', async () => {
    let now = 1_000_000;
    const monitor = new ChallengeMonitor({
      resolveCanonicalStateRoot: async () => '0xcanonical',
      now: () => now,
      alertRemainingFraction: 0.2,
      averageBlockTimeSeconds: 10,
    });

    const alerts: ChallengeAlert[] = [];
    monitor.on('alert', (alert) => alerts.push(alert));

    await monitor.trackAssertion(baseAssertion);

    // Window is 1000s starting at submittedAtTimestamp=1_000_000, so it
    // expires at 1_001_000. Advance to 1_000_850 -> 150s (15%) remaining.
    now = 1_000_850;
    monitor.checkPendingAssertions();

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      assertionId: 'assertion-1',
      remainingSeconds: 150,
      remainingBlocks: 15,
      windowExpiresAtTimestamp: 1_001_000,
    });
    expect(alerts[0].remainingFraction).toBeCloseTo(0.15, 5);
  });

  it('only fires one alert per assertion even if checked repeatedly while still in range', async () => {
    let now = 1_000_850;
    const monitor = new ChallengeMonitor({
      resolveCanonicalStateRoot: async () => '0xcanonical',
      now: () => now,
    });

    const alert = jest.fn();
    monitor.on('alert', alert);

    await monitor.trackAssertion(baseAssertion);
    monitor.checkPendingAssertions();
    monitor.checkPendingAssertions();

    expect(alert).toHaveBeenCalledTimes(1);
  });

  it('emits expired and stops tracking once the window fully closes', async () => {
    let now = 1_000_000;
    const monitor = new ChallengeMonitor({
      resolveCanonicalStateRoot: async () => '0xcanonical',
      now: () => now,
    });

    const expired = jest.fn<void, [ChallengeExpiredEvent]>();
    monitor.on('expired', expired);

    await monitor.trackAssertion(baseAssertion);
    expect(monitor.pendingCount).toBe(1);

    now = 1_001_001; // 1s past window close
    monitor.checkPendingAssertions();

    expect(expired).toHaveBeenCalledTimes(1);
    expect(expired.mock.calls[0][0]).toMatchObject({
      assertionId: 'assertion-1',
      canonicalStateRoot: '0xcanonical',
    });
    expect(monitor.pendingCount).toBe(0);
  });

  it('stops watching an assertion once untrackAssertion is called', async () => {
    let now = 1_000_000;
    const monitor = new ChallengeMonitor({
      resolveCanonicalStateRoot: async () => '0xcanonical',
      now: () => now,
    });

    await monitor.trackAssertion(baseAssertion);
    expect(monitor.pendingCount).toBe(1);

    monitor.untrackAssertion(baseAssertion.assertionId);
    expect(monitor.pendingCount).toBe(0);

    const alert = jest.fn();
    monitor.on('alert', alert);
    now = 1_000_950;
    monitor.checkPendingAssertions();

    expect(alert).not.toHaveBeenCalled();
  });
});
