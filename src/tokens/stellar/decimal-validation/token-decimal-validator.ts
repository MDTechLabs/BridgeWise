/**
 * Token decimal validation.
 *
 * Bridging moves amounts between ledgers whose tokens do not agree on scale.
 * If the number of decimals BridgeWise assumes differs from the number the
 * token actually uses, every amount that crosses the bridge is silently wrong
 * by a power of ten. This module makes that assumption explicit and checks it
 * against the value reported by the token before a transfer is planned.
 */

export type TokenNetwork = 'stellar' | 'soroban' | 'evm';

export type TokenKind = 'native' | 'classic-asset' | 'soroban-token' | 'wrapped-evm';

export interface TokenDecimalAssumption {
  asset: string;
  network: TokenNetwork;
  kind: TokenKind;
  expectedDecimals: number;
}

export type TokenDecimalValidationCode =
  | 'DECIMALS_MATCH'
  | 'DECIMALS_MISMATCH'
  | 'MISSING_ASSUMPTION'
  | 'INVALID_DECIMALS'
  | 'SOURCE_UNAVAILABLE';

export interface TokenDecimalValidation {
  asset: string;
  network: TokenNetwork;
  valid: boolean;
  code: TokenDecimalValidationCode;
  message: string;
  expectedDecimals?: number;
  actualDecimals?: number;
}

export interface ValidateTokenDecimalsInput {
  asset: string;
  network: TokenNetwork;
  /** Decimals reported by the token. Absent when the source could not be read. */
  actualDecimals?: number;
  /** Set to false when the token metadata source was unreachable. Defaults true. */
  sourceAvailable?: boolean;
}

/** Stellar classic assets, and the native asset, are fixed at 7 decimals. */
export const STELLAR_DECIMALS = 7;

/**
 * The largest scale that still allows a base-unit value to be multiplied into
 * a signed 64-bit integer without overflow.
 */
export const MAX_DECIMALS = 19;

/**
 * Assumptions shipped with BridgeWise. Callers may extend or override these
 * through {@link TokenDecimalValidator.register}.
 */
export const DEFAULT_TOKEN_DECIMAL_ASSUMPTIONS: TokenDecimalAssumption[] = [
  { asset: 'XLM', network: 'stellar', kind: 'native', expectedDecimals: STELLAR_DECIMALS },
  { asset: 'native', network: 'soroban', kind: 'native', expectedDecimals: STELLAR_DECIMALS },
  { asset: 'USDC', network: 'stellar', kind: 'classic-asset', expectedDecimals: STELLAR_DECIMALS },
  { asset: 'USDT', network: 'stellar', kind: 'classic-asset', expectedDecimals: STELLAR_DECIMALS },
  { asset: 'USDC', network: 'evm', kind: 'wrapped-evm', expectedDecimals: 6 },
  { asset: 'USDT', network: 'evm', kind: 'wrapped-evm', expectedDecimals: 6 },
  { asset: 'WETH', network: 'evm', kind: 'wrapped-evm', expectedDecimals: 18 },
];

function assumptionKey(asset: string, network: TokenNetwork): string {
  return `${network}:${asset.trim().toUpperCase()}`;
}

export function isValidDecimalCount(decimals: unknown): decimals is number {
  return (
    typeof decimals === 'number' &&
    Number.isInteger(decimals) &&
    decimals >= 0 &&
    decimals <= MAX_DECIMALS
  );
}

/**
 * Validates on-chain token decimals against the scale BridgeWise assumes, and
 * converts user-facing amounts to and from base units at the declared scale.
 */
export class TokenDecimalValidator {
  private readonly assumptions = new Map<string, TokenDecimalAssumption>();

  constructor(
    assumptions: TokenDecimalAssumption[] = DEFAULT_TOKEN_DECIMAL_ASSUMPTIONS,
  ) {
    for (const assumption of assumptions) {
      this.register(assumption);
    }
  }

  register(assumption: TokenDecimalAssumption): void {
    if (!isValidDecimalCount(assumption.expectedDecimals)) {
      throw new Error(
        `Invalid expected decimals for ${assumption.asset}: ${assumption.expectedDecimals}`,
      );
    }

    this.assumptions.set(assumptionKey(assumption.asset, assumption.network), {
      ...assumption,
      asset: assumption.asset.trim(),
    });
  }

  getAssumption(
    asset: string,
    network: TokenNetwork,
  ): TokenDecimalAssumption | undefined {
    const found = this.assumptions.get(assumptionKey(asset, network));
    return found ? { ...found } : undefined;
  }

  hasAssumption(asset: string, network: TokenNetwork): boolean {
    return this.assumptions.has(assumptionKey(asset, network));
  }

  validate(input: ValidateTokenDecimalsInput): TokenDecimalValidation {
    const asset = (input.asset ?? '').trim();
    const network = input.network;

    if (!asset) {
      return {
        asset,
        network,
        valid: false,
        code: 'MISSING_ASSUMPTION',
        message: 'asset is required to validate token decimals',
      };
    }

    if (input.sourceAvailable === false || input.actualDecimals === undefined) {
      return {
        asset,
        network,
        valid: false,
        code: 'SOURCE_UNAVAILABLE',
        message: `Token metadata for ${asset} on ${network} could not be read`,
      };
    }

    const assumption = this.getAssumption(asset, network);

    if (!assumption) {
      return {
        asset,
        network,
        valid: false,
        code: 'MISSING_ASSUMPTION',
        message: `No decimal assumption registered for ${asset} on ${network}`,
        actualDecimals: input.actualDecimals,
      };
    }

    if (!isValidDecimalCount(input.actualDecimals)) {
      return {
        asset,
        network,
        valid: false,
        code: 'INVALID_DECIMALS',
        message: `${asset} reported invalid decimals: ${input.actualDecimals}`,
        expectedDecimals: assumption.expectedDecimals,
        actualDecimals: input.actualDecimals,
      };
    }

    if (input.actualDecimals !== assumption.expectedDecimals) {
      return {
        asset,
        network,
        valid: false,
        code: 'DECIMALS_MISMATCH',
        message: `${asset} on ${network} uses ${input.actualDecimals} decimals but ${assumption.expectedDecimals} are assumed`,
        expectedDecimals: assumption.expectedDecimals,
        actualDecimals: input.actualDecimals,
      };
    }

    return {
      asset,
      network,
      valid: true,
      code: 'DECIMALS_MATCH',
      message: `${asset} on ${network} uses the assumed ${assumption.expectedDecimals} decimals`,
      expectedDecimals: assumption.expectedDecimals,
      actualDecimals: input.actualDecimals,
    };
  }

  /**
   * Convert a user-facing amount to base units at the given scale.
   *
   * Amounts are handled as decimal strings so that a value such as `0.1`
   * cannot pick up floating point error on the way to an integer.
   */
  toBaseUnits(amount: string | number | bigint, decimals: number): bigint {
    if (!isValidDecimalCount(decimals)) {
      throw new Error(`Invalid decimals: ${decimals}`);
    }

    const text = typeof amount === 'bigint' ? amount.toString() : String(amount).trim();
    const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(text);

    if (!match || (match[2] === '' && (match[3] ?? '') === '')) {
      throw new Error(`Invalid amount: ${amount}`);
    }

    const sign = match[1] === '-' ? -1n : 1n;
    const whole = match[2] === '' ? '0' : match[2];
    const fraction = match[3] ?? '';

    if (fraction.length > decimals) {
      throw new Error(
        `Amount ${amount} has more precision than the ${decimals} decimals allow`,
      );
    }

    const padded = fraction.padEnd(decimals, '0');
    return sign * (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || '0'));
  }

  /** Convert base units back to a decimal string at the given scale. */
  fromBaseUnits(baseUnits: bigint, decimals: number): string {
    if (!isValidDecimalCount(decimals)) {
      throw new Error(`Invalid decimals: ${decimals}`);
    }

    const negative = baseUnits < 0n;
    const magnitude = negative ? -baseUnits : baseUnits;

    if (decimals === 0) {
      return `${negative ? '-' : ''}${magnitude.toString()}`;
    }

    const divisor = 10n ** BigInt(decimals);
    const whole = magnitude / divisor;
    const fraction = (magnitude % divisor).toString().padStart(decimals, '0');

    return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
  }
}
