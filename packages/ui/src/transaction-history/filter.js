"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterTransactions = filterTransactions;
exports.sortTransactions = sortTransactions;
function filterTransactions(transactions, filter) {
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
        if (filter.bridgeName &&
            transaction.bridgeName.toLowerCase() !== filter.bridgeName.toLowerCase()) {
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
function sortTransactions(transactions, sortOrder = 'desc') {
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
//# sourceMappingURL=filter.js.map