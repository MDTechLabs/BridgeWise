import React, { useEffect } from 'react';
import { SlippageAlert } from '../types/slippage-alert.types';

interface SlippageToastProps {
  alerts: SlippageAlert[];
  onDismiss: (id: string) => void;
  autoDismissMs?: number; // 0 = no auto-dismiss
}

export const SlippageToast: React.FC<SlippageToastProps> = ({
  alerts,
  onDismiss,
  autoDismissMs = 5000,
}) => {
  const active = alerts.filter((a) => !a.dismissed);

  useEffect(() => {
    if (autoDismissMs <= 0 || active.length === 0) return;

    const timers = active.map((alert) =>
      setTimeout(() => onDismiss(alert.id), autoDismissMs),
    );

    return () => timers.forEach(clearTimeout);
  }, [active, autoDismissMs, onDismiss]);

  if (active.length === 0) return null;

  return (
    <div className="slippage-toast-container" role="status" aria-live="polite">
      {active.map((alert) => (
        <div
          key={alert.id}
          className={`slippage-toast slippage-toast--${alert.severity}`}
        >
          <div className="slippage-toast__content">
            <p className="slippage-toast__title">
              {alert.severity === 'critical' ? '🚨 Critical' : '⚠️ Warning'}:{' '}
              Slippage Alert
            </p>
            <p className="slippage-toast__message">
              {alert.bridge} — {alert.token}: {alert.slippage.toFixed(2)}%
              slippage exceeds your {alert.threshold}% limit.
            </p>
          </div>
          <button
            className="slippage-toast__close"
            onClick={() => onDismiss(alert.id)}
            aria-label="Close notification"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};
