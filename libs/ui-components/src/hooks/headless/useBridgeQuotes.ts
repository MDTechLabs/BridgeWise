import { useState, useEffect, useCallback, useRef } from 'react';
import { isTokenSupported } from '../../tokenValidation';
// You may need to adjust the import path for QuoteRefreshEngine and types
declare const QuoteRefreshEngine: any;
// Replace with actual imports in your project
// import { QuoteRefreshEngine } from '@bridgewise/core';
// import { NormalizedQuote, QuoteRefreshConfig, RefreshState } from '@bridgewise/core/types';
import type { HeadlessConfig } from './config';

export interface UseBridgeQuotesOptions /* extends QuoteRefreshConfig */ {
  initialParams?: BridgeQuoteParams;
  debounceMs?: number;
  config?: HeadlessConfig;
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
  quotes: any[]; // NormalizedQuote[]
  isLoading: boolean;
  error: Error | null;
  lastRefreshed: Date | null;
  isRefreshing: boolean;
  refresh: () => Promise<any[]>; // Promise<NormalizedQuote[]>
  updateParams: (params: Partial<BridgeQuoteParams>) => void;
  retryCount: number;
}

export function useBridgeQuotes(
  options: UseBridgeQuotesOptions = {}
): UseBridgeQuotesReturn {
  const {
    initialParams,
    debounceMs = 300,
    config = {},
  } = options;

  const autoRefresh = config?.autoRefreshQuotes ?? true;

  const [params, setParams] = useState<BridgeQuoteParams | undefined>(initialParams);
  const [quotes, setQuotes] = useState<any[]>([]); // NormalizedQuote[]
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const engineRef = useRef<any>(null); // QuoteRefreshEngine | null
  const debounceTimerRef = useRef<NodeJS.Timeout>();
  const paramsRef = useRef(params);

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    const fetchQuotes = async (fetchParams: BridgeQuoteParams, options?: { signal?: AbortSignal }) => {
      const validation = isTokenSupported(
        fetchParams.sourceToken,
        fetchParams.sourceChain,
        fetchParams.destinationChain
      );
      if (!validation.isValid) {
        const error = new Error(validation.errors.join('; '));
        setError(error);
        throw error;
      }
      // Replace with actual fetch logic
      return [];
    };
    engineRef.current = new QuoteRefreshEngine(fetchQuotes, {
      // ...config
      onRefresh: (newQuotes: any[]) => {
        setQuotes(newQuotes);
        setLastRefreshed(new Date());
      },
      onError: (err: Error) => {
        setError(err);
      },
      onRefreshStart: () => setIsRefreshing(true),
      onRefreshEnd: () => setIsRefreshing(false),
    });
    // Listen to state changes
    const handleStateChange = (state: any) => {
      setRetryCount(state.retryCount);
      setIsLoading(state.isRefreshing);
    };
    engineRef.current.on('state-change', handleStateChange);
    if (params) {
      engineRef.current.initialize(params);
    }
    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
      }
    };
  }, []);

  const updateParams = useCallback((newParams: Partial<BridgeQuoteParams>) => {
    if (!paramsRef.current) return;
    const updatedParams = { ...paramsRef.current, ...newParams };
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
        }).catch((err: Error) => {
          console.error('Failed to refresh quotes after parameter change:', err);
        });
      }
    }, debounceMs);
  }, [debounceMs]);

  const refresh = useCallback(async (): Promise<any[]> => {
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
