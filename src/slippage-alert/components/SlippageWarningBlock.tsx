import React from 'react';
import { SlippageAlert } from '../types/slippage-alert.types';

interface SlippageWarningBlockProps {
  activeAlerts: SlippageAlert[];
  isBlocked: boolean;
  onDismiss: (id: string) => void;
}

/**
 * Inline warning block for use inside <BridgeStatus /> during execution.
 * When blockOnExceed is enabled, also renders a transfer-blocked notice.
 */
export const SlippageWarningBlock: React.FC<SlippageWarningBlockProps> = ({
  activeAlerts,
  isBlocked,
  onDismiss,
}) => {
  if (activeAlerts.length === 0 && !isBlocked) return null;

  return (
    <div className="slippage-warning-block">
      {isBlocked && (
        <div className="slippage-warning-block__blocked" role="alert">
          <strong>Transfer Blocked</strong> — slippage exceeds your configured
          maximum. Adjust your threshold or wait for better rates.
        </div>
      )}

      {activeAlerts.map((alert) => (
        <div
          key={alert.id}
          className={`slippage-warning-block__item slippage-warning-block__item--${alert.severity}`}
        >
          <span>
            {alert.severity === 'critical' ? '🚨' : '⚠️'}{' '}
            <strong>{alert.bridge}</strong>: slippage is{' '}
            {alert.slippage.toFixed(2)}% — threshold is {alert.threshold}%
          </span>
          <button
            onClick={() => onDismiss(alert.id)}
            aria-label="Dismiss warning"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};
