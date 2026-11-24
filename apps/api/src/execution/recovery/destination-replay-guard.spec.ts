import { DestinationReplayGuard } from './destination-replay-guard';

describe('DestinationReplayGuard contract-upgrade handling (#1445)', () => {
  it('denies a replay once the destination contract has been upgraded since the failed attempt', () => {
    const guard = new DestinationReplayGuard();
    guard.recordAttempt('exec-1', 'ethereum', 'payload', 'failed_not_executed', 'v1-impl-hash');

    const afterUpgrade = guard.requestReplay('exec-1', 'ethereum', 'payload', 'v2-impl-hash');
    expect(afterUpgrade).toEqual({ allowed: false, reason: 'contract_upgraded', replaysUsed: 0 });
  });

  it('still allows a replay when the contract version is unchanged', () => {
    const guard = new DestinationReplayGuard();
    guard.recordAttempt('exec-1', 'ethereum', 'payload', 'failed_not_executed', 'v1-impl-hash');

    const decision = guard.requestReplay('exec-1', 'ethereum', 'payload', 'v1-impl-hash');
    expect(decision).toEqual({ allowed: true, reason: 'ok', replaysUsed: 1 });
  });
});
