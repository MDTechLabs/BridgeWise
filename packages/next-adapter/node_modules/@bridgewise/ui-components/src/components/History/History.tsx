import React from 'react';

interface Transfer {
  id: string;
  fromChainId: number;
  toChainId: number;
  fromToken: string;
  toToken: string;
  amountIn: string;
  amountOut: string;
  timestamp: string;
  status: 'success' | 'failed' | 'pending';
}

interface HistoryProps {
  transfers: Transfer[];
}

const History: React.FC<HistoryProps> = ({ transfers }) => {
  if (transfers.length === 0) {
    return <div>No transfer history.</div>;
  }

  return (
    <div>
      <h2>Transfer History</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>From Chain</th>
            <th>To Chain</th>
            <th>From Token</th>
            <th>To Token</th>
            <th>Amount In</th>
            <th>Amount Out</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((transfer) => (
            <tr key={transfer.id}>
              <td>{new Date(transfer.timestamp).toLocaleString()}</td>
              <td>{transfer.fromChainId}</td>
              <td>{transfer.toChainId}</td>
              <td>{transfer.fromToken}</td>
              <td>{transfer.toToken}</td>
              <td>{transfer.amountIn}</td>
              <td>{transfer.amountOut}</td>
              <td>{transfer.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default History;
