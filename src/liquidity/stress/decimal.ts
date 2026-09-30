/**
 * File: src/liquidity/stress/decimal.ts
 *
 * Minimal, dependency-free non-negative fixed-point decimal helpers used by the
 * liquidity stress tester.
 *
 * Liquidity amounts are carried as decimal strings to preserve precision;
 * arithmetic runs through BigInt (scaled to a common number of fraction digits)
 * so stress simulations never suffer floating-point drift.
 */

const AMOUNT_RE = /^\d+(\.\d+)?$/;

/** True when `value` is a well-formed non-negative decimal amount string. */
export function isValidAmount(value: unknown): value is string {
  return typeof value === 'string' && AMOUNT_RE.test(value.trim());
}

/** Coerce a numeric or string amount to a validated decimal string, or null. */
export function coerceAmount(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    const asString = value.toString();
    return AMOUNT_RE.test(asString) ? asString : null;
  }
  return isValidAmount(value) ? value.trim() : null;
}

function fractionLength(value: string): number {
  const dot = value.indexOf('.');
  return dot === -1 ? 0 : value.length - dot - 1;
}

function toScaled(value: string, scale: number): bigint {
  const [intPart, fracPart = ''] = value.trim().split('.');
  const paddedFrac = (fracPart + '0'.repeat(scale)).slice(0, scale);
  return BigInt(`${intPart}${paddedFrac}` || '0');
}

function fromScaled(value: bigint, scale: number): string {
  let digits = value.toString();
  if (scale === 0) return stripLeadingZeros(digits);
  if (digits.length <= scale) digits = '0'.repeat(scale - digits.length + 1) + digits;
  const cut = digits.length - scale;
  const intPart = stripLeadingZeros(digits.slice(0, cut));
  const fracPart = digits.slice(cut).replace(/0+$/, '');
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

function stripLeadingZeros(digits: string): string {
  const stripped = digits.replace(/^0+/, '');
  return stripped.length > 0 ? stripped : '0';
}

function commonScale(...values: string[]): number {
  return values.reduce((max, value) => Math.max(max, fractionLength(value)), 0);
}

/** Compare two validated amounts: -1 (a<b), 0 (equal), 1 (a>b). */
export function compareAmounts(a: string, b: string): number {
  const scale = commonScale(a, b);
  const av = toScaled(a, scale);
  const bv = toScaled(b, scale);
  return av < bv ? -1 : av > bv ? 1 : 0;
}

/** Exact sum of two validated amounts. */
export function addAmounts(a: string, b: string): string {
  const scale = commonScale(a, b);
  return fromScaled(toScaled(a, scale) + toScaled(b, scale), scale);
}

/** Exact difference `a - b`, clamped at zero. */
export function subtractClampedAmounts(a: string, b: string): string {
  const scale = commonScale(a, b);
  const diff = toScaled(a, scale) - toScaled(b, scale);
  return fromScaled(diff < 0n ? 0n : diff, scale);
}

/** The smaller of two validated amounts. */
export function minAmount(a: string, b: string): string {
  return compareAmounts(a, b) <= 0 ? a : b;
}

/**
 * `amount * percent / 100` with extra precision, for percentage shocks.
 * `percent` may be any non-negative validated decimal string (e.g. '150' to
 * model a demand surge larger than the pool).
 */
export function percentOf(amount: string, percent: string, extra = 8): string {
  const scale = commonScale(amount, percent);
  const a = toScaled(amount, scale);
  const p = toScaled(percent, scale);
  // (a/10^s) * (p/10^s) / 100 = a*p / (100 * 10^(2s)); both operands are scaled.
  const numer = a * p * 10n ** BigInt(extra);
  const denom = 100n * 10n ** BigInt(2 * scale);
  return fromScaled(numer / denom, extra);
}

/**
 * `amount * share / total` with extra precision. Returns '0' when `total` is
 * zero. Used to distribute an asset-level shock across pools proportionally.
 */
export function proportion(amount: string, share: string, total: string, extra = 8): string {
  const scale = commonScale(amount, share, total);
  const t = toScaled(total, scale);
  if (t === 0n) return '0';
  const a = toScaled(amount, scale);
  const sh = toScaled(share, scale);
  const numer = a * sh * 10n ** BigInt(extra);
  const denom = t * 10n ** BigInt(scale);
  return fromScaled(numer / denom, extra);
}
