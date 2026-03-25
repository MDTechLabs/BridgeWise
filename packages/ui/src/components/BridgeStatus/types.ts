/**
 * BridgeStatus Component Types
 * Type definitions for the BridgeStatus transaction tracking component
 */

import type { ReactNode } from 'react';

/**
 * Transaction status states
 */
export type BridgeTransactionStatus = 'pending' | 'confirmed' | 'failed';

/**
 * Chain identifier type
 */
export type ChainId = string;

/**
 * Bridge provider name type
 */
export type BridgeProvider = string;

/**
 * Props for the BridgeStatus component
 */
export interface BridgeStatusProps {
  /** Transaction hash for tracking */
  txHash: string;
  /** Name of the bridge provider (e.g., 'hop', 'layerzero', 'stellar') */
  bridgeName: BridgeProvider;
  /** Source chain identifier */
  sourceChain: ChainId;
  /** Destination chain identifier */
  destinationChain: ChainId;
  /** Amount being transferred */
  amount: number;
  /** Token symbol being transferred */
  token?: string;
  /** Optional token symbol for destination (for swaps) */
  destinationToken?: string;
  /** Optional transaction fee */
  fee?: number;
  /** Optional slippage percentage */
  slippagePercent?: number;
  /** Estimated completion time in seconds */
  estimatedTimeSeconds?: number;
  /** Callback fired when status changes */
  onStatusChange?: (status: BridgeTransactionStatus, details?: TransactionStatusDetails) => void;
  /** Callback fired when transaction is confirmed */
  onConfirmed?: (details: TransactionStatusDetails) => void;
  /** Callback fired when transaction fails */
  onFailed?: (error: TransactionError) => void;
  /** Callback for retry action */
  onRetry?: () => void;
  /** Custom class name for styling overrides */
  className?: string;
  /** Custom inline styles */
  style?: React.CSSProperties;
  /** Whether to show detailed view with fees and slippage */
  detailed?: boolean;
  /** Whether to show compact/minimal view */
  compact?: boolean;
  /** Slippage threshold for warnings (default: 1.0 = 1%) */
  slippageWarningThreshold?: number;
  /** Custom explorer URL template (use {{txHash}} placeholder) */
  explorerUrlTemplate?: string;
  /** Whether component is disabled */
  disabled?: boolean;
  /** Test ID for testing */
  'data-testid'?: string;
}

/**
 * Transaction status details passed to callbacks
 */
export interface TransactionStatusDetails {
  txHash: string;
  status: BridgeTransactionStatus;
  bridgeName: BridgeProvider;
  sourceChain: ChainId;
  destinationChain: ChainId;
  amount: number;
  token?: string;
  fee?: number;
  slippagePercent?: number;
  progress: number;
  estimatedTimeRemaining?: number;
  confirmations?: number;
  requiredConfirmations?: number;
  timestamp: number;
}

/**
 * Transaction error details
 */
export interface TransactionError {
  code: string;
  message: string;
  txHash?: string;
  recoverable: boolean;
  suggestedAction?: 'retry' | 'increase_slippage' | 'change_bridge' | 'contact_support';
}

/**
 * Internal state for the BridgeStatus component
 */
export interface BridgeStatusState {
  status: BridgeTransactionStatus;
  progress: number;
  step: string;
  error: TransactionError | null;
  estimatedTimeRemaining: number;
  confirmations: number;
  requiredConfirmations: number;
  showSlippageWarning: boolean;
  isHydrated: boolean;
}

/**
 * Props for status badge component
 */
export interface StatusBadgeProps {
  status: BridgeTransactionStatus;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Props for progress indicator component
 */
export interface ProgressIndicatorProps {
  progress: number;
  status: BridgeTransactionStatus;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Props for fee summary component
 */
export interface FeeSummaryProps {
  fee?: number;
  slippagePercent?: number;
  amount: number;
  showWarning?: boolean;
  warningThreshold?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Props for estimated time display
 */
export interface EstimatedTimeProps {
  secondsRemaining: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Props for error display component
 */
export interface ErrorDisplayProps {
  error: TransactionError;
  onRetry?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Render props for headless BridgeStatus component
 */
export interface BridgeStatusRenderProps {
  /** Current transaction state */
  state: BridgeStatusState;
  /** Original props passed to component */
  props: BridgeStatusProps;
  /** Whether transaction is pending */
  isPending: boolean;
  /** Whether transaction is confirmed */
  isConfirmed: boolean;
  /** Whether transaction failed */
  isFailed: boolean;
  /** Formatted time remaining string */
  timeRemainingText: string;
  /** Explorer URL for the transaction */
  explorerUrl: string | null;
  /** Function to retry the transaction */
  retry: () => void;
  /** Function to dismiss error */
  dismissError: () => void;
}

/**
 * Props for headless BridgeStatus component
 */
export interface BridgeStatusHeadlessProps {
  /** Render function for custom UI */
  children: (props: BridgeStatusRenderProps) => ReactNode;
  /** Transaction hash */
  txHash: string;
  /** Bridge provider name */
  bridgeName: BridgeProvider;
  /** Source chain */
  sourceChain: ChainId;
  /** Destination chain */
  destinationChain: ChainId;
  /** Amount being transferred */
  amount: number;
  /** Optional callbacks and configuration */
  onStatusChange?: (status: BridgeTransactionStatus, details?: TransactionStatusDetails) => void;
  onConfirmed?: (details: TransactionStatusDetails) => void;
  onFailed?: (error: TransactionError) => void;
  onRetry?: () => void;
  token?: string;
  fee?: number;
  slippagePercent?: number;
  estimatedTimeSeconds?: number;
  slippageWarningThreshold?: number;
  explorerUrlTemplate?: string;
}
