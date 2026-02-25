import { useEffect, useRef } from 'react';
import { BridgeQuote, SlippageAlert, SlippageAlertConfig } from '../types/slippage-alert.types';
import { useSlippageAlert } from './useSlippageAlert';

interface UseSlippageMonitorOptions {
  quotes: BridgeQuote[];
  config?: SlippageAlertConfig;
  pollingIntervalMs?: number;
}

interface UseSlippageMonitorReturn {
  alerts: SlippageAlert[];
  activeAlerts: SlippageAlert[];
  isBlocked: boolean;
  highestSlippage: number | null;
  dismissAlert: (id: string) => void;
  dismissAll: () => void;
}

/**
 * Wraps useSlippageAlert and continuously monitors a list of quotes,
 * triggering alerts whenever a quote's slippage exceeds the threshold.
 * Integrates with useBridgeQuotes() by accepting its output as `quotes`.
 */
export function useSlippageMonitor({
  quotes,
  config = {},
  pollingIntervalMs = 10_000,
}: UseSlippageMonitorOptions): UseSlippageMonitorReturn {
  const {
    alerts,
    activeAlerts,
    isBlocked,
    highestSlippage,
    dismissAlert,
    dismissAll,
    checkSlippage,
  } = useSlippageAlert(config);

  // Track last-checked quotes to avoid redundant checks
  const lastCheckedRef = useRef<Map<string, number>>(new Map());

  const runChecks = useRef((currentQuotes: BridgeQuote[]) => {
    for (const quote of currentQuotes) {
      const key = `${quote.bridge}:${quote.sourceChain}:${quote.destinationChain}:${quote.token}`;
      const lastSlippage = lastCheckedRef.current.get(key);

      // Only re-check if slippage value changed
      if (lastSlippage !== quote.slippagePercent) {
        lastCheckedRef.current.set(key, quote.slippagePercent);
        checkSlippage(quote);
      }
    }
  });

  // Run on every quotes update
  useEffect(() => {
    runChecks.current(quotes);
  }, [quotes]);

  // Also run on a polling interval for long-lived quote streams
  useEffect(() => {
    if (pollingIntervalMs <= 0) return;

    const interval = setInterval(() => {
      runChecks.current(quotes);
    }, pollingIntervalMs);

    return () => clearInterval(interval);
  }, [quotes, pollingIntervalMs]);

  return {
    alerts,
    activeAlerts,
    isBlocked,
    highestSlippage,
    dismissAlert,
    dismissAll,
  };
}
