'use client';
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeHistory = void 0;
const react_1 = __importDefault(require("react"));
const useTransactionHistory_1 = require("../../hooks/useTransactionHistory");
const BridgeHistory = ({ account, chain, bridgeName, status, startDate, endDate, sortOrder = 'desc', includeBackend = false, historyConfig, emptyStateMessage = 'No transactions found for this account.', className, style, }) => {
    const filter = {
        chain,
        bridgeName,
        status,
        startDate,
        endDate,
    };
    const { transactions, loading } = (0, useTransactionHistory_1.useTransactionHistory)(account, {
        filter,
        sortOrder,
        includeBackend,
    }, historyConfig);
    return (<div className={className} style={style}>
      {!account && <p>Connect a wallet to view transaction history.</p>}

      {account && loading && <p>Loading transaction history...</p>}

      {account && !loading && transactions.length === 0 && <p>{emptyStateMessage}</p>}

      {account && !loading && transactions.length > 0 && (<>
          <h3>Bridge History</h3>
          <ul>
            {transactions.map((transaction) => (<li key={`${transaction.account}:${transaction.txHash}`}>
                <strong>{transaction.bridgeName}</strong> • {transaction.sourceChain} →{' '}
                {transaction.destinationChain} • {transaction.amount} {transaction.sourceToken} •{' '}
                {transaction.status} • {transaction.timestamp.toLocaleString()}
              </li>))}
          </ul>
        </>)}
    </div>);
};
exports.BridgeHistory = BridgeHistory;
//# sourceMappingURL=BridgeHistory.js.map