/**
 * File: src/treasury/limits/treasury-transaction-limits.service.ts
 *
 * Treasury transaction limits service.
 *
 * Enforces per-asset limits on treasury movements:
 *   - a minimum and maximum amount per single transaction,
 *   - a maximum cumulative amount within a rolling time window,
 *   - a maximum transaction count within that window.
 *
 * The service keeps an in-memory rolling ledger per asset. `check()` evaluates
 * a request without side effects; `record()` commits an accepted movement;
 * `apply()` does both atomically. Old entries outside the window are pruned on
 * every evaluation so window usage always reflects the current window.
 *
 * Secure defaults: assets without a policy are denied by default, and a
 * malformed amount is rejected rather than treated as zero.
 */

import {
  addAmounts,
  compareAmounts,
  isValidAmount,
  subtractClampedAmounts,
} from './decimal';
import type {
  AssetLimitPolicy,
  AssetLimitUsage,
  LimitCheckResult,
  LimitViolation,
  TreasuryLimitsConfig,
  TreasuryTransactionRequest,
} from './treasury-transaction-limits.types';

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

interface LedgerEntry {
  timestamp: number;
  amount: string;
}

export class TreasuryTransactionLimitsService {
  private readonly policies = new Map<string, AssetLimitPolicy>();
  private readonly ledger = new Map<string, LedgerEntry[]>();
  private readonly defaultWindowMs: number;
  private readonly denyUnlistedAssets: boolean;
  private readonly now: () => number;

  constructor(config: TreasuryLimitsConfig) {
    this.now = config.now ?? (() => Date.now());
    this.defaultWindowMs = config.defaultWindowMs ?? DEFAULT_WINDOW_MS;
    this.denyUnlistedAssets = config.denyUnlistedAssets ?? true;

    for (const policy of config.policies ?? []) {
      this.policies.set(normalizeAsset(policy.asset), policy);
    }
  }

  /**
   * Evaluate a transaction against the limits without recording it.
   * Deterministic and side-effect free.
   */
  check(request: TreasuryTransactionRequest): LimitCheckResult {
    const asset = normalizeAsset(request.asset);
    const at = request.timestamp ?? this.now();
    const violations: LimitViolation[] = [];

    if (!isValidAmount(request.amount)) {
      violations.push({
        code: 'INVALID_AMOUNT',
        message: 'amount must be a finite non-negative decimal string',
        observed: String(request.amount),
      });
      return this.result(request, violations, null, null, at);
    }

    const policy = this.policies.get(asset);
    if (!policy) {
      if (this.denyUnlistedAssets) {
        violations.push({
          code: 'ASSET_NOT_ALLOWED',
          message: `asset "${request.asset}" has no treasury limit policy and is denied by default`,
        });
      }
      return this.result(request, violations, null, null, at);
    }

    // Per-transaction bounds.
    if (policy.minPerTransaction && isValidAmount(policy.minPerTransaction)) {
      if (compareAmounts(request.amount, policy.minPerTransaction) < 0) {
        violations.push({
          code: 'BELOW_MIN_PER_TRANSACTION',
          message: `amount ${request.amount} is below the minimum ${policy.minPerTransaction}`,
          limit: policy.minPerTransaction,
          observed: request.amount,
        });
      }
    }
    if (policy.maxPerTransaction && isValidAmount(policy.maxPerTransaction)) {
      if (compareAmounts(request.amount, policy.maxPerTransaction) > 0) {
        violations.push({
          code: 'EXCEEDS_MAX_PER_TRANSACTION',
          message: `amount ${request.amount} exceeds the per-transaction maximum ${policy.maxPerTransaction}`,
          limit: policy.maxPerTransaction,
          observed: request.amount,
        });
      }
    }

    // Rolling-window usage (excludes the pending transaction).
    const windowMs = policy.windowMs ?? this.defaultWindowMs;
    const entries = this.entriesWithinWindow(asset, at, windowMs);
    const usedAmount = entries.reduce((sum, e) => addAmounts(sum, e.amount), '0');
    const projectedAmount = addAmounts(usedAmount, request.amount);
    const usedCount = entries.length;

    let remainingWindowAmount: string | null = null;
    if (policy.maxPerWindow && isValidAmount(policy.maxPerWindow)) {
      if (compareAmounts(projectedAmount, policy.maxPerWindow) > 0) {
        violations.push({
          code: 'EXCEEDS_WINDOW_AMOUNT',
          message:
            `window total ${projectedAmount} (used ${usedAmount} + ${request.amount}) ` +
            `exceeds the window maximum ${policy.maxPerWindow}`,
          limit: policy.maxPerWindow,
          observed: projectedAmount,
        });
      }
      remainingWindowAmount = subtractClampedAmounts(policy.maxPerWindow, projectedAmount);
    }

    let remainingWindowCount: number | null = null;
    if (typeof policy.maxCountPerWindow === 'number') {
      if (usedCount + 1 > policy.maxCountPerWindow) {
        violations.push({
          code: 'EXCEEDS_WINDOW_COUNT',
          message:
            `window count ${usedCount + 1} exceeds the maximum ${policy.maxCountPerWindow} ` +
            `transactions per window`,
          limit: String(policy.maxCountPerWindow),
          observed: String(usedCount + 1),
        });
      }
      remainingWindowCount = Math.max(0, policy.maxCountPerWindow - (usedCount + 1));
    }

    return this.result(request, violations, remainingWindowAmount, remainingWindowCount, at);
  }

  /**
   * Record an accepted transaction against the rolling ledger. Callers that
   * enforce limits themselves can use this after their own gate; most callers
   * should prefer {@link apply}.
   */
  record(request: TreasuryTransactionRequest): void {
    if (!isValidAmount(request.amount)) return;
    const asset = normalizeAsset(request.asset);
    const at = request.timestamp ?? this.now();
    const entries = this.ledger.get(asset) ?? [];
    entries.push({ timestamp: at, amount: request.amount });
    this.ledger.set(asset, entries);
  }

  /**
   * Check the transaction and, only if it is allowed, record it. Returns the
   * check result. This is the atomic entry point most callers want.
   */
  apply(request: TreasuryTransactionRequest): LimitCheckResult {
    const result = this.check(request);
    if (result.allowed) {
      this.record(request);
    }
    return result;
  }

  /** Current rolling-window usage for an asset. */
  getUsage(asset: string, at: number = this.now()): AssetLimitUsage {
    const norm = normalizeAsset(asset);
    const policy = this.policies.get(norm);
    const windowMs = policy?.windowMs ?? this.defaultWindowMs;
    const entries = this.entriesWithinWindow(norm, at, windowMs);
    const usedAmount = entries.reduce((sum, e) => addAmounts(sum, e.amount), '0');
    const usedCount = entries.length;

    const remainingAmount =
      policy?.maxPerWindow && isValidAmount(policy.maxPerWindow)
        ? subtractClampedAmounts(policy.maxPerWindow, usedAmount)
        : null;
    const remainingCount =
      typeof policy?.maxCountPerWindow === 'number'
        ? Math.max(0, policy.maxCountPerWindow - usedCount)
        : null;

    return { asset: norm, windowMs, usedAmount, usedCount, remainingAmount, remainingCount };
  }

  /** Clear all recorded usage (e.g. between test cases or on operator reset). */
  reset(asset?: string): void {
    if (asset) {
      this.ledger.delete(normalizeAsset(asset));
    } else {
      this.ledger.clear();
    }
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private entriesWithinWindow(asset: string, at: number, windowMs: number): LedgerEntry[] {
    const cutoff = at - windowMs;
    const kept = (this.ledger.get(asset) ?? []).filter((e) => e.timestamp > cutoff);
    // Prune eagerly so the ledger does not grow unbounded.
    if (kept.length > 0) {
      this.ledger.set(asset, kept);
    } else {
      this.ledger.delete(asset);
    }
    return kept;
  }

  private result(
    request: TreasuryTransactionRequest,
    violations: LimitViolation[],
    remainingWindowAmount: string | null,
    remainingWindowCount: number | null,
    checkedAt: number,
  ): LimitCheckResult {
    return {
      allowed: violations.length === 0,
      asset: request.asset,
      amount: request.amount,
      violations,
      remainingWindowAmount,
      remainingWindowCount,
      checkedAt,
    };
  }
}

/** Normalize an asset symbol for policy/ledger keys (trim + upper-case). */
function normalizeAsset(asset: string): string {
  return String(asset ?? '').trim().toUpperCase();
}
