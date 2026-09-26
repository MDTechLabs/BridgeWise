export type StellarFailureCode =
  | 'INSUFFICIENT_FUNDS'
  | 'ACCOUNT_NOT_FOUND'
  | 'SEQUENCE_MISMATCH'
  | 'TRANSACTION_EXPIRED'
  | 'SOROBAN_INVOCATION_FAILED'
  | 'CONTRACT_NOT_FOUND'
  | 'INSUFFICIENT_FEE'
  | 'RATE_LIMIT_EXCEEDED'
  | 'NETWORK_UNAVAILABLE'
  | 'UNKNOWN';

export type FailureCategory =
  | 'INSUFFICIENT_LIQUIDITY'
  | 'ACCOUNT_ISSUE'
  | 'TRANSIENT'
  | 'CONTRACT_ERROR'
  | 'NETWORK_ISSUE'
  | 'UNCLASSIFIED';

export const FAILURE_CATEGORIES: FailureCategory[] = [
  'INSUFFICIENT_LIQUIDITY',
  'ACCOUNT_ISSUE',
  'TRANSIENT',
  'CONTRACT_ERROR',
  'NETWORK_ISSUE',
  'UNCLASSIFIED',
];

export interface FailureInput {
  code: string;
  severity?: string;
  retryable?: boolean;
  title?: string;
  message?: string;
  transactionHash?: string;
  timestamp?: number;
}

export interface ClassifiedFailure {
  failureCode: string;
  category: FailureCategory;
  severity: string;
  retryable: boolean;
  title: string;
  message: string;
  timestamp: number;
  transactionHash?: string;
}

export interface FailureSummary {
  totalFailures: number;
  categoryBreakdown: Record<FailureCategory, number>;
  retryableCount: number;
  nonRetryableCount: number;
  timeRange: {
    start: number;
    end: number;
  };
  topCategory: FailureCategory;
  recentFailures: ClassifiedFailure[];
}
