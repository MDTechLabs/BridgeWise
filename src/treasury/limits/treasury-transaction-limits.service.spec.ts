/**
 * File: src/treasury/limits/treasury-transaction-limits.service.spec.ts
 *
 * Unit tests for the treasury transaction limits service.
 */

import { TreasuryTransactionLimitsService } from './treasury-transaction-limits.service';
import type { TreasuryLimitsConfig } from './treasury-transaction-limits.types';

const T0 = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

function makeService(overrides: Partial<TreasuryLimitsConfig> = {}) {
  return new TreasuryTransactionLimitsService({
    now: () => T0,
    policies: [
      {
        asset: 'USDC',
        minPerTransaction: '1',
        maxPerTransaction: '1000',
        maxPerWindow: '2000',
        maxCountPerWindow: 3,
        windowMs: 24 * HOUR,
      },
    ],
    ...overrides,
  });
}

describe('TreasuryTransactionLimitsService', () => {
  it('allows a transaction within every limit', () => {
    const service = makeService();
    const result = service.check({ asset: 'USDC', amount: '500' });

    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.remainingWindowAmount).toBe('1500');
    expect(result.remainingWindowCount).toBe(2);
    expect(result.checkedAt).toBe(T0);
  });

  it('denies an asset with no policy by default (secure default)', () => {
    const service = makeService();
    const result = service.check({ asset: 'PEPE', amount: '1' });

    expect(result.allowed).toBe(false);
    expect(result.violations[0].code).toBe('ASSET_NOT_ALLOWED');
  });

  it('allows unlisted assets when denyUnlistedAssets is false', () => {
    const service = makeService({ denyUnlistedAssets: false });
    const result = service.check({ asset: 'PEPE', amount: '1' });

    expect(result.allowed).toBe(true);
  });

  it('rejects a malformed amount', () => {
    const service = makeService();
    const result = service.check({ asset: 'USDC', amount: 'abc' });

    expect(result.allowed).toBe(false);
    expect(result.violations[0].code).toBe('INVALID_AMOUNT');
  });

  it('enforces per-transaction min and max, inclusive at the boundary', () => {
    const service = makeService();

    expect(service.check({ asset: 'USDC', amount: '1000' }).allowed).toBe(true); // == max
    expect(service.check({ asset: 'USDC', amount: '1' }).allowed).toBe(true); // == min

    const tooBig = service.check({ asset: 'USDC', amount: '1000.01' });
    expect(tooBig.violations[0].code).toBe('EXCEEDS_MAX_PER_TRANSACTION');

    const tooSmall = service.check({ asset: 'USDC', amount: '0.5' });
    expect(tooSmall.violations[0].code).toBe('BELOW_MIN_PER_TRANSACTION');
  });

  it('accumulates window usage and denies once the amount cap is exceeded', () => {
    const service = makeService();

    expect(service.apply({ asset: 'USDC', amount: '800' }).allowed).toBe(true);
    expect(service.apply({ asset: 'USDC', amount: '800' }).allowed).toBe(true);

    // used 1600; a 400 tx lands exactly on the 2000 cap → allowed (boundary).
    const onCap = service.check({ asset: 'USDC', amount: '400' });
    expect(onCap.allowed).toBe(true);
    expect(onCap.remainingWindowAmount).toBe('0');

    // used 1600; a 401 tx would total 2001 → denied.
    const overCap = service.check({ asset: 'USDC', amount: '401' });
    expect(overCap.allowed).toBe(false);
    expect(overCap.violations[0].code).toBe('EXCEEDS_WINDOW_AMOUNT');
  });

  it('denies once the window transaction count is exceeded', () => {
    const service = makeService();

    expect(service.apply({ asset: 'USDC', amount: '10' }).allowed).toBe(true);
    expect(service.apply({ asset: 'USDC', amount: '10' }).allowed).toBe(true);
    expect(service.apply({ asset: 'USDC', amount: '10' }).allowed).toBe(true);

    const fourth = service.apply({ asset: 'USDC', amount: '10' });
    expect(fourth.allowed).toBe(false);
    expect(fourth.violations[0].code).toBe('EXCEEDS_WINDOW_COUNT');
  });

  it('only records a transaction when it is allowed', () => {
    const service = makeService();

    service.apply({ asset: 'USDC', amount: '5000' }); // denied (over per-tx max)
    expect(service.getUsage('USDC', T0).usedCount).toBe(0);

    service.apply({ asset: 'USDC', amount: '500' }); // allowed
    expect(service.getUsage('USDC', T0).usedCount).toBe(1);
    expect(service.getUsage('USDC', T0).usedAmount).toBe('500');
  });

  it('prunes transactions that fall outside the rolling window', () => {
    const service = makeService();

    service.record({ asset: 'USDC', amount: '900', timestamp: T0 });
    // 25h later the earlier tx is outside the 24h window.
    const later = T0 + 25 * HOUR;
    const result = service.check({ asset: 'USDC', amount: '900', timestamp: later });

    expect(result.allowed).toBe(true);
    expect(service.getUsage('USDC', later).usedCount).toBe(0);
  });

  it('normalizes asset symbols case-insensitively', () => {
    const service = makeService();
    service.apply({ asset: 'usdc', amount: '100' });
    expect(service.getUsage('USDC', T0).usedAmount).toBe('100');
  });
});
