'use client';
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTransactionHistory = useTransactionHistory;
const react_1 = require("react");
const filter_1 = require("../transaction-history/filter");
const storage_1 = require("../transaction-history/storage");
function useTransactionHistory(account, options, config) {
    const [allTransactions, setAllTransactions] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(false);
    const storage = (0, react_1.useMemo)(() => new storage_1.TransactionHistoryStorage(config), [config]);
    const refresh = (0, react_1.useCallback)(async () => {
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
        }
        finally {
            setLoading(false);
        }
    }, [account, options?.includeBackend, storage]);
    (0, react_1.useEffect)(() => {
        void refresh();
    }, [refresh]);
    const transactions = (0, react_1.useMemo)(() => {
        const filtered = (0, filter_1.filterTransactions)(allTransactions, options?.filter);
        return (0, filter_1.sortTransactions)(filtered, options?.sortOrder ?? 'desc');
    }, [allTransactions, options?.filter, options?.sortOrder]);
    return {
        transactions,
        loading,
        refresh,
    };
}
//# sourceMappingURL=useTransactionHistory.js.map