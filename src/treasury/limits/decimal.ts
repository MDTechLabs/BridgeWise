/**
 * File: src/treasury/limits/decimal.ts
 *
 * Minimal, dependency-free non-negative fixed-point decimal helpers used by the
 * treasury transaction limits service.
 *
 * Amounts are carried as decimal strings to preserve precision; arithmetic and
 * comparison run through BigInt (scaled to a common number of fraction digits)
 * so limit checks never suffer floating-point drift.
 */

const AMOUNT_RE = /^\d+(\.\d+)?$/;

/** True when `value` is a well-formed non-negative decimal amount string. */
export function isValidAmount(value: unknown): value is string {
  return typeof value === 'string' && AMOUNT_RE.test(value.trim());
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

/**
 * Exact difference `a - b`, clamped at zero. Used for "remaining capacity"
 * figures which are never meaningfully negative.
 */
export function subtractClampedAmounts(a: string, b: string): string {
  const scale = commonScale(a, b);
  const diff = toScaled(a, scale) - toScaled(b, scale);
  return fromScaled(diff < 0n ? 0n : diff, scale);
}
