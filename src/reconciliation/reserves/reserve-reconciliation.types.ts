/**
 * File: src/reconciliation/reserves/reserve-reconciliation.types.ts
 *
 * Type definitions for reserve reconciliation.
 *
 * Reserve reconciliation compares the reserves the system *believes* it holds
 * (expected / book balances) against the reserves that are *actually* reported
 * on-chain or by custodians, per asset. Any shortfall is a security-critical
 * signal: it means the bridge/treasury may be under-collateralized.
 */

/** A reported reserve balance, e.g. an on-chain or custodian-held balance. */
export interface ReserveBalance {
  /** Asset symbol (e.g. USDC, XLM). Matched case-insensitively. */
  asset: string;
  /** Reported amount as a non-negative decimal string (precision-preserving). */
  amount: string;
  /** Optional origin of the figure (e.g. 'stellar-ledger', 'custodian-a'). */
  source?: string;
  /** Optional account/custodian identifier when reserves are split. */
  account?: string;
  /** Optional timestamp (epoch ms) the balance was observed. */
  asOf?: number;
}

/** The expected (book / accounting) reserve balance for an asset. */
export interface ExpectedReserve {
  /** Asset symbol (e.g. USDC, XLM). Matched case-insensitively. */
  asset: string;
  /** Expected amount as a non-negative decimal string. */
  amount: string;
  /** Optional origin of the figure (e.g. 'ledger-db'). */
  source?: string;
  /** Optional timestamp (epoch ms) the expectation was computed. */
  asOf?: number;
}

/** Tolerance applied before a difference is treated as a real discrepancy. */
export interface ReserveTolerance {
  /**
   * Absolute tolerance as a non-negative decimal string. A difference whose
   * magnitude is within this band is considered balanced. Defaults to '0'
   * (exact match) — a secure default that surfaces every discrepancy.
   */
  absolute?: string;
  /**
   * Relative tolerance in basis points of the expected amount (100 bps = 1%).
   * The effective tolerance is the larger of the absolute band and this
   * relative band. Defaults to 0.
   */
  relativeBps?: number;
}

/** Per-asset reconciliation status. */
export type ReserveReconciliationStatus =
  /** Reported matches expected within tolerance. */
  | 'BALANCED'
  /** Reported exceeds expected beyond tolerance. */
  | 'SURPLUS'
  /** Reported is below expected beyond tolerance — under-collateralized. */
  | 'SHORTFALL'
  /** Expected reserve exists but nothing was reported for the asset. */
  | 'MISSING_REPORTED'
  /** Reported reserve exists but there is no expected figure to check it. */
  | 'MISSING_EXPECTED'
  /** One of the inputs was malformed and could not be reconciled. */
  | 'INVALID_DATA';

/** Reconciliation outcome for a single asset. */
export interface AssetReconciliation {
  asset: string;
  /** Aggregated reported amount, or null when nothing was reported. */
  reported: string | null;
  /** Aggregated expected amount, or null when nothing was expected. */
  expected: string | null;
  /** `reported - expected` as a signed decimal string, or null. */
  difference: string | null;
  /** `abs(difference) / expected` as a fraction, or null when not computable. */
  relativeDifference: number | null;
  status: ReserveReconciliationStatus;
  /** True when the asset is balanced within the applied tolerance. */
  withinTolerance: boolean;
  /** Human-readable explanation for logs/UI. */
  message: string;
}

/** Aggregated reserve reconciliation report. */
export interface ReserveReconciliationReport {
  reconciledAt: number;
  /** True only when every asset is within tolerance. */
  balanced: boolean;
  /** Per-asset results, ordered deterministically by asset. */
  assets: AssetReconciliation[];
  /** The shortfall subset — the security-critical results to alert on. */
  shortfalls: AssetReconciliation[];
  /** The tolerance that was actually applied after defaults were merged. */
  appliedTolerance: Required<ReserveTolerance>;
  summary: {
    total: number;
    balanced: number;
    surplus: number;
    shortfall: number;
    missing: number;
    invalid: number;
  };
}

/** Inputs to a single reconciliation run. */
export interface ReserveReconciliationInput {
  /** Reported balances (may include several accounts per asset). */
  reported: ReserveBalance[];
  /** Expected balances (one book figure per asset). */
  expected: ExpectedReserve[];
  /** Optional per-run tolerance override. */
  tolerance?: ReserveTolerance;
}
