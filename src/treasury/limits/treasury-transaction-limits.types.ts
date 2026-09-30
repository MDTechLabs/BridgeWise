/**
 * File: src/treasury/limits/treasury-transaction-limits.types.ts
 *
 * Type definitions for treasury transaction limits.
 *
 * Treasury transaction limits cap how much value can move per asset — per
 * single transaction and cumulatively within a rolling time window — so that
 * a misconfiguration, bug, or compromised credential cannot drain the treasury
 * in one shot or a rapid burst.
 */

/** Per-asset limit policy. All amount fields are non-negative decimal strings. */
export interface AssetLimitPolicy {
  /** Asset symbol (e.g. USDC, XLM). Matched case-insensitively. */
  asset: string;
  /** Minimum amount for a single transaction (dust guard). Optional. */
  minPerTransaction?: string;
  /** Maximum amount for a single transaction. Optional. */
  maxPerTransaction?: string;
  /** Maximum cumulative amount within the rolling window. Optional. */
  maxPerWindow?: string;
  /** Maximum number of transactions within the rolling window. Optional. */
  maxCountPerWindow?: number;
  /** Rolling window length in ms. Falls back to the config default (24h). */
  windowMs?: number;
}

/** Service configuration. */
export interface TreasuryLimitsConfig {
  /** Per-asset policies. */
  policies: AssetLimitPolicy[];
  /** Default rolling-window length in ms when a policy omits one (default 24h). */
  defaultWindowMs?: number;
  /**
   * How to treat an asset that has no policy. Defaults to `true` (deny) — a
   * secure default that prevents moving unlisted assets by omission.
   */
  denyUnlistedAssets?: boolean;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

/** A treasury movement to evaluate against the limits. */
export interface TreasuryTransactionRequest {
  /** Asset symbol. */
  asset: string;
  /** Amount as a non-negative decimal string. */
  amount: string;
  /** Optional reference/id for audit trails. */
  reference?: string;
  /** Optional direction; recorded for audit, limits apply to all by default. */
  direction?: 'inbound' | 'outbound';
  /** Timestamp override (epoch ms). Defaults to the service clock. */
  timestamp?: number;
}

/** Stable machine-readable reasons a transaction can be denied. */
export type LimitViolationCode =
  | 'ASSET_NOT_ALLOWED'
  | 'INVALID_AMOUNT'
  | 'BELOW_MIN_PER_TRANSACTION'
  | 'EXCEEDS_MAX_PER_TRANSACTION'
  | 'EXCEEDS_WINDOW_AMOUNT'
  | 'EXCEEDS_WINDOW_COUNT';

/** A single limit violation. */
export interface LimitViolation {
  code: LimitViolationCode;
  message: string;
  /** The configured limit that was breached, when applicable. */
  limit?: string;
  /** The observed value that breached it (including the pending amount). */
  observed?: string;
}

/** Result of evaluating a transaction against the limits. */
export interface LimitCheckResult {
  allowed: boolean;
  asset: string;
  amount: string;
  /** All applicable violations, in deterministic order (empty when allowed). */
  violations: LimitViolation[];
  /** Remaining window amount capacity after this tx, or null when uncapped. */
  remainingWindowAmount: string | null;
  /** Remaining window transaction count after this tx, or null when uncapped. */
  remainingWindowCount: number | null;
  checkedAt: number;
}

/** Current rolling-window usage for an asset. */
export interface AssetLimitUsage {
  asset: string;
  windowMs: number;
  /** Cumulative amount recorded within the current window. */
  usedAmount: string;
  /** Number of transactions recorded within the current window. */
  usedCount: number;
  /** Remaining amount before the window cap, or null when uncapped. */
  remainingAmount: string | null;
  /** Remaining count before the window cap, or null when uncapped. */
  remainingCount: number | null;
}
