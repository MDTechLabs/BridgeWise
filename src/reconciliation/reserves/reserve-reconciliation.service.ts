/**
 * File: src/reconciliation/reserves/reserve-reconciliation.service.ts
 *
 * Reserve reconciliation service.
 *
 * Compares reported reserves (on-chain / custodian balances) against expected
 * reserves (book / accounting balances) per asset and produces a report that
 * flags surpluses and — more importantly — shortfalls, i.e. cases where the
 * bridge/treasury holds less than it is supposed to.
 *
 * Design goals mirror the route decision engine:
 *   - Pure and dependency-free so it is trivial to unit test.
 *   - Precision-safe decimal arithmetic (no floating-point drift).
 *   - Secure defaults: exact-match tolerance surfaces every discrepancy, and
 *     malformed inputs fail closed as INVALID_DATA rather than being ignored.
 */

import {
  absAmount,
  addAmounts,
  compareAmounts,
  isValidNonNegativeAmount,
  ratio,
  subtractAmounts,
} from './decimal';
import type {
  AssetReconciliation,
  ExpectedReserve,
  ReserveBalance,
  ReserveReconciliationInput,
  ReserveReconciliationReport,
  ReserveTolerance,
} from './reserve-reconciliation.types';

const DEFAULT_TOLERANCE: Required<ReserveTolerance> = {
  absolute: '0',
  relativeBps: 0,
};

export class ReserveReconciliationService {
  private readonly defaultTolerance: Required<ReserveTolerance>;
  private readonly now: () => number;

  constructor(
    options: {
      defaultTolerance?: ReserveTolerance;
      now?: () => number;
    } = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.defaultTolerance = this.mergeTolerance(options.defaultTolerance);
  }

  /** Reconcile reported reserves against expected reserves. */
  reconcile(input: ReserveReconciliationInput): ReserveReconciliationReport {
    const tolerance = this.mergeTolerance(input.tolerance);

    const reported = this.aggregate(input.reported ?? [], (r) => r.asset, (r) => r.amount);
    const expected = this.aggregate(input.expected ?? [], (e) => e.asset, (e) => e.amount);

    const assetKeys = this.orderedAssetKeys(reported, expected);
    const assets = assetKeys.map((key) =>
      this.reconcileAsset(key.display, reported.get(key.norm), expected.get(key.norm), tolerance),
    );

    const summary = {
      total: assets.length,
      balanced: assets.filter((a) => a.status === 'BALANCED').length,
      surplus: assets.filter((a) => a.status === 'SURPLUS').length,
      shortfall: assets.filter((a) => a.status === 'SHORTFALL').length,
      missing: assets.filter(
        (a) => a.status === 'MISSING_REPORTED' || a.status === 'MISSING_EXPECTED',
      ).length,
      invalid: assets.filter((a) => a.status === 'INVALID_DATA').length,
    };

    return {
      reconciledAt: this.now(),
      balanced: assets.every((a) => a.withinTolerance),
      assets,
      shortfalls: assets.filter((a) => a.status === 'SHORTFALL'),
      appliedTolerance: tolerance,
      summary,
    };
  }

  /** True when the report contains no shortfall and every asset is in tolerance. */
  isReconciled(report: ReserveReconciliationReport): boolean {
    return report.balanced && report.shortfalls.length === 0;
  }

  /**
   * Reconcile and throw when a shortfall (or any out-of-tolerance state) is
   * detected — convenient for callers that want reconciliation to be a hard
   * gate in a settlement or payout pipeline.
   */
  assertReconciled(input: ReserveReconciliationInput): ReserveReconciliationReport {
    const report = this.reconcile(input);
    if (!this.isReconciled(report)) {
      const offenders = report.assets
        .filter((a) => !a.withinTolerance)
        .map((a) => `${a.asset}: ${a.status}`)
        .join('; ');
      throw new ReserveReconciliationError(
        `reserve reconciliation failed — ${offenders}`,
        report,
      );
    }
    return report;
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private mergeTolerance(
    override: ReserveTolerance | undefined,
  ): Required<ReserveTolerance> {
    const merged = { ...this.defaultTolerance ?? DEFAULT_TOLERANCE, ...(override ?? {}) };
    return {
      absolute: isValidNonNegativeAmount(merged.absolute) ? merged.absolute : '0',
      relativeBps:
        Number.isFinite(merged.relativeBps) && merged.relativeBps >= 0
          ? merged.relativeBps
          : 0,
    };
  }

  /**
   * Sum entries per asset (case-insensitive), preserving the first-seen
   * display spelling. Any malformed amount marks the whole asset invalid.
   */
  private aggregate<T>(
    items: T[],
    keyOf: (item: T) => string,
    amountOf: (item: T) => string,
  ): Map<string, { display: string; total: string | null }> {
    const map = new Map<string, { display: string; total: string | null }>();
    for (const item of items) {
      const rawKey = keyOf(item);
      const norm = normalizeAsset(rawKey);
      const amount = amountOf(item);
      const existing = map.get(norm);
      if (!existing) {
        map.set(norm, {
          display: rawKey,
          total: isValidNonNegativeAmount(amount) ? amount : null,
        });
        continue;
      }
      // Once invalid, stay invalid; otherwise keep summing valid amounts.
      if (existing.total === null || !isValidNonNegativeAmount(amount)) {
        existing.total = null;
      } else {
        existing.total = addAmounts(existing.total, amount);
      }
    }
    return map;
  }

  private orderedAssetKeys(
    reported: Map<string, { display: string }>,
    expected: Map<string, { display: string }>,
  ): Array<{ norm: string; display: string }> {
    const seen = new Map<string, string>();
    for (const [norm, { display }] of expected) {
      if (!seen.has(norm)) seen.set(norm, display);
    }
    for (const [norm, { display }] of reported) {
      if (!seen.has(norm)) seen.set(norm, display);
    }
    return [...seen.entries()]
      .map(([norm, display]) => ({ norm, display }))
      .sort((a, b) => (a.norm < b.norm ? -1 : a.norm > b.norm ? 1 : 0));
  }

  private reconcileAsset(
    asset: string,
    reportedEntry: { total: string | null } | undefined,
    expectedEntry: { total: string | null } | undefined,
    tolerance: Required<ReserveTolerance>,
  ): AssetReconciliation {
    const reported = reportedEntry?.total ?? null;
    const expected = expectedEntry?.total ?? null;

    // Malformed input on either side fails closed.
    if ((reportedEntry && reported === null) || (expectedEntry && expected === null)) {
      return {
        asset,
        reported,
        expected,
        difference: null,
        relativeDifference: null,
        status: 'INVALID_DATA',
        withinTolerance: false,
        message: `${asset}: reserve amounts are malformed and cannot be reconciled`,
      };
    }

    if (expected === null) {
      return {
        asset,
        reported,
        expected: null,
        difference: null,
        relativeDifference: null,
        status: 'MISSING_EXPECTED',
        withinTolerance: false,
        message: `${asset}: reported ${reported} but no expected reserve to reconcile against`,
      };
    }

    if (reported === null) {
      return {
        asset,
        reported: null,
        expected,
        difference: null,
        relativeDifference: null,
        status: 'MISSING_REPORTED',
        withinTolerance: false,
        message: `${asset}: expected ${expected} but no reserve was reported`,
      };
    }

    const difference = subtractAmounts(reported, expected);
    const magnitude = absAmount(difference);
    const relativeDifference = ratio(difference, expected);
    const band = this.effectiveTolerance(expected, tolerance);
    const withinTolerance = compareAmounts(magnitude, band) <= 0;

    if (withinTolerance) {
      return {
        asset,
        reported,
        expected,
        difference,
        relativeDifference,
        status: 'BALANCED',
        withinTolerance: true,
        message: `${asset}: balanced within tolerance (diff ${difference})`,
      };
    }

    const isSurplus = compareAmounts(reported, expected) > 0;
    return {
      asset,
      reported,
      expected,
      difference,
      relativeDifference,
      status: isSurplus ? 'SURPLUS' : 'SHORTFALL',
      withinTolerance: false,
      message: isSurplus
        ? `${asset}: surplus of ${magnitude} over expected ${expected}`
        : `${asset}: SHORTFALL of ${magnitude} below expected ${expected}`,
    };
  }

  /** Effective absolute tolerance = max(absolute band, relative band). */
  private effectiveTolerance(
    expected: string,
    tolerance: Required<ReserveTolerance>,
  ): string {
    const relative =
      tolerance.relativeBps > 0
        ? bpsOf(expected, tolerance.relativeBps)
        : '0';
    return compareAmounts(tolerance.absolute, relative) >= 0
      ? tolerance.absolute
      : relative;
  }
}

/** Error thrown by {@link ReserveReconciliationService.assertReconciled}. */
export class ReserveReconciliationError extends Error {
  constructor(
    message: string,
    public readonly report: ReserveReconciliationReport,
  ) {
    super(message);
    this.name = 'ReserveReconciliationError';
  }
}

/** Normalize an asset symbol for grouping (trim + upper-case). */
function normalizeAsset(asset: string): string {
  return String(asset ?? '').trim().toUpperCase();
}

/**
 * `expected * bps / 10000` as a decimal string, computed via the decimal
 * helpers to avoid float drift. `bps` is truncated to an integer.
 */
function bpsOf(expected: string, bps: number): string {
  const whole = Math.trunc(bps);
  let acc = '0';
  // expected * bps, then divide by 10000 by shifting the amount's scale.
  // Implemented as repeated addition-free scaling: expected * bps first.
  const scaled = multiplyByInteger(expected, whole);
  acc = divideBy(scaled, 10000);
  return acc;
}

/** Multiply a validated non-negative decimal string by a non-negative integer. */
function multiplyByInteger(value: string, factor: number): string {
  if (factor === 0) return '0';
  const [intPart, fracPart = ''] = value.split('.');
  const digits = `${intPart}${fracPart}`;
  const product = (BigInt(digits) * BigInt(factor)).toString();
  return placeDecimal(product, fracPart.length);
}

/** Divide a validated non-negative decimal string by a positive integer. */
function divideBy(value: string, divisor: number): string {
  const [intPart, fracPart = ''] = value.split('.');
  // Add extra precision digits so the tolerance band keeps meaningful decimals.
  const extra = 6;
  const digits = `${intPart}${fracPart}${'0'.repeat(extra)}`;
  const quotient = (BigInt(digits) / BigInt(divisor)).toString();
  return placeDecimal(quotient, fracPart.length + extra);
}

/** Re-insert a decimal point `scale` digits from the right and normalize. */
function placeDecimal(digits: string, scale: number): string {
  if (scale === 0) return stripLeadingZeros(digits);
  const padded = digits.padStart(scale + 1, '0');
  const cut = padded.length - scale;
  const intPart = stripLeadingZeros(padded.slice(0, cut));
  const fracPart = padded.slice(cut).replace(/0+$/, '');
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

function stripLeadingZeros(digits: string): string {
  const stripped = digits.replace(/^0+/, '');
  return stripped.length > 0 ? stripped : '0';
}
