export type BridgeTransactionStatus = 'pending' | 'confirmed' | 'failed';

export interface BridgeTransaction {
  txHash: string;
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  sourceToken: string;
  destinationToken: string;
  amount: number;
  fee: number;
  slippagePercent: number;
  status: BridgeTransactionStatus;
  timestamp: Date;
  account: string;
}

export interface TransactionHistoryBackend {
  saveTransaction: (transaction: BridgeTransaction) => Promise<void>;
  getTransactionsByAccount: (account: string) => Promise<BridgeTransaction[]>;
}

export interface TransactionHistoryFilter {
  chain?: string;
  bridgeName?: string;
  status?: BridgeTransactionStatus;
  startDate?: Date;
  endDate?: Date;
}

export interface UseTransactionHistoryOptions {
  filter?: TransactionHistoryFilter;
  sortBy?: 'timestamp';
  sortOrder?: 'asc' | 'desc';
  includeBackend?: boolean;
}

export interface TransactionHistoryConfig {
  backend?: TransactionHistoryBackend;
  storageKey?: string;
  maxTransactionsPerAccount?: number;
}
