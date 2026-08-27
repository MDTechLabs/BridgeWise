```ts
/**
 * Soroban Token Balance Reader
 *
 * Standalone token-balance reading and normalization module for Soroban.
 *
 * This module intentionally has no dependencies on the existing BridgeWise
 * wallet or Soroban implementation. It can be introduced and tested
 * independently before being connected to an RPC/client implementation.
 *
 * Responsibilities:
 * - Resolve token contract information.
 * - Read token balances through an injected reader.
 * - Normalize raw token amounts.
 * - Handle unavailable/missing accounts safely.
 * - Support multiple token contracts.
 *
 * The actual Soroban RPC/client implementation is injected through
 * `SorobanBalanceSource`. This keeps this module deterministic and easy
 * to test.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface SorobanTokenContract {
  /** Contract address of the token. */
  contractAddress: string;

  /** Human-readable token symbol. */
  symbol?: string;

  /** Token name. */
  name?: string;

  /** Token decimals. */
  decimals: number;
}

export interface SorobanTokenBalance {
  /** Token contract address. */
  contractAddress: string;

  /** Human-readable token symbol, when available. */
  symbol?: string;

  /** Token name, when available. */
  name?: string;

  /** Token decimals. */
  decimals: number;

  /**
   * Raw token balance as returned by the token contract.
   *
   * This remains a string to avoid JavaScript number precision loss.
   */
  rawAmount: string;

  /**
   * Human-readable normalized amount.
   *
   * Example:
   * rawAmount = "1234567"
   * decimals = 6
   * normalizedAmount = "1.234567"
   */
  normalizedAmount: string;

  /** Whether the account was successfully found/read. */
  available: boolean;
}

export interface SorobanBalanceSource {
  /**
   * Resolve token contract metadata.
   */
  resolveTokenContract(
    contractAddress: string,
  ): Promise<SorobanTokenContract | null>;

  /**
   * Read the raw token balance for an account.
   *
   * Returns null when the account/token balance cannot be read.
   */
  readTokenBalance(
    contractAddress: string,
    accountAddress: string,
  ): Promise<string | null>;
}

export interface ReadTokenBalanceOptions {
  /** Stellar account whose balance should be read. */
  accountAddress: string;

  /** Token contract to read. */
  contractAddress: string;
}

export interface ReadMultipleTokenBalancesOptions {
  /** Stellar account whose balances should be read. */
  accountAddress: string;

  /** Token contracts to read. */
  contractAddresses: string[];
}

export interface SorobanBalanceReaderError {
  code:
    | 'INVALID_ACCOUNT'
    | 'INVALID_CONTRACT'
    | 'TOKEN_NOT_FOUND'
    | 'BALANCE_UNAVAILABLE'
    | 'INVALID_RAW_BALANCE'
    | 'INVALID_DECIMALS'
    | 'READ_FAILED';

  message: string;

  contractAddress?: string;

  accountAddress?: string;
}

export interface SorobanTokenBalanceResult {
  /** Whether a usable balance was returned. */
  success: boolean;

  /** Normalized balance when available. */
  balance: SorobanTokenBalance | null;

  /** Validation/read errors. */
  errors: SorobanBalanceReaderError[];
}

export interface SorobanMultipleTokenBalanceResult {
  /** Whether all requested token balances were successfully read. */
  success: boolean;

  /** Successfully resolved balances. */
  balances: SorobanTokenBalance[];

  /** Errors for unavailable or invalid tokens. */
  errors: SorobanBalanceReaderError[];
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Validate a Stellar account address.
 *
 * This intentionally performs structural validation rather than attempting
 * full Stellar StrKey decoding, keeping the module dependency-free.
 */
export function isValidAccountAddress(
  accountAddress: string,
): boolean {
  return (
    typeof accountAddress === 'string' &&
    accountAddress.length > 0 &&
    accountAddress.startsWith('G')
  );
}

/**
 * Validate a Soroban contract address.
 *
 * This intentionally performs structural validation rather than attempting
 * full StrKey decoding.
 */
export function isValidContractAddress(
  contractAddress: string,
): boolean {
  return (
    typeof contractAddress === 'string' &&
    contractAddress.length > 0 &&
    contractAddress.startsWith('C')
  );
}

/**
 * Validate token decimals.
 */
export function isValidDecimals(decimals: number): boolean {
  return (
    Number.isInteger(decimals) &&
    decimals >= 0 &&
    decimals <= 255
  );
}

/**
 * Validate a raw token amount.
 *
 * Token amounts are represented as strings to preserve precision.
 */
export function isValidRawAmount(
  rawAmount: string,
): boolean {
  return (
    typeof rawAmount === 'string' &&
    /^\d+$/.test(rawAmount)
  );
}

/* -------------------------------------------------------------------------- */
/* Amount Normalization                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Remove unnecessary leading zeros while preserving zero.
 */
function normalizeIntegerString(value: string): string {
  const normalized = value.replace(/^0+(?=\d)/, '');

  return normalized || '0';
}

/**
 * Normalize a raw integer token amount according to its decimals.
 *
 * Examples:
 *
 * normalizeTokenAmount("1000000", 6)
 * → "1"
 *
 * normalizeTokenAmount("1234567", 6)
 * → "1.234567"
 *
 * normalizeTokenAmount("500", 3)
 * → "0.5"
 */
export function normalizeTokenAmount(
  rawAmount: string,
  decimals: number,
): string {
  if (!isValidRawAmount(rawAmount)) {
    throw new Error('Raw token amount must be a non-negative integer string.');
  }

  if (!isValidDecimals(decimals)) {
    throw new Error('Token decimals must be an integer between 0 and 255.');
  }

  const normalizedInteger = normalizeIntegerString(rawAmount);

  if (decimals === 0) {
    return normalizedInteger;
  }

  const padded = normalizedInteger.padStart(
    decimals + 1,
    '0',
  );

  const splitPosition = padded.length - decimals;

  const integerPart = padded.slice(0, splitPosition);

  const fractionalPart = padded
    .slice(splitPosition)
    .replace(/0+$/, '');

  if (fractionalPart.length === 0) {
    return normalizeIntegerString(integerPart);
  }

  return `${normalizeIntegerString(integerPart)}.${fractionalPart}`;
}

/**
 * Convert a normalized decimal token amount back to its raw integer
 * representation.
 *
 * This is useful when callers need to prepare contract arguments after
 * displaying or manipulating a normalized amount.
 */
export function denormalizeTokenAmount(
  normalizedAmount: string,
  decimals: number,
): string {
  if (!isValidDecimals(decimals)) {
    throw new Error('Token decimals must be an integer between 0 and 255.');
  }

  if (
    typeof normalizedAmount !== 'string' ||
    !/^\d+(\.\d+)?$/.test(normalizedAmount)
  ) {
    throw new Error(
      'Normalized token amount must be a non-negative decimal string.',
    );
  }

  const [integerPart, fractionalPart = ''] =
    normalizedAmount.split('.');

  if (fractionalPart.length > decimals) {
    throw new Error(
      `Amount contains more than ${decimals} decimal places.`,
    );
  }

  const paddedFraction = fractionalPart.padEnd(
    decimals,
    '0',
  );

  return normalizeIntegerString(
    `${integerPart}${paddedFraction}`,
  );
}

/* -------------------------------------------------------------------------- */
/* Balance Formatting                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Create a normalized balance object from token metadata and a raw amount.
 */
export function createTokenBalance(
  token: SorobanTokenContract,
  rawAmount: string,
): SorobanTokenBalance {
  if (!isValidContractAddress(token.contractAddress)) {
    throw new Error('Invalid token contract address.');
  }

  if (!isValidDecimals(token.decimals)) {
    throw new Error('Invalid token decimals.');
  }

  if (!isValidRawAmount(rawAmount)) {
    throw new Error('Invalid raw token balance.');
  }

  return {
    contractAddress: token.contractAddress,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    rawAmount: normalizeIntegerString(rawAmount),
    normalizedAmount: normalizeTokenAmount(
      rawAmount,
      token.decimals,
    ),
    available: true,
  };
}

/**
 * Create a safe unavailable balance representation.
 */
export function createUnavailableBalance(
  token: SorobanTokenContract,
): SorobanTokenBalance {
  return {
    contractAddress: token.contractAddress,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    rawAmount: '0',
    normalizedAmount: '0',
    available: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Single Token Balance Reader                                                */
/* -------------------------------------------------------------------------- */

/**
 * Read a single Soroban token balance.
 */
export async function readSorobanTokenBalance(
  source: SorobanBalanceSource,
  options: ReadTokenBalanceOptions,
): Promise<SorobanTokenBalanceResult> {
  const { accountAddress, contractAddress } = options;

  if (!isValidAccountAddress(accountAddress)) {
    return {
      success: false,
      balance: null,
      errors: [
        {
          code: 'INVALID_ACCOUNT',
          message:
            'The provided Stellar account address is invalid.',
          accountAddress,
          contractAddress,
        },
      ],
    };
  }

  if (!isValidContractAddress(contractAddress)) {
    return {
      success: false,
      balance: null,
      errors: [
        {
          code: 'INVALID_CONTRACT',
          message:
            'The provided Soroban token contract address is invalid.',
          accountAddress,
          contractAddress,
        },
      ],
    };
  }

  let token: SorobanTokenContract | null;

  try {
    token = await source.resolveTokenContract(
      contractAddress,
    );
  } catch (error) {
    return {
      success: false,
      balance: null,
      errors: [
        {
          code: 'READ_FAILED',
          message:
            `Failed to resolve token contract: ${
              error instanceof Error
                ? error.message
                : String(error)
            }`,
          accountAddress,
          contractAddress,
        },
      ],
    };
  }

  if (!token) {
    return {
      success: false,
      balance: null,
      errors: [
        {
          code: 'TOKEN_NOT_FOUND',
          message:
            `Token contract "${contractAddress}" could not be resolved.`,
          accountAddress,
          contractAddress,
        },
      ],
    };
  }

  if (!isValidDecimals(token.decimals)) {
    return {
      success: false,
      balance: null,
      errors: [
        {
          code: 'INVALID_DECIMALS',
          message:
            `Token "${contractAddress}" has invalid decimals.`,
          accountAddress,
          contractAddress,
        },
      ],
    };
  }

  let rawBalance: string | null;

  try {
    rawBalance = await source.readTokenBalance(
      contractAddress,
      accountAddress,
    );
  } catch (error) {
    return {
      success: false,
      balance: null,
      errors: [
        {
          code: 'READ_FAILED',
          message:
            `Failed to read token balance: ${
              error instanceof Error
                ? error.message
                : String(error)
            }`,
          accountAddress,
          contractAddress,
        },
      ],
    };
  }

  /*
   * Missing/unavailable balances are handled safely rather than
   * being converted into an apparently valid zero balance.
   */
  if (rawBalance === null) {
    return {
      success: false,
      balance: createUnavailableBalance(token),
      errors: [
        {
          code: 'BALANCE_UNAVAILABLE',
          message:
            `Balance for account "${accountAddress}" is unavailable ` +
            `for token "${contractAddress}".`,
          accountAddress,
          contractAddress,
        },
      ],
    };
  }

  if (!isValidRawAmount(rawBalance)) {
    return {
      success: false,
      balance: null,
      errors: [
        {
          code: 'INVALID_RAW_BALANCE',
          message:
            `Token contract returned an invalid raw balance: "${rawBalance}".`,
          accountAddress,
          contractAddress,
        },
      ],
    };
  }

  try {
    const balance = createTokenBalance(
      token,
      rawBalance,
    );

    return {
      success: true,
      balance,
      errors: [],
    };
  } catch (error) {
    return {
      success: false,
      balance: null,
      errors: [
        {
          code: 'INVALID_RAW_BALANCE',
          message:
            `Unable to normalize token balance: ${
              error instanceof Error
                ? error.message
                : String(error)
            }`,
          accountAddress,
          contractAddress,
        },
      ],
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Multiple Token Balance Reader                                              */
/* -------------------------------------------------------------------------- */

/**
 * Read balances for multiple token contracts belonging to the same account.
 *
 * One unavailable token does not prevent other token balances from being
 * returned.
 */
export async function readMultipleSorobanTokenBalances(
  source: SorobanBalanceSource,
  options: ReadMultipleTokenBalancesOptions,
): Promise<SorobanMultipleTokenBalanceResult> {
  const {
    accountAddress,
    contractAddresses,
  } = options;

  if (!isValidAccountAddress(accountAddress)) {
    return {
      success: false,
      balances: [],
      errors: [
        {
          code: 'INVALID_ACCOUNT',
          message:
            'The provided Stellar account address is invalid.',
          accountAddress,
        },
      ],
    };
  }

  const uniqueContracts = [
    ...new Set(contractAddresses),
  ];

  const results = await Promise.all(
    uniqueContracts.map((contractAddress) =>
      readSorobanTokenBalance(source, {
        accountAddress,
        contractAddress,
      }),
    ),
  );

  const balances: SorobanTokenBalance[] = [];
  const errors: SorobanBalanceReaderError[] = [];

  for (const result of results) {
    if (result.balance) {
      balances.push(result.balance);
    }

    errors.push(...result.errors);
  }

  return {
    success: errors.length === 0,
    balances,
    errors,
  };
}

/* -------------------------------------------------------------------------- */
/* Batch Reader Class                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Reusable balance reader facade.
 *
 * The class stores no mutable balance state, which means it can safely
 * be reused for multiple accounts and token sets.
 */
export class SorobanTokenBalanceReader {
  constructor(
    private readonly source: SorobanBalanceSource,
  ) {}

  /**
   * Read one token balance.
   */
  read(
    options: ReadTokenBalanceOptions,
  ): Promise<SorobanTokenBalanceResult> {
    return readSorobanTokenBalance(
      this.source,
      options,
    );
  }

  /**
   * Read multiple token balances.
   */
  readMany(
    options: ReadMultipleTokenBalancesOptions,
  ): Promise<SorobanMultipleTokenBalanceResult> {
    return readMultipleSorobanTokenBalances(
      this.source,
      options,
    );
  }
}
```
