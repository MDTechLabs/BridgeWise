/**
 * BridgeStatus Component
 * Displays real-time transaction status for cross-chain bridge transfers
 * Supports both Stellar and EVM transactions with theming and customization
 */

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useBridgeExecution } from '../../hooks/useBridgeExecution';
import type {
  BridgeStatusProps,
  BridgeStatusState,
  BridgeTransactionStatus,
  TransactionError,
} from './types';

// Default explorer URL templates by chain
const DEFAULT_EXPLORER_TEMPLATES: Record<string, string> = {
  ethereum: 'https://etherscan.io/tx/{{txHash}}',
  polygon: 'https://polygonscan.com/tx/{{txHash}}',
  arbitrum: 'https://arbiscan.io/tx/{{txHash}}',
  optimism: 'https://optimistic.etherscan.io/tx/{{txHash}}',
  base: 'https://basescan.org/tx/{{txHash}}',
  stellar: 'https://stellar.expert/explorer/public/tx/{{txHash}}',
  solana: 'https://explorer.solana.com/tx/{{txHash}}',
};

// Status badge colors using CSS variables
const STATUS_COLORS: Record<BridgeTransactionStatus, { bg: string; text: string; border: string }> = {
  pending: {
    bg: 'var(--bw-colors-status-pending-bg, #fef3c7)',
    text: 'var(--bw-colors-status-pending-text, #d97706)',
    border: 'var(--bw-colors-status-pending-border, #fbbf24)',
  },
  confirmed: {
    bg: 'var(--bw-colors-status-success-bg, #d1fae5)',
    text: 'var(--bw-colors-status-success-text, #059669)',
    border: 'var(--bw-colors-status-success-border, #34d399)',
  },
  failed: {
    bg: 'var(--bw-colors-status-error-bg, #fee2e2)',
    text: 'var(--bw-colors-status-error-text, #dc2626)',
    border: 'var(--bw-colors-status-error-border, #f87171)',
  },
};

// Status icons
const StatusIcon: React.FC<{ status: BridgeTransactionStatus; size?: number }> = ({
  status,
  size = 20,
}) => {
  const iconStyle = { width: size, height: size };

  switch (status) {
    case 'pending':
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20">
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 12 12"
              to="360 12 12"
              dur="1s"
              repeatCount="indefinite"
            />
          </circle>
        </svg>
      );
    case 'confirmed':
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'failed':
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 8l8 8M16 8l-8 8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
};

// Format time remaining
const formatTimeRemaining = (seconds: number): string => {
  if (seconds <= 0) return 'Completing...';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}m ${secs}s remaining`;
  }
  return `${secs}s remaining`;
};

// Format amount with token
const formatAmount = (amount: number, token?: string): string => {
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
  return token ? `${formatted} ${token}` : formatted;
};

// Format fee
const formatFee = (fee?: number): string => {
  if (fee === undefined || fee === null) return '--';
  return `${fee.toFixed(4)}%`;
};

// Format slippage
const formatSlippage = (slippage?: number): string => {
  if (slippage === undefined || slippage === null) return '--';
  return `${slippage.toFixed(2)}%`;
};

// Get explorer URL
const getExplorerUrl = (txHash: string, chain: string, template?: string): string | null => {
  if (template) {
    return template.replace('{{txHash}}', txHash);
  }
  const defaultTemplate = DEFAULT_EXPLORER_TEMPLATES[chain.toLowerCase()];
  if (defaultTemplate) {
    return defaultTemplate.replace('{{txHash}}', txHash);
  }
  return null;
};

/**
 * BridgeStatus Component
 * 
 * @example
 * ```tsx
 * <BridgeStatus
 *   txHash="0x123..."
 *   bridgeName="hop"
 *   sourceChain="ethereum"
 *   destinationChain="polygon"
 *   amount={1000}
 *   token="USDC"
 *   onStatusChange={(status) => console.log('Status:', status)}
 * />
 * ```
 */
export const BridgeStatus: React.FC<BridgeStatusProps> = ({
  txHash,
  bridgeName,
  sourceChain,
  destinationChain,
  amount,
  token,
  destinationToken,
  fee,
  slippagePercent,
  estimatedTimeSeconds,
  onStatusChange,
  onConfirmed,
  onFailed,
  onRetry,
  className = '',
  style = {},
  detailed = false,
  compact = false,
  slippageWarningThreshold = 1.0,
  explorerUrlTemplate,
  disabled = false,
  'data-testid': dataTestId,
}) => {
  // SSR hydration handling
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Use the bridge execution hook
  const {
    status,
    progress,
    step,
    error,
    estimatedTimeRemaining,
    confirmations,
    requiredConfirmations,
    isPending,
    isConfirmed,
    isFailed,
    retry,
    start,
    details,
  } = useBridgeExecution({
    estimatedTimeSeconds,
    onStatusChange,
    onConfirmed,
    onFailed,
    autoStart: false,
  });

  // Start monitoring when component mounts
  useEffect(() => {
    if (!disabled && isHydrated) {
      start(
        txHash,
        bridgeName,
        sourceChain,
        destinationChain,
        amount ?? 0,
        token,
        fee,
        slippagePercent
      );
    }
  }, [txHash, bridgeName, sourceChain, destinationChain, amount, token, fee, slippagePercent, disabled, isHydrated, start]);

  // Handle retry
  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry();
    } else {
      retry();
    }
  }, [onRetry, retry]);

  // Check slippage warning
  const showSlippageWarning =
    slippagePercent !== undefined && slippagePercent > slippageWarningThreshold;

  // Get explorer URL
  const explorerUrl = getExplorerUrl(txHash, sourceChain, explorerUrlTemplate);

  // Status colors
  const statusColors = STATUS_COLORS[status];

  // Compact view
  if (compact) {
    return (
      <div
        className={`bridge-status-compact ${className}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--bw-spacing-xs, 4px)',
          padding: 'var(--bw-spacing-xs, 4px) var(--bw-spacing-sm, 8px)',
          borderRadius: 'var(--bw-radii-full, 9999px)',
          backgroundColor: statusColors.bg,
          color: statusColors.text,
          fontSize: 'var(--bw-typography-font-size-xs, 12px)',
          fontWeight: 'var(--bw-typography-font-weight-medium, 500)',
          ...style,
        }}
        data-testid={dataTestId}
        data-status={status}
      >
        <StatusIcon status={status} size={14} />
        <span style={{ textTransform: 'capitalize' }}>{status}</span>
      </div>
    );
  }

  // Full view
  return (
    <div
      className={`bridge-status ${className}`}
      style={{
        backgroundColor: 'var(--bw-colors-transaction-background, #ffffff)',
        borderRadius: 'var(--bw-radii-lg, 8px)',
        boxShadow: 'var(--bw-shadows-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1))',
        border: '1px solid var(--bw-colors-transaction-border, #e5e7eb)',
        padding: 'var(--bw-spacing-md, 16px)',
        fontFamily: 'var(--bw-typography-font-family-sans, system-ui, sans-serif)',
        maxWidth: '400px',
        ...style,
      }}
      data-testid={dataTestId}
      data-status={status}
    >
      {/* Header with status badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--bw-spacing-md, 16px)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--bw-spacing-sm, 8px)',
          }}
        >
          <StatusIcon status={status} />
          <span
            style={{
              fontSize: 'var(--bw-typography-font-size-lg, 18px)',
              fontWeight: 'var(--bw-typography-font-weight-semibold, 600)',
              color: 'var(--bw-colors-foreground-primary, #111827)',
            }}
          >
            {isPending && 'Processing Transaction'}
            {isConfirmed && 'Transaction Complete'}
            {isFailed && 'Transaction Failed'}
          </span>
        </div>
        <span
          style={{
            padding: 'var(--bw-spacing-xs, 4px) var(--bw-spacing-sm, 8px)',
            borderRadius: 'var(--bw-radii-md, 6px)',
            backgroundColor: statusColors.bg,
            color: statusColors.text,
            fontSize: 'var(--bw-typography-font-size-xs, 12px)',
            fontWeight: 'var(--bw-typography-font-weight-semibold, 600)',
            textTransform: 'uppercase',
            border: `1px solid ${statusColors.border}`,
          }}
        >
          {status}
        </span>
      </div>

      {/* Bridge info */}
      <div
        style={{
          marginBottom: 'var(--bw-spacing-md, 16px)',
          padding: 'var(--bw-spacing-sm, 8px)',
          backgroundColor: 'var(--bw-colors-background-secondary, #f3f4f6)',
          borderRadius: 'var(--bw-radii-md, 6px)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 'var(--bw-typography-font-size-sm, 14px)',
          }}
        >
          <span style={{ color: 'var(--bw-colors-foreground-secondary, #6b7280)' }}>
            {sourceChain}
          </span>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ color: 'var(--bw-colors-foreground-tertiary, #9ca3af)' }}
          >
            <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ color: 'var(--bw-colors-foreground-secondary, #6b7280)' }}>
            {destinationChain}
          </span>
        </div>
        <div
          style={{
            marginTop: 'var(--bw-spacing-xs, 4px)',
            textAlign: 'center',
            fontSize: 'var(--bw-typography-font-size-xs, 12px)',
            color: 'var(--bw-colors-foreground-tertiary, #9ca3af)',
          }}
        >
          via {bridgeName.charAt(0).toUpperCase() + bridgeName.slice(1)} Bridge
        </div>
      </div>

      {/* Amount */}
      <div
        style={{
          marginBottom: 'var(--bw-spacing-md, 16px)',
          textAlign: 'center',
        }}
      >
        <span
          style={{
            fontSize: 'var(--bw-typography-font-size-2xl, 24px)',
            fontWeight: 'var(--bw-typography-font-weight-bold, 700)',
            color: 'var(--bw-colors-foreground-primary, #111827)',
          }}
        >
          {formatAmount(amount, token)}
        </span>
        {destinationToken && destinationToken !== token && (
          <div
            style={{
              fontSize: 'var(--bw-typography-font-size-xs, 12px)',
              color: 'var(--bw-colors-foreground-secondary, #6b7280)',
              marginTop: 'var(--bw-spacing-xs, 4px)',
            }}
          >
            Receiving {destinationToken}
          </div>
        )}
      </div>

      {/* Progress bar (only for pending) */}
      {isPending && (
        <div style={{ marginBottom: 'var(--bw-spacing-md, 16px)' }}>
          <div
            style={{
              height: '8px',
              backgroundColor: 'var(--bw-colors-background-secondary, #f3f4f6)',
              borderRadius: 'var(--bw-radii-full, 9999px)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                backgroundColor: 'var(--bw-colors-transaction-progress-bar-pending, #3b82f6)',
                borderRadius: 'var(--bw-radii-full, 9999px)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 'var(--bw-spacing-xs, 4px)',
              fontSize: 'var(--bw-typography-font-size-xs, 12px)',
              color: 'var(--bw-colors-foreground-secondary, #6b7280)',
            }}
          >
            <span>{step}</span>
            <span>{progress}%</span>
          </div>
        </div>
      )}

      {/* Confirmations (for EVM chains) */}
      {isPending && requiredConfirmations > 1 && (
        <div
          style={{
            marginBottom: 'var(--bw-spacing-md, 16px)',
            fontSize: 'var(--bw-typography-font-size-xs, 12px)',
            color: 'var(--bw-colors-foreground-secondary, #6b7280)',
            textAlign: 'center',
          }}
        >
          Confirmations: {confirmations} / {requiredConfirmations}
        </div>
      )}

      {/* Estimated time */}
      {isPending && (
        <div
          style={{
            marginBottom: 'var(--bw-spacing-md, 16px)',
            textAlign: 'center',
            fontSize: 'var(--bw-typography-font-size-sm, 14px)',
            color: 'var(--bw-colors-foreground-secondary, #6b7280)',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{
              display: 'inline-block',
              verticalAlign: 'middle',
              marginRight: 'var(--bw-spacing-xs, 4px)',
            }}
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {formatTimeRemaining(estimatedTimeRemaining)}
        </div>
      )}

      {/* Fee and slippage summary (detailed view) */}
      {detailed && (
        <div
          style={{
            marginBottom: 'var(--bw-spacing-md, 16px)',
            padding: 'var(--bw-spacing-sm, 8px)',
            backgroundColor: 'var(--bw-colors-background-secondary, #f3f4f6)',
            borderRadius: 'var(--bw-radii-md, 6px)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--bw-spacing-sm, 8px)',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 'var(--bw-typography-font-size-xs, 12px)',
                color: 'var(--bw-colors-foreground-tertiary, #9ca3af)',
              }}
            >
              Fee
            </div>
            <div
              style={{
                fontSize: 'var(--bw-typography-font-size-sm, 14px)',
                fontWeight: 'var(--bw-typography-font-weight-semibold, 600)',
                color: 'var(--bw-colors-foreground-primary, #111827)',
              }}
            >
              {formatFee(fee)}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 'var(--bw-typography-font-size-xs, 12px)',
                color: 'var(--bw-colors-foreground-tertiary, #9ca3af)',
              }}
            >
              Slippage
            </div>
            <div
              style={{
                fontSize: 'var(--bw-typography-font-size-sm, 14px)',
                fontWeight: 'var(--bw-typography-font-weight-semibold, 600)',
                color: showSlippageWarning
                  ? 'var(--bw-colors-status-warning, #f59e0b)'
                  : 'var(--bw-colors-foreground-primary, #111827)',
              }}
            >
              {formatSlippage(slippagePercent)}
            </div>
          </div>
        </div>
      )}

      {/* Slippage warning */}
      {showSlippageWarning && (
        <div
          style={{
            marginBottom: 'var(--bw-spacing-md, 16px)',
            padding: 'var(--bw-spacing-sm, 8px)',
            backgroundColor: 'var(--bw-colors-status-warning-bg, #fffbeb)',
            border: '1px solid var(--bw-colors-status-warning-border, #fbbf24)',
            borderRadius: 'var(--bw-radii-md, 6px)',
            fontSize: 'var(--bw-typography-font-size-xs, 12px)',
            color: 'var(--bw-colors-status-warning-text, #b45309)',
          }}
        >
          <strong>⚠️ High Slippage Warning</strong>
          <br />
          Current slippage ({formatSlippage(slippagePercent)}) exceeds recommended threshold (
          {slippageWarningThreshold}%). Consider increasing slippage tolerance or using a different route.
        </div>
      )}

      {/* Error display */}
      {isFailed && error && (
        <div
          style={{
            marginBottom: 'var(--bw-spacing-md, 16px)',
            padding: 'var(--bw-spacing-sm, 8px)',
            backgroundColor: 'var(--bw-colors-status-error-bg, #fee2e2)',
            border: '1px solid var(--bw-colors-status-error-border, #f87171)',
            borderRadius: 'var(--bw-radii-md, 6px)',
          }}
        >
          <div
            style={{
              fontSize: 'var(--bw-typography-font-size-sm, 14px)',
              fontWeight: 'var(--bw-typography-font-weight-semibold, 600)',
              color: 'var(--bw-colors-status-error-text, #dc2626)',
            }}
          >
            Error: {error.message}
          </div>
          {error.suggestedAction && (
            <div
              style={{
                marginTop: 'var(--bw-spacing-xs, 4px)',
                fontSize: 'var(--bw-typography-font-size-xs, 12px)',
                color: 'var(--bw-colors-foreground-secondary, #6b7280)',
              }}
            >
              Suggested action: {error.suggestedAction.replace('_', ' ')}
            </div>
          )}
          {error.recoverable && (
            <button
              onClick={handleRetry}
              style={{
                marginTop: 'var(--bw-spacing-sm, 8px)',
                padding: 'var(--bw-spacing-xs, 4px) var(--bw-spacing-sm, 8px)',
                backgroundColor: 'var(--bw-colors-status-error-text, #dc2626)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--bw-radii-sm, 4px)',
                fontSize: 'var(--bw-typography-font-size-xs, 12px)',
                cursor: 'pointer',
              }}
            >
              Retry Transaction
            </button>
          )}
        </div>
      )}

      {/* Explorer link */}
      {explorerUrl && (
        <div style={{ textAlign: 'center' }}>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 'var(--bw-typography-font-size-sm, 14px)',
              color: 'var(--bw-colors-foreground-link, #3b82f6)',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.textDecoration = 'underline';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.textDecoration = 'none';
            }}
          >
            View on Explorer →
          </a>
        </div>
      )}

      {/* Transaction hash (truncated) */}
      <div
        style={{
          marginTop: 'var(--bw-spacing-md, 16px)',
          textAlign: 'center',
          fontSize: 'var(--bw-typography-font-size-xs, 12px)',
          color: 'var(--bw-colors-foreground-tertiary, #9ca3af)',
          fontFamily: 'var(--bw-typography-font-family-mono, monospace)',
        }}
      >
        {txHash.slice(0, 10)}...{txHash.slice(-8)}
      </div>
    </div>
  );
};

export default BridgeStatus;
