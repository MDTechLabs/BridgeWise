import type {
  BridgeTransaction,
  TransactionHistoryBackend,
  TransactionHistoryConfig,
} from './types';

const DEFAULT_STORAGE_KEY = 'bridgewise_transaction_history_v1';
const DEFAULT_MAX_TRANSACTIONS_PER_ACCOUNT = 200;

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

type StoredBridgeTransaction = Omit<BridgeTransaction, 'timestamp'> & { timestamp: string };

function getStorage(): StorageLike | null {
  const globalWithWindow = globalThis as {
    window?: { localStorage?: StorageLike };
    localStorage?: StorageLike;
  };

  try {
    return globalWithWindow.window?.localStorage ?? globalWithWindow.localStorage ?? null;
  } catch {
    return null;
  }
}

function toStoredTransaction(transaction: BridgeTransaction): StoredBridgeTransaction {
  return {
    ...transaction,
    timestamp: transaction.timestamp.toISOString(),
  };
}

function fromStoredTransaction(
  transaction: StoredBridgeTransaction | Partial<StoredBridgeTransaction>,
): BridgeTransaction {
  const now = new Date();
  const parsedTimestamp = transaction.timestamp ? new Date(transaction.timestamp) : now;

  return {
    txHash: transaction.txHash ?? `unknown-${now.getTime()}`,
    bridgeName: transaction.bridgeName ?? 'unknown',
    sourceChain: transaction.sourceChain ?? 'unknown',
    destinationChain: transaction.destinationChain ?? 'unknown',
    sourceToken: transaction.sourceToken ?? 'unknown',
    destinationToken: transaction.destinationToken ?? 'unknown',
    amount: typeof transaction.amount === 'number' && Number.isFinite(transaction.amount)
      ? transaction.amount
      : 0,
    fee: typeof transaction.fee === 'number' && Number.isFinite(transaction.fee) ? transaction.fee : 0,
    slippagePercent:
      typeof transaction.slippagePercent === 'number' && Number.isFinite(transaction.slippagePercent)
        ? transaction.slippagePercent
        : 0,
    status:
      transaction.status === 'pending' || transaction.status === 'confirmed' || transaction.status === 'failed'
        ? transaction.status
        : 'pending',
    timestamp: Number.isNaN(parsedTimestamp.getTime()) ? now : parsedTimestamp,
    account: transaction.account ?? 'unknown',
  };
}

export class TransactionHistoryStorage {
  private backend?: TransactionHistoryBackend;

  private storageKey: string;

  private maxTransactionsPerAccount: number;

  constructor(config?: TransactionHistoryConfig) {
    this.backend = config?.backend;
    this.storageKey = config?.storageKey ?? DEFAULT_STORAGE_KEY;
    this.maxTransactionsPerAccount =
      config?.maxTransactionsPerAccount ?? DEFAULT_MAX_TRANSACTIONS_PER_ACCOUNT;
  }

  async upsertTransaction(transaction: BridgeTransaction): Promise<void> {
    try {
      const transactions = this.getLocalTransactions();
      const next = this.upsert(transactions, transaction);
      this.saveLocalTransactions(next);
    } catch {
      // No-op fallback: local history unavailable
    }

    if (this.backend) {
      try {
        await this.backend.saveTransaction(transaction);
      } catch {
        // No-op fallback: backend history unavailable
      }
    }
  }

  async getTransactionsByAccount(
    account: string,
    options?: { includeBackend?: boolean },
  ): Promise<BridgeTransaction[]> {
    const local = this.getLocalTransactions().filter((tx) => tx.account === account);

    if (!options?.includeBackend || !this.backend) {
      return local;
    }

    try {
      const backendTransactions = await this.backend.getTransactionsByAccount(account);
      return this.merge(local, backendTransactions);
    } catch {
      return local;
    }
  }

  private merge(
    current: BridgeTransaction[],
    incoming: BridgeTransaction[],
  ): BridgeTransaction[] {
    let merged = [...current];
    for (const transaction of incoming) {
      merged = this.upsert(merged, transaction);
    }
    return merged;
  }

  private upsert(
    transactions: BridgeTransaction[],
    transaction: BridgeTransaction,
  ): BridgeTransaction[] {
    const key = `${transaction.account}:${transaction.txHash}`;
    const mapped = new Map<string, BridgeTransaction>();

    for (const item of transactions) {
      mapped.set(`${item.account}:${item.txHash}`, item);
    }

    mapped.set(key, transaction);

    const perAccount = new Map<string, BridgeTransaction[]>();
    for (const value of mapped.values()) {
      const list = perAccount.get(value.account) ?? [];
      list.push(value);
      perAccount.set(value.account, list);
    }

    const flattened: BridgeTransaction[] = [];
    for (const list of perAccount.values()) {
      list.sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());
      flattened.push(...list.slice(0, this.maxTransactionsPerAccount));
    }

    return flattened;
  }

  private getLocalTransactions(): BridgeTransaction[] {
    const storage = getStorage();
    if (!storage) {
      return [];
    }

    try {
      const raw = storage.getItem(this.storageKey);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw) as Array<StoredBridgeTransaction | Partial<StoredBridgeTransaction>>;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.map((transaction) => fromStoredTransaction(transaction));
    } catch {
      return [];
    }
  }

  private saveLocalTransactions(transactions: BridgeTransaction[]): void {
    const storage = getStorage();
    if (!storage) {
      return;
    }

    const serialized = JSON.stringify(transactions.map((tx) => toStoredTransaction(tx)));
    storage.setItem(this.storageKey, serialized);
  }
}

export interface HttpTransactionHistoryBackendConfig {
  baseUrl: string;
  fetcher?: typeof fetch;
  headers?: Record<string, string>;
}

export function createHttpTransactionHistoryBackend(
  config: HttpTransactionHistoryBackendConfig,
): TransactionHistoryBackend {
  const fetcher = config.fetcher ?? fetch;

  return {
    saveTransaction: async (transaction) => {
      await fetcher(`${config.baseUrl}/transactions/history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: JSON.stringify(transaction),
      });
    },
    getTransactionsByAccount: async (account) => {
      const response = await fetcher(
        `${config.baseUrl}/transactions/history?account=${encodeURIComponent(account)}`,
        {
          method: 'GET',
          headers: {
            ...config.headers,
          },
        },
      );

      if (!response.ok) {
        throw new Error('Failed to load transaction history');
      }

      const payload = (await response.json()) as Array<StoredBridgeTransaction | Partial<StoredBridgeTransaction>>;
      if (!Array.isArray(payload)) {
        return [];
      }

      return payload.map((transaction) => fromStoredTransaction(transaction));
    },
  };
}
