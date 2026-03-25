"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTransactionRetry = useTransactionRetry;
const react_1 = require("react");
function useTransactionRetry(transaction, retryService) {
    const [retrying, setRetrying] = (0, react_1.useState)(false);
    const [retryResult, setRetryResult] = (0, react_1.useState)(null);
    const [logs, setLogs] = (0, react_1.useState)([]);
    const retry = (0, react_1.useCallback)(async () => {
        setRetrying(true);
        const result = await retryService.retryTransaction(transaction);
        setRetryResult(result);
        setRetrying(false);
        setLogs(retryService.getRetryLogs(transaction.id));
    }, [transaction, retryService]);
    (0, react_1.useEffect)(() => {
        setLogs(retryService.getRetryLogs(transaction.id));
    }, [transaction, retryService]);
    return {
        retrying,
        retryResult,
        logs,
        retry,
    };
}
//# sourceMappingURL=useTransactionRetry.js.map