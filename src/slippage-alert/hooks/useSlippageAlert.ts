import { useState, useCallback, useMemo, useRef } from 'react';
import {
  SlippageAlertConfig,
  SlippageAlert,
  SlippageAlertData,
  BridgeQuote,
  SlippageSeverity,
  UseSlippageAlertReturn,
} from '../types/slippage-alert.types';

const DEFAULT_MAX_SLIPPAGE = 1; // 1%
const CRITICAL_MULTIPLIER = 2;  // 2x threshold = critical

function generateId(): string {
  return `slippage-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function resolveSeverity(
  slippage: number,
  threshold: number,
): SlippageSeverity {
  return slippage >= threshold * CRITICAL_MULTIPLIER ? 'critical' : 'warning';
}

export function useSlippageAlert(
  config: SlippageAlertConfig = {},
): UseSlippageAlertReturn {
  const {
    maxSlippagePercent = DEFAULT_MAX_SLIPPAGE,
    notifyUser = true,
    blockOnExceed = false,
    onAlert,
  } = config;

  const [alerts, setAlerts] = useState<SlippageAlert[]>([]);

  // Keep onAlert stable across renders without triggering effects
  const onAlertRef = useRef(onAlert);
  onAlertRef.current = onAlert;

  const checkSlippage = useCallback(
    (quote: BridgeQuote): SlippageAlert | null => {
      if (quote.slippagePercent <= maxSlippagePercent) return null;

      const severity = resolveSeverity(quote.slippagePercent, maxSlippagePercent);

      const data: SlippageAlertData = {
        bridge: quote.bridge,
        sourceChain: quote.sourceChain,
        destinationChain: quote.destinationChain,
        token: quote.token,
        slippage: quote.slippagePercent,
        threshold: maxSlippagePercent,
        severity,
        timestamp: new Date(),
      };

      const alert: SlippageAlert = {
        ...data,
        id: generateId(),
        dismissed: false,
      };

      if (notifyUser) {
        setAlerts((prev) => {
          // Avoid duplicate alerts for the same bridge within 5 seconds
          const recent = prev.find(
            (a) =>
              a.bridge === alert.bridge &&
              a.sourceChain === alert.sourceChain &&
              a.destinationChain === alert.destinationChain &&
              !a.dismissed &&
              Date.now() - a.timestamp.getTime() < 5000,
          );
          if (recent) return prev;
          return [...prev, alert];
        });
      }

      onAlertRef.current?.(data);

      return alert;
    },
    [maxSlippagePercent, notifyUser],
  );

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, dismissed: true } : a)),
    );
  }, []);

  const dismissAll = useCallback(() => {
    setAlerts((prev) => prev.map((a) => ({ ...a, dismissed: true })));
  }, []);

  const activeAlerts = useMemo(
    () => alerts.filter((a) => !a.dismissed),
    [alerts],
  );

  const isBlocked = useMemo(
    () => blockOnExceed && activeAlerts.length > 0,
    [blockOnExceed, activeAlerts],
  );

  const highestSlippage = useMemo(() => {
    if (activeAlerts.length === 0) return null;
    return Math.max(...activeAlerts.map((a) => a.slippage));
  }, [activeAlerts]);

  return {
    alerts,
    activeAlerts,
    isBlocked,
    highestSlippage,
    dismissAlert,
    dismissAll,
    checkSlippage,
  };
}
