import { FailureCategory, FailureInput, ClassifiedFailure } from './types';

const CATEGORY_MAP: Record<string, FailureCategory> = {
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_LIQUIDITY',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_ISSUE',
  SEQUENCE_MISMATCH: 'TRANSIENT',
  TRANSACTION_EXPIRED: 'TRANSIENT',
  SOROBAN_INVOCATION_FAILED: 'CONTRACT_ERROR',
  CONTRACT_NOT_FOUND: 'CONTRACT_ERROR',
  INSUFFICIENT_FEE: 'TRANSIENT',
  RATE_LIMIT_EXCEEDED: 'NETWORK_ISSUE',
  NETWORK_UNAVAILABLE: 'NETWORK_ISSUE',
  UNKNOWN: 'UNCLASSIFIED',
};

export function classifyFailure(input: FailureInput): ClassifiedFailure {
  return {
    failureCode: input.code,
    category: CATEGORY_MAP[input.code] ?? 'UNCLASSIFIED',
    severity: input.severity ?? 'medium',
    retryable: input.retryable ?? false,
    title: input.title ?? 'Unknown Failure',
    message: input.message ?? '',
    timestamp: input.timestamp ?? Date.now(),
    transactionHash: input.transactionHash,
  };
}

export function classifyFailures(inputs: FailureInput[]): ClassifiedFailure[] {
  return inputs.map(classifyFailure);
}
