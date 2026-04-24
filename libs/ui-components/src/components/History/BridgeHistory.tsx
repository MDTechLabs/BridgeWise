import React, { useState } from 'react';

export interface Transaction {
  id: string;
  fromChainId: number;
  toChainId: number;
  fromToken: string;
  toToken: string;
  amountIn: string;
  amountOut: string;
  timestamp: string;
  status: 'success' | 'failed' | 'pending';
  transactionHash?: string;
}

export interface BridgeHistoryProps {
  account: string;
  transactions?: Transaction[];
  onLoadMore?: () => void;
  hasMore?: boolean;
}

const STATUS_STYLES: Record<Transaction['status'], React.CSSProperties> = {
  success: { color: '#16a34a' },
  failed: { color: '#dc2626' },
  pending: { color: '#d97706' },
};

export const BridgeHistory: React.FC<BridgeHistoryProps> = ({
  transactions = [],
  onLoadMore,
  hasMore = false,
}) => {
  const [filter, setFilter] = useState<Transaction['status'] | 'all'>('all');

  const visible =
    filter === 'all' ? transactions : transactions.filter((t) => t.status === filter);

  if (transactions.length === 0) {
    return (
      <div role="status" aria-label="No transaction history">
        No transfer history.
      </div>
    );
  }

  return (
    <div>
      <h2>Transfer History</h2>

      <div role="group" aria-label="Filter by status">
        {(['all', 'success', 'pending', 'failed'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            aria-pressed={filter === s}
            style={{ marginRight: 8, fontWeight: filter === s ? 'bold' : 'normal' }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <table aria-label="Transaction history">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">From Chain</th>
            <th scope="col">To Chain</th>
            <th scope="col">From Token</th>
            <th scope="col">To Token</th>
            <th scope="col">Amount In</th>
            <th scope="col">Amount Out</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((tx) => (
            <tr key={tx.id}>
              <td>{new Date(tx.timestamp).toLocaleString()}</td>
              <td>{tx.fromChainId}</td>
              <td>{tx.toChainId}</td>
              <td>{tx.fromToken}</td>
              <td>{tx.toToken}</td>
              <td>{tx.amountIn}</td>
              <td>{tx.amountOut}</td>
              <td style={STATUS_STYLES[tx.status]}>{tx.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {hasMore && onLoadMore && (
        <button onClick={onLoadMore} style={{ marginTop: 8 }}>
          Load more
        </button>
      )}
    </div>
  );
};

export default BridgeHistory;
