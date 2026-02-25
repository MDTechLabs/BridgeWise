import { useCallback, useEffect, useState } from 'react';
import { TransactionRetryService } from './transaction-retry.service';
import { Transaction } from '../entities/transaction.entity';

export function useTransactionRetry(transaction: Transaction, retryService: TransactionRetryService) {
  const [retrying, setRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<Transaction | null>(null);
  const [logs, setLogs] = useState([]);

  const retry = useCallback(async () => {
    setRetrying(true);
    const result = await retryService.retryTransaction(transaction);
    setRetryResult(result);
    setRetrying(false);
    setLogs(retryService.getRetryLogs(transaction.id));
  }, [transaction, retryService]);

  useEffect(() => {
    setLogs(retryService.getRetryLogs(transaction.id));
  }, [transaction, retryService]);

  return {
    retrying,
    retryResult,
    logs,
    retry,
  };
}
