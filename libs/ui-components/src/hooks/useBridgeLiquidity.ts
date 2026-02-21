'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BridgeLiquidityMonitor } from '../liquidity/monitor';
import type {
  BridgeLiquidity,
  BridgeLiquidityMonitorConfig,
  BridgeLiquidityQuery,
  LiquidityProviderError,
} from '../liquidity/types';

export interface UseBridgeLiquidityOptions extends BridgeLiquidityQuery {
  refreshIntervalMs?: number;
  config?: BridgeLiquidityMonitorConfig;
}

export interface UseBridgeLiquidityResult {
  liquidity: BridgeLiquidity[];
  loading: boolean;
  errors: LiquidityProviderError[];
  usedFallback: boolean;
  refreshLiquidity: () => Promise<void>;
}

export async function fetchBridgeLiquiditySnapshot(
  monitor: BridgeLiquidityMonitor,
  query: BridgeLiquidityQuery,
): Promise<{
  liquidity: BridgeLiquidity[];
  errors: LiquidityProviderError[];
  usedFallback: boolean;
}> {
  return monitor.getLiquidity(query);
}

export function useBridgeLiquidity(options: UseBridgeLiquidityOptions): UseBridgeLiquidityResult {
  const [liquidity, setLiquidity] = useState<BridgeLiquidity[]>([]);
  const [errors, setErrors] = useState<LiquidityProviderError[]>([]);
  const [loading, setLoading] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);

  const monitor = useMemo(() => new BridgeLiquidityMonitor(options.config), [options.config]);

  const refreshLiquidity = useCallback(async () => {
    if (typeof window === 'undefined') {
      setLiquidity([]);
      setErrors([]);
      setUsedFallback(false);
      return;
    }

    setLoading(true);
    try {
      const result = await fetchBridgeLiquiditySnapshot(monitor, {
        token: options.token,
        sourceChain: options.sourceChain,
        destinationChain: options.destinationChain,
        bridgeName: options.bridgeName,
      });

      setLiquidity(result.liquidity);
      setErrors(result.errors);
      setUsedFallback(result.usedFallback);
    } finally {
      setLoading(false);
    }
  }, [monitor, options.bridgeName, options.destinationChain, options.sourceChain, options.token]);

  useEffect(() => {
    void refreshLiquidity();
  }, [refreshLiquidity]);

  useEffect(() => {
    if (!options.refreshIntervalMs || options.refreshIntervalMs <= 0) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshLiquidity();
    }, options.refreshIntervalMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [options.refreshIntervalMs, refreshLiquidity]);

  return {
    liquidity,
    loading,
    errors,
    usedFallback,
    refreshLiquidity,
  };
}
