/**
 * File: src/reconciliation/reserves/decimal.ts
 *
 * Minimal, dependency-free signed fixed-point decimal helpers used by the
 * reserve reconciliation service.
 *
 * Reserve balances are carried as decimal strings to preserve precision for
 * large or fractional amounts. These helpers perform exact arithmetic and
 * comparison via BigInt (scaled to a common number of fraction digits) so we
 * never introduce floating-point drift when comparing reported and expected
 * reserves.
 */

const UNSIGNED_AMOUNT_RE = /^\d+(\.\d+)?$/;
const SIGNED_AMOUNT_RE = /^-?\d+(\.\d+)?$/;

/** True when `value` is a well-formed non-negative decimal amount string. */
export function isValidNonNegativeAmount(value: unknown): value is string {
  return typeof value === 'string' && UNSIGNED_AMOUNT_RE.test(value.trim());
}

/** True when `value` is a well-formed (optionally negative) decimal string. */
export function isValidSignedAmount(value: unknown): value is string {
  return typeof value === 'string' && SIGNED_AMOUNT_RE.test(value.trim());
}

/** Number of digits after the decimal point in a validated amount. */
function fractionLength(value: string): number {
  const dot = value.indexOf('.');
  return dot === -1 ? 0 : value.length - dot - 1;
}

/** Convert a validated decimal string to a BigInt scaled to `scale` digits. */
function toScaled(value: string, scale: number): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const body = negative ? trimmed.slice(1) : trimmed;
  const [intPart, fracPart = ''] = body.split('.');
  const paddedFrac = (fracPart + '0'.repeat(scale)).slice(0, scale);
  const magnitude = BigInt(`${intPart}${paddedFrac}` || '0');
  return negative ? -magnitude : magnitude;
}

/** Render a scaled BigInt back to a normalized decimal string. */
function fromScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  let digits = (negative ? -value : value).toString();
  if (scale === 0) {
    return negative && digits !== '0' ? `-${digits}` : digits;
  }
  if (digits.length <= scale) {
    digits = '0'.repeat(scale - digits.length + 1) + digits;
  }
  const cut = digits.length - scale;
  const intPart = digits.slice(0, cut);
  const fracPart = digits.slice(cut).replace(/0+$/, '');
  const rendered = fracPart ? `${intPart}.${fracPart}` : intPart;
  return negative && rendered !== '0' ? `-${rendered}` : rendered;
}

/** Common scale (max fraction length) for a set of validated amounts. */
function commonScale(...values: string[]): number {
  return values.reduce((max, value) => Math.max(max, fractionLength(value)), 0);
}

/** Compare two validated decimal strings: -1 (a<b), 0 (equal), 1 (a>b). */
export function compareAmounts(a: string, b: string): number {
  const scale = commonScale(a, b);
  const av = toScaled(a, scale);
  const bv = toScaled(b, scale);
  if (av < bv) return -1;
  if (av > bv) return 1;
  return 0;
}

/** Exact sum of two validated decimal strings. */
export function addAmounts(a: string, b: string): string {
  const scale = commonScale(a, b);
  return fromScaled(toScaled(a, scale) + toScaled(b, scale), scale);
}

/** Exact difference `a - b` of two validated decimal strings (may be negative). */
export function subtractAmounts(a: string, b: string): string {
  const scale = commonScale(a, b);
  return fromScaled(toScaled(a, scale) - toScaled(b, scale), scale);
}

/** Absolute value of a validated (possibly negative) decimal string. */
export function absAmount(value: string): string {
  return value.startsWith('-') ? value.slice(1) : value;
}

/**
 * Ratio `abs(a) / b` as a JavaScript number, for reporting a relative
 * discrepancy. Returns `null` when `b` is zero. This is a derived metric, not
 * a money value, so a double is acceptable here.
 */
export function ratio(a: string, b: string): number | null {
  const scale = commonScale(a, b);
  const bv = toScaled(b, scale);
  if (bv === 0n) return null;
  const av = toScaled(a, scale);
  const magnitude = av < 0n ? -av : av;
  return Number(magnitude) / Number(bv < 0n ? -bv : bv);
}
