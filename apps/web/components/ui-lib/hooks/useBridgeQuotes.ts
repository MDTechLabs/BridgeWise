// packages/react/src/hooks/useBridgeQuotes.ts

import { useState, useEffect, useCallback, useRef } from 'react';
import { QuoteRefreshEngine } from '@bridgewise/core';
import { NormalizedQuote, QuoteRefreshConfig, RefreshState } from '@bridgewise/core/types';

export interface UseBridgeQuotesOptions extends QuoteRefreshConfig {
  initialParams?: BridgeQuoteParams;
  debounceMs?: number;
}

export interface BridgeQuoteParams {
  amount: string;
  sourceChain: string;
  destinationChain: string;
  sourceToken: string;
  destinationToken: string;
  userAddress?: string;
  slippageTolerance?: number;
}

export interface UseBridgeQuotesReturn {
  quotes: NormalizedQuote[];
  isLoading: boolean;
  error: Error | null;
  lastRefreshed: Date | null;
  isRefreshing: boolean;
  refresh: () => Promise<NormalizedQuote[]>;
  updateParams: (params: Partial<BridgeQuoteParams>) => void;
  retryCount: number;
}

export function useBridgeQuotes(
  options: UseBridgeQuotesOptions = {}
): UseBridgeQuotesReturn {
  const {
    initialParams,
    intervalMs = 15000,
    autoRefresh = true,
    maxRetries = 3,
    retryDelayMs = 1000,
    debounceMs = 300,
    ...callbacks
  } = options;

  const [params, setParams] = useState<BridgeQuoteParams | undefined>(initialParams);
  const [quotes, setQuotes] = useState<NormalizedQuote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const engineRef = useRef<QuoteRefreshEngine | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout>();
  const paramsRef = useRef(params);

  // Update params ref on change
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  // Initialize refresh engine
  useEffect(() => {
    const fetchQuotes = async (fetchParams: BridgeQuoteParams, options?: { signal?: AbortSignal }) => {
      // Implement actual quote fetching logic here
      const response = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fetchParams),
        signal: options?.signal
      });

      if (!response.ok) {
        throw new Error('Failed to fetch quotes');
      }

      return response.json();
    };

    engineRef.current = new QuoteRefreshEngine(fetchQuotes, {
      intervalMs,
      autoRefresh,
      maxRetries,
      retryDelayMs,
      onRefresh: (newQuotes) => {
        setQuotes(newQuotes);
        setLastRefreshed(new Date());
        callbacks.onRefresh?.(newQuotes);
      },
      onError: (err) => {
        setError(err);
        callbacks.onError?.(err);
      },
      onRefreshStart: () => {
        setIsRefreshing(true);
        callbacks.onRefreshStart?.();
      },
      onRefreshEnd: () => {
        setIsRefreshing(false);
        callbacks.onRefreshEnd?.();
      }
    });

    // Listen to state changes
    const handleStateChange = (state: RefreshState) => {
      setRetryCount(state.retryCount);
      setIsLoading(state.isRefreshing);
    };

    engineRef.current.on('state-change', handleStateChange);

    // Initialize with params if available
    if (params) {
      engineRef.current.initialize(params);
    }

    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
      }
    };
  }, []); // Empty dependency array - engine should only be created once

  // Handle parameter changes with debouncing
  const updateParams = useCallback((newParams: Partial<BridgeQuoteParams>) => {
    if (!paramsRef.current) return;

    const updatedParams = { ...paramsRef.current, ...newParams };

    // Debounce parameter updates to avoid too many refreshes
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setParams(updatedParams);
      
      if (engineRef.current) {
        engineRef.current.refresh({
          type: 'parameter-change',
          timestamp: Date.now(),
          params: updatedParams
        }).catch((err) => {
          console.error('Failed to refresh quotes after parameter change:', err);
        });
      }
    }, debounceMs);

  }, [debounceMs]);

  // Manual refresh function
  const refresh = useCallback(async (): Promise<NormalizedQuote[]> => {
    if (!engineRef.current) {
      throw new Error('Refresh engine not initialized');
    }

    try {
      setIsLoading(true);
      setError(null);

      const newQuotes = await engineRef.current.refresh({
        type: 'manual',
        timestamp: Date.now()
      });

      return newQuotes;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-refresh based on config changes
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.updateConfig({ autoRefresh });
      
      if (autoRefresh) {
        engineRef.current.startAutoRefresh();
      } else {
        engineRef.current.stopAutoRefresh();
      }
    }
  }, [autoRefresh]);

  // Update interval when changed
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.updateConfig({ intervalMs });
    }
  }, [intervalMs]);

  return {
    quotes,
    isLoading,
    error,
    lastRefreshed,
    isRefreshing,
    refresh,
    updateParams,
    retryCount
  };
}