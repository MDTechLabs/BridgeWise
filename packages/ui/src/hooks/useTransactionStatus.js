'use client';
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTransactionStatus = useTransactionStatus;
const react_1 = require("react");
const storage_1 = require("../transaction-history/storage");
const DEFAULT_POLL_INTERVAL = 5000;
/**
 * Hook for tracking the real-time status of a transaction by its ID/Hash.
 * It attempts to open an EventSource connection to `/transactions/:id/events`
 * and falls back to polling `/transactions/:id/poll` if SSE fails or is not available.
 *
 * The hook is SSR-safe (will do nothing during server rendering).
 */
function useTransactionStatus(txId, options = {}) {
    const [status, setStatus] = (0, react_1.useState)(null);
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)(undefined);
    const [lastUpdate, setLastUpdate] = (0, react_1.useState)(null);
    const eventSourceRef = (0, react_1.useRef)(null);
    const pollingRef = (0, react_1.useRef)(null);
    const historyStorageRef = (0, react_1.useRef)(null);
    // lazily initialise history storage if needed
    (0, react_1.useEffect)(() => {
        if (options.historyConfig) {
            historyStorageRef.current = new storage_1.TransactionHistoryStorage(options.historyConfig);
        }
    }, [options.historyConfig]);
    (0, react_1.useEffect)(() => {
        if (!txId || typeof window === 'undefined') {
            return;
        }
        let active = true;
        setLoading(true);
        const notify = (newStatus) => {
            options.onStatusChange?.(newStatus);
            if (options.notifications) {
                if (typeof options.notifications === 'function') {
                    options.notifications(newStatus);
                }
                else if (typeof Notification !== 'undefined') {
                    if (Notification.permission === 'granted') {
                        new Notification(`Transaction status: ${newStatus}`);
                    }
                    else if (Notification.permission !== 'denied') {
                        Notification.requestPermission().then((perm) => {
                            if (perm === 'granted') {
                                new Notification(`Transaction status: ${newStatus}`);
                            }
                        });
                    }
                }
            }
            // update history if config supplied
            if (historyStorageRef.current && options.account) {
                const record = {
                    txHash: txId,
                    status: newStatus,
                    timestamp: new Date(),
                    account: options.account,
                    // other fields unknown; history storage will fill defaults
                };
                historyStorageRef.current.upsertTransaction(record).catch(() => {
                    /* swallow */
                });
            }
        };
        const handleMessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data && data.status) {
                    // guard against unexpected status values; default to pending
                    const candidate = data.status;
                    const allowed = ['pending', 'confirmed', 'failed'];
                    const newStatus = allowed.includes(candidate)
                        ? candidate
                        : 'pending';
                    setStatus(newStatus);
                    setLastUpdate(new Date());
                    setLoading(false);
                    notify(newStatus);
                    if (newStatus !== 'pending') {
                        cleanup();
                    }
                }
            }
            catch (err) {
                // ignore malformed payload
            }
        };
        const handleError = () => {
            // SSE connection failed; fall back to polling
            cleanupEventSource();
            startPolling();
        };
        const cleanupEventSource = () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
        };
        const startPolling = () => {
            const poll = async () => {
                try {
                    const resp = await fetch(`/transactions/${txId}/poll`);
                    if (!resp.ok)
                        throw new Error('poll failed');
                    const data = await resp.json();
                    if (data && data.status) {
                        const candidate = data.status;
                        const allowed = ['pending', 'confirmed', 'failed'];
                        const newStatus = allowed.includes(candidate)
                            ? candidate
                            : 'pending';
                        setStatus(newStatus);
                        setLastUpdate(new Date());
                        setLoading(false);
                        notify(newStatus);
                        if (newStatus !== 'pending') {
                            stopPolling();
                        }
                    }
                }
                catch (err) {
                    setError(err);
                }
            };
            poll();
            const interval = options.pollingIntervalMs ?? DEFAULT_POLL_INTERVAL;
            pollingRef.current = window.setInterval(poll, interval);
        };
        const stopPolling = () => {
            if (pollingRef.current !== null) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
        const cleanup = () => {
            cleanupEventSource();
            stopPolling();
            setLoading(false);
        };
        // try SSE first
        try {
            const es = new EventSource(`/transactions/${txId}/events`);
            eventSourceRef.current = es;
            es.onmessage = handleMessage;
            es.onerror = handleError;
        }
        catch (err) {
            // if construction throws, fallback to polling
            startPolling();
        }
        return () => {
            active = false;
            cleanup();
        };
    }, [txId, options.onStatusChange, options.notifications, options.pollingIntervalMs, options.account]);
    return {
        status,
        loading,
        error,
        lastUpdate,
    };
}
//# sourceMappingURL=useTransactionStatus.js.map