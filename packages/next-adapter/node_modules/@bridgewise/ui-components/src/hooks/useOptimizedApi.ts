import { useState, useEffect, useCallback, useRef } from 'react';

interface UseOptimizedApiOptions<T> {
  cacheTime?: number;
  retryCount?: number;
  retryDelay?: number;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  lastFetch: number | null;
}

const cache = new Map<string, { data: any; timestamp: number }>();

export function useOptimizedApi<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseOptimizedApiOptions<T> = {}
) {
  const {
    cacheTime = 5 * 60 * 1000, // 5 minutes
    retryCount = 3,
    retryDelay = 1000,
    onSuccess,
    onError,
  } = options;

  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: false,
    error: null,
    lastFetch: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const execute = useCallback(
    async (currentRetry = 0): Promise<void> => {
      // Check cache first
      const cached = cache.get(key);
      if (cached && Date.now() - cached.timestamp < cacheTime) {
        setState(prev => ({ 
          ...prev, 
          data: cached.data, 
          loading: false, 
          error: null,
          lastFetch: cached.timestamp 
        }));
        return;
      }

      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();

      setState(prev => ({ ...prev, loading: true, error: null }));

      try {
        const data = await fetcher();
        
        // Cache the result
        cache.set(key, { data, timestamp: Date.now() });
        
        setState({
          data,
          loading: false,
          error: null,
          lastFetch: Date.now(),
        });

        onSuccess?.(data);
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Unknown error');
        
        if (currentRetry < retryCount) {
          retryTimeoutRef.current = setTimeout(() => {
            execute(currentRetry + 1);
          }, retryDelay * Math.pow(2, currentRetry));
        } else {
          setState(prev => ({ ...prev, loading: false, error: err }));
          onError?.(err);
        }
      }
    },
    [key, fetcher, cacheTime, retryCount, retryDelay, onSuccess, onError]
  );

  const refetch = useCallback(() => {
    cache.delete(key); // Clear cache for fresh data
    execute();
  }, [key, execute]);

  const clearCache = useCallback(() => {
    cache.delete(key);
  }, [key]);

  useEffect(() => {
    execute();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [execute]);

  return {
    ...state,
    refetch,
    clearCache,
  };
}

// Batch API calls hook for multiple requests
export function useBatchApi<T>(
  requests: Array<{ key: string; fetcher: () => Promise<T> }>,
  options: UseOptimizedApiOptions<T[]> = {}
) {
  const [state, setState] = useState<ApiState<T[]>>({
    data: null,
    loading: false,
    error: null,
    lastFetch: null,
  });

  const executeAll = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const results = await Promise.allSettled(
        requests.map(req => req.fetcher())
      );

      const data = results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          console.error(`Request ${index} failed:`, result.reason);
          return null;
        }
      }).filter(Boolean) as T[];

      setState({
        data,
        loading: false,
        error: null,
        lastFetch: Date.now(),
      });

      options.onSuccess?.(data);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Batch request failed');
      setState(prev => ({ ...prev, loading: false, error: err }));
      options.onError?.(err);
    }
  }, [requests, options]);

  useEffect(() => {
    executeAll();
  }, [executeAll]);

  return {
    ...state,
    refetch: executeAll,
  };
}
