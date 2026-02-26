import { useState, useEffect, useCallback } from 'react';
import { ssrLocalStorage } from '../utils/ssr';

export interface TransactionState {
  id: string;
  status: 'idle' | 'pending' | 'success' | 'failed';
  progress: number; // 0 to 100
  step: string;
  txHash?: string;
  timestamp: number;
}

const STORAGE_KEY = 'bridgewise_tx_state';

export const useTransactionPersistence = () => {
  const [state, setState] = useState<TransactionState>({
    id: '',
    status: 'idle',
    progress: 0,
    step: '',
    timestamp: 0,
  });

  // Load from storage on mount
  useEffect(() => {
    const stored = ssrLocalStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Optional: Expiry check (e.g. 24h)
        if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
          setState(parsed);
        } else {
          ssrLocalStorage.removeItem(STORAGE_KEY);
        }
      } catch (e) {
        console.error('Failed to load transaction state', e);
      }
    }
  }, []);

  // Save to storage whenever state changes
  useEffect(() => {
    if (state.status === 'idle') {
      // We might want to clear it if it's explicitly idle, or keep it if it's "history"
      // For now, let's only clear if we explicitly want to reset.
      // But if the user starts a new one, it overwrites.
      return;
    }

    // If completed/failed, we might want to keep it generic for a bit
    // But persistence is key.
    ssrLocalStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const updateState = useCallback((updates: Partial<TransactionState>) => {
    setState((prev) => ({ ...prev, ...updates, timestamp: Date.now() }));
  }, []);

  const clearState = useCallback(() => {
    setState({
      id: '',
      status: 'idle',
      progress: 0,
      step: '',
      timestamp: 0,
    });
    ssrLocalStorage.removeItem(STORAGE_KEY);
  }, []);

  const startTransaction = useCallback((id: string) => {
    setState({
      id,
      status: 'pending',
      progress: 0,
      step: 'Initializing...',
      timestamp: Date.now(),
    });
  }, []);

  return {
    state,
    updateState,
    clearState,
    startTransaction,
  };
};
