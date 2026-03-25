'use client';

import { useEffect, useState, useRef } from 'react';
import type {
  BridgeTransactionStatus,
} from '../transaction-history/types';
import { TransactionHistoryStorage } from '../transaction-history/storage';
import type { TransactionHistoryConfig, BridgeTransaction } from '../transaction-history/types';

export interface UseTransactionStatusOptions {
  /** Interval to poll when SSE is unavailable or fails */
  pollingIntervalMs?: number;
  /** Callback invoked whenever status changes */
  onStatusChange?: (status: BridgeTransactionStatus) => void;
  /** Enable desktop/browser notification or custom handler */
  notifications?: boolean | ((status: BridgeTransactionStatus) => void);
  /** Optional configuration used to persist status to history storage */
  historyConfig?: TransactionHistoryConfig;
  /** Account for history persistence (required when historyConfig is provided) */
  account?: string;
}

export interface UseTransactionStatusReturn {
  status: BridgeTransactionStatus | null;
  loading: boolean;
  error?: Error;
  lastUpdate: Date | null;
}

const DEFAULT_POLL_INTERVAL = 5000;

/**
 * Hook for tracking the real-time status of a transaction by its ID/Hash.
 * It attempts to open an EventSource connection to `/transactions/:id/events`
 * and falls back to polling `/transactions/:id/poll` if SSE fails or is not available.
 *
 * The hook is SSR-safe (will do nothing during server rendering).
 */
export function useTransactionStatus(
  txId: string | null | undefined,
  options: UseTransactionStatusOptions = {},
): UseTransactionStatusReturn {
  const [status, setStatus] = useState<BridgeTransactionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingRef = useRef<number | null>(null);
  const historyStorageRef = useRef<TransactionHistoryStorage | null>(null);

  // lazily initialise history storage if needed
  useEffect(() => {
    if (options.historyConfig) {
      historyStorageRef.current = new TransactionHistoryStorage(options.historyConfig);
    }
  }, [options.historyConfig]);

  useEffect(() => {
    if (!txId || typeof window === 'undefined') {
      return;
    }

    let active = true;
    setLoading(true);

    const notify = (newStatus: BridgeTransactionStatus) => {
      options.onStatusChange?.(newStatus);
      if (options.notifications) {
        if (typeof options.notifications === 'function') {
          options.notifications(newStatus);
        } else if (typeof Notification !== 'undefined') {
          if (Notification.permission === 'granted') {
            new Notification(`Transaction status: ${newStatus}`);
          } else if (Notification.permission !== 'denied') {
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
        const record: Partial<BridgeTransaction> = {
          txHash: txId,
          status: newStatus,
          timestamp: new Date(),
          account: options.account,
          // other fields unknown; history storage will fill defaults
        } as any;
        historyStorageRef.current.upsertTransaction(record as BridgeTransaction).catch(() => {
          /* swallow */
        });
      }
    };

    const handleMessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data && data.status) {
          // guard against unexpected status values; default to pending
          const candidate = data.status as string;
          const allowed: BridgeTransactionStatus[] = ['pending', 'confirmed', 'failed'];
          const newStatus: BridgeTransactionStatus = allowed.includes(candidate as any)
            ? (candidate as BridgeTransactionStatus)
            : 'pending';

          setStatus(newStatus);
          setLastUpdate(new Date());
          setLoading(false);
          notify(newStatus);
          if (newStatus !== 'pending') {
            cleanup();
          }
        }
      } catch (err) {
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
          if (!resp.ok) throw new Error('poll failed');
          const data = await resp.json();
          if (data && data.status) {
            const candidate = data.status as string;
            const allowed: BridgeTransactionStatus[] = ['pending', 'confirmed', 'failed'];
            const newStatus: BridgeTransactionStatus = allowed.includes(candidate as any)
              ? (candidate as BridgeTransactionStatus)
              : 'pending';

            setStatus(newStatus);
            setLastUpdate(new Date());
            setLoading(false);
            notify(newStatus);
            if (newStatus !== 'pending') {
              stopPolling();
            }
          }
        } catch (err) {
          setError(err as Error);
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
    } catch (err) {
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
