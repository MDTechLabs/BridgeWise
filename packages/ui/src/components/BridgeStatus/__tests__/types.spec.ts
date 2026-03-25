/**
 * BridgeStatus Type Validation Tests
 * These tests validate TypeScript types compile correctly
 */

import type {
  BridgeStatusProps,
  BridgeStatusState,
  BridgeTransactionStatus,
  TransactionStatusDetails,
  TransactionError,
  BridgeStatusHeadlessProps,
  BridgeStatusRenderProps,
} from '../types';
import type { UseBridgeExecutionOptions, UseBridgeExecutionReturn } from '../../../hooks/useBridgeExecution';

// Type assertion helper
function assertType<T>(_value: T) {}

// Validate BridgeStatusProps
const validProps: BridgeStatusProps = {
  txHash: '0x1234567890abcdef',
  bridgeName: 'hop',
  sourceChain: 'ethereum',
  destinationChain: 'polygon',
  amount: 1000,
  token: 'USDC',
  fee: 0.5,
  slippagePercent: 0.25,
  estimatedTimeSeconds: 180,
  detailed: true,
  compact: false,
  slippageWarningThreshold: 1.0,
  disabled: false,
};

assertType<BridgeStatusProps>(validProps);

// Validate status types
const pendingStatus: BridgeTransactionStatus = 'pending';
const confirmedStatus: BridgeTransactionStatus = 'confirmed';
const failedStatus: BridgeTransactionStatus = 'failed';

assertType<BridgeTransactionStatus>(pendingStatus);
assertType<BridgeTransactionStatus>(confirmedStatus);
assertType<BridgeTransactionStatus>(failedStatus);

// Validate TransactionStatusDetails
const statusDetails: TransactionStatusDetails = {
  txHash: '0x123',
  status: 'pending',
  bridgeName: 'hop',
  sourceChain: 'ethereum',
  destinationChain: 'polygon',
  amount: 1000,
  progress: 50,
  confirmations: 5,
  requiredConfirmations: 12,
  timestamp: Date.now(),
};

assertType<TransactionStatusDetails>(statusDetails);

// Validate TransactionError
const error: TransactionError = {
  code: 'TRANSACTION_FAILED',
  message: 'Transaction failed',
  recoverable: true,
  suggestedAction: 'retry',
};

assertType<TransactionError>(error);

// Validate BridgeStatusState
const state: BridgeStatusState = {
  status: 'pending',
  progress: 50,
  step: 'Processing...',
  error: null,
  estimatedTimeRemaining: 120,
  confirmations: 5,
  requiredConfirmations: 12,
  showSlippageWarning: false,
  isHydrated: true,
};

assertType<BridgeStatusState>(state);

// Validate UseBridgeExecutionOptions
const executionOptions: UseBridgeExecutionOptions = {
  pollIntervalMs: 5000,
  maxPollDurationMs: 600000,
  requiredConfirmations: 12,
  estimatedTimeSeconds: 180,
  autoStart: false,
};

assertType<UseBridgeExecutionOptions>(executionOptions);

// Validate UseBridgeExecutionReturn
const executionReturn: UseBridgeExecutionReturn = {
  status: 'pending',
  progress: 50,
  step: 'Processing',
  error: null,
  estimatedTimeRemaining: 120,
  confirmations: 5,
  requiredConfirmations: 12,
  isPolling: true,
  start: () => {},
  stop: () => {},
  retry: () => {},
  details: null,
  isPending: true,
  isConfirmed: false,
  isFailed: false,
};

assertType<UseBridgeExecutionReturn>(executionReturn);

// Validate BridgeStatusHeadlessProps
const headlessProps: BridgeStatusHeadlessProps = {
  children: () => null,
  txHash: '0x123',
  bridgeName: 'hop',
  sourceChain: 'ethereum',
  destinationChain: 'polygon',
  amount: 1000,
};

assertType<BridgeStatusHeadlessProps>(headlessProps);

// Validate BridgeStatusRenderProps
const renderProps: BridgeStatusRenderProps = {
  state,
  props: validProps,
  isPending: true,
  isConfirmed: false,
  isFailed: false,
  timeRemainingText: '2m remaining',
  explorerUrl: 'https://etherscan.io/tx/0x123',
  retry: () => {},
  dismissError: () => {},
};

assertType<BridgeStatusRenderProps>(renderProps);

// Export to make this a module
export {};
