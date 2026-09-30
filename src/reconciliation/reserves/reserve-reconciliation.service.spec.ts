/**
 * File: src/reconciliation/reserves/reserve-reconciliation.service.spec.ts
 *
 * Unit tests for the reserve reconciliation service.
 */

import {
  ReserveReconciliationError,
  ReserveReconciliationService,
} from './reserve-reconciliation.service';

const FIXED_NOW = 1_700_000_000_000;
const now = () => FIXED_NOW;

describe('ReserveReconciliationService', () => {
  it('reports every asset balanced on an exact match', () => {
    const service = new ReserveReconciliationService({ now });
    const report = service.reconcile({
      reported: [
        { asset: 'USDC', amount: '1000' },
        { asset: 'XLM', amount: '5000.5' },
      ],
      expected: [
        { asset: 'USDC', amount: '1000' },
        { asset: 'XLM', amount: '5000.5' },
      ],
    });

    expect(report.balanced).toBe(true);
    expect(report.shortfalls).toEqual([]);
    expect(report.summary).toMatchObject({ total: 2, balanced: 2, shortfall: 0 });
    expect(report.reconciledAt).toBe(FIXED_NOW);
    expect(service.isReconciled(report)).toBe(true);
  });

  it('sums multiple reported accounts for the same asset (case-insensitive)', () => {
    const service = new ReserveReconciliationService({ now });
    const report = service.reconcile({
      reported: [
        { asset: 'usdc', amount: '600', account: 'custodian-a' },
        { asset: 'USDC', amount: '400', account: 'custodian-b' },
      ],
      expected: [{ asset: 'USDC', amount: '1000' }],
    });

    expect(report.assets).toHaveLength(1);
    expect(report.assets[0]).toMatchObject({
      asset: 'USDC',
      reported: '1000',
      expected: '1000',
      status: 'BALANCED',
    });
  });

  it('flags a shortfall when reported reserves fall below expected', () => {
    const service = new ReserveReconciliationService({ now });
    const report = service.reconcile({
      reported: [{ asset: 'USDC', amount: '900' }],
      expected: [{ asset: 'USDC', amount: '1000' }],
    });

    expect(report.balanced).toBe(false);
    expect(report.shortfalls).toHaveLength(1);
    expect(report.assets[0]).toMatchObject({
      status: 'SHORTFALL',
      difference: '-100',
      withinTolerance: false,
    });
    expect(report.assets[0].relativeDifference).toBeCloseTo(0.1);
  });

  it('flags a surplus when reported reserves exceed expected', () => {
    const service = new ReserveReconciliationService({ now });
    const report = service.reconcile({
      reported: [{ asset: 'USDC', amount: '1050' }],
      expected: [{ asset: 'USDC', amount: '1000' }],
    });

    expect(report.assets[0]).toMatchObject({ status: 'SURPLUS', difference: '50' });
    expect(report.shortfalls).toEqual([]);
  });

  it('treats a difference within absolute tolerance as balanced (boundary)', () => {
    const service = new ReserveReconciliationService({ now });
    const report = service.reconcile({
      reported: [{ asset: 'USDC', amount: '995' }],
      expected: [{ asset: 'USDC', amount: '1000' }],
      tolerance: { absolute: '5' },
    });

    expect(report.assets[0].status).toBe('BALANCED');
    expect(report.assets[0].withinTolerance).toBe(true);
  });

  it('applies a relative (bps) tolerance band', () => {
    const service = new ReserveReconciliationService({ now });

    const within = service.reconcile({
      reported: [{ asset: 'USDC', amount: '991' }],
      expected: [{ asset: 'USDC', amount: '1000' }],
      tolerance: { relativeBps: 100 }, // 1% of 1000 = 10
    });
    expect(within.assets[0].status).toBe('BALANCED');

    const outside = service.reconcile({
      reported: [{ asset: 'USDC', amount: '985' }],
      expected: [{ asset: 'USDC', amount: '1000' }],
      tolerance: { relativeBps: 100 },
    });
    expect(outside.assets[0].status).toBe('SHORTFALL');
  });

  it('marks assets missing on either side', () => {
    const service = new ReserveReconciliationService({ now });
    const report = service.reconcile({
      reported: [{ asset: 'XLM', amount: '10' }],
      expected: [{ asset: 'BTC', amount: '2' }],
    });

    const byAsset = Object.fromEntries(report.assets.map((a) => [a.asset, a.status]));
    expect(byAsset).toMatchObject({ BTC: 'MISSING_REPORTED', XLM: 'MISSING_EXPECTED' });
    expect(report.balanced).toBe(false);
    expect(report.summary.missing).toBe(2);
  });

  it('fails closed on malformed amounts (INVALID_DATA)', () => {
    const service = new ReserveReconciliationService({ now });
    const report = service.reconcile({
      reported: [{ asset: 'USDC', amount: 'not-a-number' }],
      expected: [{ asset: 'USDC', amount: '1000' }],
    });

    expect(report.assets[0].status).toBe('INVALID_DATA');
    expect(report.assets[0].withinTolerance).toBe(false);
    expect(report.balanced).toBe(false);
  });

  it('assertReconciled throws with the report attached on a shortfall', () => {
    const service = new ReserveReconciliationService({ now });
    const input = {
      reported: [{ asset: 'USDC', amount: '900' }],
      expected: [{ asset: 'USDC', amount: '1000' }],
    };

    expect(() => service.assertReconciled(input)).toThrow(ReserveReconciliationError);
    try {
      service.assertReconciled(input);
    } catch (err) {
      expect(err).toBeInstanceOf(ReserveReconciliationError);
      expect((err as ReserveReconciliationError).report.shortfalls).toHaveLength(1);
    }
  });

  it('assertReconciled returns the report when everything balances', () => {
    const service = new ReserveReconciliationService({ now });
    const report = service.assertReconciled({
      reported: [{ asset: 'USDC', amount: '1000' }],
      expected: [{ asset: 'USDC', amount: '1000' }],
    });
    expect(report.balanced).toBe(true);
  });
});
