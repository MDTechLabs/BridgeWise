import { Injectable, Logger } from '@nestjs/common';

export enum FailureCategory {
  /** Transient — safe to retry automatically. */
  RETRYABLE = 'RETRYABLE',
  /** Permanent — retrying will not help. */
  PERMANENT = 'PERMANENT',
  /** Requires the user to take action (e.g. re-sign, add funds). */
  USER_ACTION = 'USER_ACTION',
  /** Not recognized. */
  UNKNOWN = 'UNKNOWN',
}

export interface TransactionFailure {
  /** Machine-readable failure code (e.g. a Soroban/host error code). */
  code?: string;
  message?: string;
}

export interface RecoveryClassification {
  category: FailureCategory;
  retryable: boolean;
  recommendation: string;
}

const RETRYABLE_CODES = new Set([
  'txTooLate',
  'txBadSeq',
  'RESOURCE_LIMIT_EXCEEDED',
  'rpc_timeout',
  'network_error',
  'ledger_capacity',
]);

const PERMANENT_CODES = new Set([
  'txNoAccount',
  'txMalformed',
  'contract_not_found',
  'invalid_contract',
  'txFailed',
]);

const USER_ACTION_CODES = new Set([
  'txInsufficientBalance',
  'txBadAuth',
  'authorization_required',
  'trustline_missing',
]);

const RETRYABLE_PATTERNS = [/timeout/i, /temporar/i, /unavailable/i, /rate.?limit/i, /again/i];
const USER_ACTION_PATTERNS = [/insufficient/i, /balance/i, /authoriz/i, /signature/i, /trustline/i];
const PERMANENT_PATTERNS = [/not found/i, /malformed/i, /invalid/i];

/**
 * Classifies failed Soroban transactions by recovery strategy so the recovery
 * pipeline knows whether to retry automatically, surface a user action, or give
 * up. Classification is driven by known error codes first, then message
 * heuristics.
 */
@Injectable()
export class RecoveryClassifierService {
  private readonly logger = new Logger(RecoveryClassifierService.name);

  classify(failure: TransactionFailure): RecoveryClassification {
    const category = this.categorize(failure);
    return {
      category,
      retryable: category === FailureCategory.RETRYABLE,
      recommendation: this.recommend(category),
    };
  }

  private categorize(failure: TransactionFailure): FailureCategory {
    const code = failure.code;
    if (code) {
      if (RETRYABLE_CODES.has(code)) return FailureCategory.RETRYABLE;
      if (PERMANENT_CODES.has(code)) return FailureCategory.PERMANENT;
      if (USER_ACTION_CODES.has(code)) return FailureCategory.USER_ACTION;
    }
    const message = failure.message ?? '';
    if (message) {
      if (USER_ACTION_PATTERNS.some((p) => p.test(message))) return FailureCategory.USER_ACTION;
      if (RETRYABLE_PATTERNS.some((p) => p.test(message))) return FailureCategory.RETRYABLE;
      if (PERMANENT_PATTERNS.some((p) => p.test(message))) return FailureCategory.PERMANENT;
    }
    return FailureCategory.UNKNOWN;
  }

  private recommend(category: FailureCategory): string {
    switch (category) {
      case FailureCategory.RETRYABLE:
        return 'Retry the transaction with backoff.';
      case FailureCategory.PERMANENT:
        return 'Do not retry; fail the transfer and report the error.';
      case FailureCategory.USER_ACTION:
        return 'Prompt the user to resolve the issue (funds/authorization) and resubmit.';
      default:
        return 'Manual review required; failure could not be classified.';
    }
  }
}
