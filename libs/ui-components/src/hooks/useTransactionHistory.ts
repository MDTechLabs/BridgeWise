import { useState, useCallback } from 'react';
import type { Transaction } from '../components/History/BridgeHistory';

export interface UseTransactionHistoryOptions {
  filter?: { status?: Transaction['status'] };
  sortOrder?: 'asc' | 'desc';
}

export interface UseTransactionHistoryReturn {
  transactions: Transaction[];
  addTransaction: (tx: Transaction) => void;
  updateStatus: (id: string, status: Transaction['status']) => void;
  clearHistory: () => void;
}

export function useTransactionHistory(
  _account: string,
  options: UseTransactionHistoryOptions = {},
): UseTransactionHistoryReturn {
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const addTransaction = useCallback((tx: Transaction) => {
    setTransactions((prev) => [tx, ...prev]);
  }, []);

  const updateStatus = useCallback(
    (id: string, status: Transaction['status']) => {
      setTransactions((prev) =>
        prev.map((tx) => (tx.id === id ? { ...tx, status } : tx)),
      );
    },
    [],
  );

  const clearHistory = useCallback(() => setTransactions([]), []);

  const { filter, sortOrder = 'desc' } = options;

  let result = filter?.status
    ? transactions.filter((tx) => tx.status === filter.status)
    : transactions;

  result = [...result].sort((a, b) => {
    const diff =
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    return sortOrder === 'desc' ? -diff : diff;
  });

  return { transactions: result, addTransaction, updateStatus, clearHistory };
}
