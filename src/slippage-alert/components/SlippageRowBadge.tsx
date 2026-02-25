import React from 'react';
import { SlippageSeverity } from '../types/slippage-alert.types';

interface SlippageRowBadgeProps {
  slippagePercent: number;
  threshold: number;
}

function getSeverity(
  slippage: number,
  threshold: number,
): SlippageSeverity | null {
  if (slippage <= threshold) return null;
  return slippage >= threshold * 2 ? 'critical' : 'warning';
}

/**
 * Inline badge for use inside <BridgeCompare /> route rows.
 * Highlights routes with slippage exceeding the configured threshold.
 */
export const SlippageRowBadge: React.FC<SlippageRowBadgeProps> = ({
  slippagePercent,
  threshold,
}) => {
  const severity = getSeverity(slippagePercent, threshold);
  if (!severity) return null;

  return (
    <span
      className={`slippage-row-badge slippage-row-badge--${severity}`}
      title={`Slippage ${slippagePercent.toFixed(2)}% exceeds ${threshold}% threshold`}
    >
      {severity === 'critical' ? '🚨' : '⚠️'} {slippagePercent.toFixed(2)}%
    </span>
  );
};
