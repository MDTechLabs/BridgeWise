export enum TransactionOutcome {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  TIMEOUT = 'TIMEOUT',
  CANCELLED = 'CANCELLED', // excluded from reliability calc
}

export enum ReliabilityTier {
  HIGH = 'HIGH', // >= 95%
  MEDIUM = 'MEDIUM', // 85-94%
  LOW = 'LOW', // < 85%
}

export enum WindowMode {
  TRANSACTION_COUNT = 'TRANSACTION_COUNT', // last N transactions
  TIME_BASED = 'TIME_BASED', // last N days
}
