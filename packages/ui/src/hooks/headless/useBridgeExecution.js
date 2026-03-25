"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useBridgeExecution = useBridgeExecution;
const react_1 = require("react");
function useBridgeExecution(options = {}) {
    const [status, setStatus] = (0, react_1.useState)('idle');
    const [progress, setProgress] = (0, react_1.useState)(0);
    const [step, setStep] = (0, react_1.useState)('');
    const [error, setError] = (0, react_1.useState)(null);
    const [txHash, setTxHash] = (0, react_1.useState)(null);
    const [details, setDetails] = (0, react_1.useState)(null);
    const pollingRef = (0, react_1.useRef)(null);
    const isPending = status === 'pending';
    const isConfirmed = status === 'confirmed';
    const isFailed = status === 'failed';
    const stop = (0, react_1.useCallback)(() => {
        if (pollingRef.current) {
            clearTimeout(pollingRef.current);
            pollingRef.current = null;
        }
    }, []);
    const start = (0, react_1.useCallback)((txParams) => {
        setStatus('pending');
        setProgress(0);
        setStep('Submitting transaction...');
        setError(null);
        setTxHash('0xMOCKHASH');
        setDetails({ ...txParams, started: true });
        // Simulate polling and status changes
        pollingRef.current = setTimeout(() => {
            setStatus('confirmed');
            setProgress(100);
            setStep('Transaction confirmed');
            setDetails((d) => ({ ...d, confirmed: true }));
            options.onStatusChange?.('confirmed', details);
            options.onConfirmed?.(details);
        }, 1500);
    }, [details, options]);
    const retry = (0, react_1.useCallback)(() => {
        if (details)
            start(details);
    }, [details, start]);
    return {
        status,
        progress,
        step,
        error,
        txHash,
        isPending,
        isConfirmed,
        isFailed,
        start,
        stop,
        retry,
        details,
    };
}
//# sourceMappingURL=useBridgeExecution.js.map