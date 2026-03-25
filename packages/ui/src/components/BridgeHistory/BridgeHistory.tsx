'use client';

import React from 'react';
import { useTransactionHistory } from '../../hooks/useTransactionHistory';
import type {
  BridgeTransactionStatus,
  TransactionHistoryConfig,
  TransactionHistoryFilter,
} from '../../transaction-history/types';

export interface BridgeHistoryProps {
  account: string;
  chain?: string;
  bridgeName?: string;
  status?: BridgeTransactionStatus;
  startDate?: Date;
  endDate?: Date;
  sortOrder?: 'asc' | 'desc';
  includeBackend?: boolean;
  historyConfig?: TransactionHistoryConfig;
  emptyStateMessage?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const BridgeHistory: React.FC<BridgeHistoryProps> = ({
  account,
  chain,
  bridgeName,
  status,
  startDate,
  endDate,
  sortOrder = 'desc',
  includeBackend = false,
  historyConfig,
  emptyStateMessage = 'No transactions found for this account.',
  className,
  style,
}) => {
  const filter: TransactionHistoryFilter = {
    chain,
    bridgeName,
    status,
    startDate,
    endDate,
  };

  const { transactions, loading } = useTransactionHistory(
    account,
    {
      filter,
      sortOrder,
      includeBackend,
    },
    historyConfig,
  );

  return (
    <div className={className} style={style}>
      {!account && <p>Connect a wallet to view transaction history.</p>}

      {account && loading && <p>Loading transaction history...</p>}

      {account && !loading && transactions.length === 0 && <p>{emptyStateMessage}</p>}

      {account && !loading && transactions.length > 0 && (
        <>
          <h3>Bridge History</h3>
          <ul>
            {transactions.map((transaction) => (
              <li key={`${transaction.account}:${transaction.txHash}`}>
                <strong>{transaction.bridgeName}</strong> • {transaction.sourceChain} →{' '}
                {transaction.destinationChain} • {transaction.amount} {transaction.sourceToken} •{' '}
                {transaction.status} • {transaction.timestamp.toLocaleString()}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};
