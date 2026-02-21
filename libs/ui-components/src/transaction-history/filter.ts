import type { BridgeTransaction, TransactionHistoryFilter } from './types';

export function filterTransactions(
  transactions: BridgeTransaction[],
  filter?: TransactionHistoryFilter,
): BridgeTransaction[] {
  if (!filter) {
    return transactions;
  }

  return transactions.filter((transaction) => {
    if (filter.chain) {
      const normalizedChain = filter.chain.toLowerCase();
      const sourceMatches = transaction.sourceChain.toLowerCase() === normalizedChain;
      const destinationMatches = transaction.destinationChain.toLowerCase() === normalizedChain;

      if (!sourceMatches && !destinationMatches) {
        return false;
      }
    }

    if (
      filter.bridgeName &&
      transaction.bridgeName.toLowerCase() !== filter.bridgeName.toLowerCase()
    ) {
      return false;
    }

    if (filter.status && transaction.status !== filter.status) {
      return false;
    }

    if (filter.startDate && transaction.timestamp < filter.startDate) {
      return false;
    }

    if (filter.endDate && transaction.timestamp > filter.endDate) {
      return false;
    }

    return true;
  });
}

export function sortTransactions(
  transactions: BridgeTransaction[],
  sortOrder: 'asc' | 'desc' = 'desc',
): BridgeTransaction[] {
  const copy = [...transactions];

  copy.sort((a, b) => {
    const left = a.timestamp.getTime();
    const right = b.timestamp.getTime();

    if (sortOrder === 'asc') {
      return left - right;
    }

    return right - left;
  });

  return copy;
}
