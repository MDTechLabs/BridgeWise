```ts
/**
 * Stellar Transfer Balance Guard
 *
 * Standalone pre-execution validation module for Stellar bridge transfers.
 *
 * This module intentionally has no dependencies on the existing BridgeWise
 * execution or routing implementation. It can be introduced and tested
 * independently before being connected to the execution pipeline.
 *
 * Responsibilities:
 * - Validate transfer-asset balance.
 * - Validate native Stellar asset balance required for fees.
 * - Account for configurable safety buffers.
 * - Return required and available amounts.
 * - Produce actionable validation errors.
 *
 * Amounts are represented as numbers for portability.
 * Consumers dealing with Stellar stroops/large integer amounts should adapt
 * this module to bigint or decimal arithmetic before using it with values
 * that can exceed JavaScript's safe integer range.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface StellarTransferBalanceInput {
  /** Asset being transferred. */
  transferAsset: string;

  /** Amount the user intends to transfer. */
  transferAmount: number;

  /**
   * Available balance of the asset being transferred.
   */
  availableTransferBalance: number;

  /**
   * Estimated network fee for the transaction.
   *
   * This is normally denominated in the native Stellar asset.
   */
  estimatedNetworkFee: number;

  /**
   * Available balance of the native Stellar asset used for fees.
   */
  availableFeeBalance: number;

  /**
   * Native Stellar asset identifier.
   *
   * Defaults to "XLM".
   */
  nativeAsset?: string;

  /**
   * Additional safety buffer applied to the transfer asset.
   *
   * Example:
   *   0.05 = require 5% additional transfer-asset balance.
   *
   * Defaults to 0.
   */
  transferSafetyBuffer?: number;

  /**
   * Additional safety buffer applied to network fees.
   *
   * Example:
   *   0.20 = require 20% more fee balance than estimated.
   *
   * Defaults to 0.
   */
  feeSafetyBuffer?: number;
}

export interface BalanceRequirement {
  /** Asset associated with this requirement. */
  asset: string;

  /** Amount required before safety buffers. */
  baseRequired: number;

  /** Additional amount required because of the safety buffer. */
  safetyBufferAmount: number;

  /** Total amount required. */
  totalRequired: number;

  /** Amount currently available. */
  available: number;

  /** Amount still missing. */
  shortfall: number;

  /** Whether the available balance satisfies the requirement. */
  sufficient: boolean;
}

export type BalanceGuardErrorCode =
  | 'INVALID_TRANSFER_AMOUNT'
  | 'INVALID_TRANSFER_BALANCE'
  | 'INVALID_NETWORK_FEE'
  | 'INVALID_FEE_BALANCE'
  | 'INVALID_SAFETY_BUFFER'
  | 'INSUFFICIENT_TRANSFER_BALANCE'
  | 'INSUFFICIENT_FEE_BALANCE';

export interface BalanceGuardError {
  /** Machine-readable error code. */
  code: BalanceGuardErrorCode;

  /** Human-readable actionable message. */
  message: string;

  /** Asset associated with the failure, when applicable. */
  asset?: string;

  /** Amount required, when applicable. */
  required?: number;

  /** Amount available, when applicable. */
  available?: number;

  /** Amount missing, when applicable. */
  shortfall?: number;
}

export interface StellarTransferBalanceResult {
  /** Whether the transfer can safely proceed. */
  allowed: boolean;

  /** Transfer-asset balance requirement. */
  transferBalance: BalanceRequirement;

  /** Network-fee balance requirement. */
  feeBalance: BalanceRequirement;

  /** All validation errors. */
  errors: BalanceGuardError[];
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const DEFAULT_NATIVE_ASSET = 'XLM';

export const DEFAULT_TRANSFER_SAFETY_BUFFER = 0;

export const DEFAULT_FEE_SAFETY_BUFFER = 0;

/* -------------------------------------------------------------------------- */
/* Utility Functions                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Check whether a value is a finite non-negative amount.
 */
export function isValidAmount(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/**
 * Check whether a safety buffer is valid.
 *
 * Buffers are expressed as decimal percentages:
 *
 *   0.05 = 5%
 *   0.10 = 10%
 *   0.25 = 25%
 */
export function isValidSafetyBuffer(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/**
 * Apply a safety buffer to an amount.
 *
 * Example:
 *
 *   applySafetyBuffer(100, 0.10) === 110
 */
export function applySafetyBuffer(
  amount: number,
  safetyBuffer: number,
): number {
  if (!isValidAmount(amount)) {
    return 0;
  }

  if (!isValidSafetyBuffer(safetyBuffer)) {
    return amount;
  }

  return amount * (1 + safetyBuffer);
}

/**
 * Calculate the amount missing from an available balance.
 */
export function calculateShortfall(
  required: number,
  available: number,
): number {
  if (!Number.isFinite(required) || !Number.isFinite(available)) {
    return 0;
  }

  return Math.max(0, required - available);
}

/**
 * Construct a balance requirement.
 */
export function createBalanceRequirement(
  asset: string,
  baseRequired: number,
  available: number,
  safetyBuffer: number,
): BalanceRequirement {
  const safeBaseRequired = Math.max(0, baseRequired);
  const safeAvailable = Math.max(0, available);

  const totalRequired = applySafetyBuffer(
    safeBaseRequired,
    safetyBuffer,
  );

  const safetyBufferAmount =
    totalRequired - safeBaseRequired;

  const shortfall = calculateShortfall(
    totalRequired,
    safeAvailable,
  );

  return {
    asset,
    baseRequired: safeBaseRequired,
    safetyBufferAmount,
    totalRequired,
    available: safeAvailable,
    shortfall,
    sufficient: shortfall === 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Input Validation                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Validate the balance-guard input before performing calculations.
 */
export function validateBalanceGuardInput(
  input: StellarTransferBalanceInput,
): BalanceGuardError[] {
  const errors: BalanceGuardError[] = [];

  if (
    !Number.isFinite(input.transferAmount) ||
    input.transferAmount < 0
  ) {
    errors.push({
      code: 'INVALID_TRANSFER_AMOUNT',
      message:
        'Transfer amount must be a finite non-negative number.',
      asset: input.transferAsset,
    });
  }

  if (
    !Number.isFinite(input.availableTransferBalance) ||
    input.availableTransferBalance < 0
  ) {
    errors.push({
      code: 'INVALID_TRANSFER_BALANCE',
      message:
        'Available transfer-asset balance must be a finite non-negative number.',
      asset: input.transferAsset,
    });
  }

  if (
    !Number.isFinite(input.estimatedNetworkFee) ||
    input.estimatedNetworkFee < 0
  ) {
    errors.push({
      code: 'INVALID_NETWORK_FEE',
      message:
        'Estimated network fee must be a finite non-negative number.',
      asset: input.nativeAsset ?? DEFAULT_NATIVE_ASSET,
    });
  }

  if (
    !Number.isFinite(input.availableFeeBalance) ||
    input.availableFeeBalance < 0
  ) {
    errors.push({
      code: 'INVALID_FEE_BALANCE',
      message:
        'Available fee balance must be a finite non-negative number.',
      asset: input.nativeAsset ?? DEFAULT_NATIVE_ASSET,
    });
  }

  const transferBuffer =
    input.transferSafetyBuffer ??
    DEFAULT_TRANSFER_SAFETY_BUFFER;

  if (!isValidSafetyBuffer(transferBuffer)) {
    errors.push({
      code: 'INVALID_SAFETY_BUFFER',
      message:
        'Transfer safety buffer must be a finite non-negative number.',
      asset: input.transferAsset,
    });
  }

  const feeBuffer =
    input.feeSafetyBuffer ?? DEFAULT_FEE_SAFETY_BUFFER;

  if (!isValidSafetyBuffer(feeBuffer)) {
    errors.push({
      code: 'INVALID_SAFETY_BUFFER',
      message:
        'Fee safety buffer must be a finite non-negative number.',
      asset: input.nativeAsset ?? DEFAULT_NATIVE_ASSET,
    });
  }

  return errors;
}

/* -------------------------------------------------------------------------- */
/* Balance Checks                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Check whether the account has enough of the transfer asset.
 */
export function checkTransferAssetBalance(
  input: StellarTransferBalanceInput,
): BalanceRequirement {
  const safetyBuffer =
    input.transferSafetyBuffer ??
    DEFAULT_TRANSFER_SAFETY_BUFFER;

  return createBalanceRequirement(
    input.transferAsset,
    input.transferAmount,
    input.availableTransferBalance,
    safetyBuffer,
  );
}

/**
 * Check whether the account has enough native asset to pay the
 * estimated network fee.
 */
export function checkNetworkFeeBalance(
  input: StellarTransferBalanceInput,
): BalanceRequirement {
  const nativeAsset =
    input.nativeAsset ?? DEFAULT_NATIVE_ASSET;

  const safetyBuffer =
    input.feeSafetyBuffer ??
    DEFAULT_FEE_SAFETY_BUFFER;

  return createBalanceRequirement(
    nativeAsset,
    input.estimatedNetworkFee,
    input.availableFeeBalance,
    safetyBuffer,
  );
}

/* -------------------------------------------------------------------------- */
/* Error Generation                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Convert balance requirements into actionable validation errors.
 */
export function createBalanceGuardErrors(
  transferBalance: BalanceRequirement,
  feeBalance: BalanceRequirement,
): BalanceGuardError[] {
  const errors: BalanceGuardError[] = [];

  if (!transferBalance.sufficient) {
    errors.push({
      code: 'INSUFFICIENT_TRANSFER_BALANCE',
      message:
        `Insufficient ${transferBalance.asset} balance: ` +
        `required ${transferBalance.totalRequired}, ` +
        `available ${transferBalance.available}, ` +
        `shortfall ${transferBalance.shortfall}.`,
      asset: transferBalance.asset,
      required: transferBalance.totalRequired,
      available: transferBalance.available,
      shortfall: transferBalance.shortfall,
    });
  }

  if (!feeBalance.sufficient) {
    errors.push({
      code: 'INSUFFICIENT_FEE_BALANCE',
      message:
        `Insufficient ${feeBalance.asset} balance for network fees: ` +
        `required ${feeBalance.totalRequired}, ` +
        `available ${feeBalance.available}, ` +
        `shortfall ${feeBalance.shortfall}.`,
      asset: feeBalance.asset,
      required: feeBalance.totalRequired,
      available: feeBalance.available,
      shortfall: feeBalance.shortfall,
    });
  }

  return errors;
}

/* -------------------------------------------------------------------------- */
/* Main Guard                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Validate whether a Stellar transfer has sufficient balances.
 *
 * The guard checks both:
 *
 * 1. The asset being transferred.
 * 2. The native asset required to pay network fees.
 *
 * Safety buffers are applied independently to both requirements.
 */
export function guardStellarTransferBalance(
  input: StellarTransferBalanceInput,
): StellarTransferBalanceResult {
  const inputErrors = validateBalanceGuardInput(input);

  /*
   * Return a deterministic result even for invalid input.
   * Invalid input is never allowed to proceed.
   */
  if (inputErrors.length > 0) {
    const transferBalance = createBalanceRequirement(
      input.transferAsset,
      isValidAmount(input.transferAmount)
        ? input.transferAmount
        : 0,
      isValidAmount(input.availableTransferBalance)
        ? input.availableTransferBalance
        : 0,
      isValidSafetyBuffer(
        input.transferSafetyBuffer ??
          DEFAULT_TRANSFER_SAFETY_BUFFER,
      )
        ? input.transferSafetyBuffer ??
          DEFAULT_TRANSFER_SAFETY_BUFFER
        : 0,
    );

    const feeBalance = createBalanceRequirement(
      input.nativeAsset ?? DEFAULT_NATIVE_ASSET,
      isValidAmount(input.estimatedNetworkFee)
        ? input.estimatedNetworkFee
        : 0,
      isValidAmount(input.availableFeeBalance)
        ? input.availableFeeBalance
        : 0,
      isValidSafetyBuffer(
        input.feeSafetyBuffer ??
          DEFAULT_FEE_SAFETY_BUFFER,
      )
        ? input.feeSafetyBuffer ??
          DEFAULT_FEE_SAFETY_BUFFER
        : 0,
    );

    return {
      allowed: false,
      transferBalance,
      feeBalance,
      errors: inputErrors,
    };
  }

  const transferBalance =
    checkTransferAssetBalance(input);

  const feeBalance =
    checkNetworkFeeBalance(input);

  const balanceErrors = createBalanceGuardErrors(
    transferBalance,
    feeBalance,
  );

  return {
    allowed: balanceErrors.length === 0,
    transferBalance,
    feeBalance,
    errors: balanceErrors,
  };
}

/* -------------------------------------------------------------------------- */
/* Convenience Helpers                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Returns true when the transfer can proceed.
 */
export function hasSufficientTransferBalance(
  input: StellarTransferBalanceInput,
): boolean {
  return guardStellarTransferBalance(input).allowed;
}

/**
 * Returns only the validation errors.
 */
export function getBalanceGuardErrors(
  input: StellarTransferBalanceInput,
): BalanceGuardError[] {
  return guardStellarTransferBalance(input).errors;
}

/**
 * Returns the total amount required for the transfer asset.
 */
export function getRequiredTransferAmount(
  input: StellarTransferBalanceInput,
): number {
  return checkTransferAssetBalance(input).totalRequired;
}

/**
 * Returns the total native asset required for network fees.
 */
export function getRequiredFeeAmount(
  input: StellarTransferBalanceInput,
): number {
  return checkNetworkFeeBalance(input).totalRequired;
}
```
