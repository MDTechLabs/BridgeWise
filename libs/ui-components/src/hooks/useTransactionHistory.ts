'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { filterTransactions, sortTransactions } from '../transaction-history/filter';
import { TransactionHistoryStorage } from '../transaction-history/storage';
import type {
  BridgeTransaction,
  TransactionHistoryConfig,
  UseTransactionHistoryOptions,
} from '../transaction-history/types';

export interface UseTransactionHistoryHookResult {
  transactions: BridgeTransaction[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useTransactionHistory(
  account: string,
  options?: UseTransactionHistoryOptions,
  config?: TransactionHistoryConfig,
): UseTransactionHistoryHookResult {
  const [allTransactions, setAllTransactions] = useState<BridgeTransaction[]>([]);
  const [loading, setLoading] = useState(false);

  const storage = useMemo(() => new TransactionHistoryStorage(config), [config]);

  const refresh = useCallback(async () => {
    if (!account || typeof window === 'undefined') {
      setAllTransactions([]);
      return;
    }

    setLoading(true);
    try {
      const data = await storage.getTransactionsByAccount(account, {
        includeBackend: options?.includeBackend,
      });
      setAllTransactions(data);
    } finally {
      setLoading(false);
    }
  }, [account, options?.includeBackend, storage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const transactions = useMemo(() => {
    const filtered = filterTransactions(allTransactions, options?.filter);
    return sortTransactions(filtered, options?.sortOrder ?? 'desc');
  }, [allTransactions, options?.filter, options?.sortOrder]);

  return {
    transactions,
    loading,
    refresh,
  };
}
