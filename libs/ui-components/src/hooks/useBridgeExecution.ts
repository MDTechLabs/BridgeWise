/**
 * useBridgeExecution Hook
 * Manages cross-chain bridge transaction execution with status tracking
 * Supports both Stellar and EVM transactions
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  BridgeTransactionStatus,
  TransactionStatusDetails,
  TransactionError,
  BridgeProvider,
  ChainId,
} from '../components/BridgeStatus/types';

/**
 * Configuration options for useBridgeExecution
 */
export interface UseBridgeExecutionOptions {
  /** Polling interval in milliseconds */
  pollIntervalMs?: number;
  /** Maximum polling duration in milliseconds */
  maxPollDurationMs?: number;
  /** Number of confirmations required for EVM chains */
  requiredConfirmations?: number;
  /** Estimated time for transaction completion in seconds */
  estimatedTimeSeconds?: number;
  /** Callback when status changes */
  onStatusChange?: (status: BridgeTransactionStatus, details?: TransactionStatusDetails) => void;
  /** Callback when transaction is confirmed */
  onConfirmed?: (details: TransactionStatusDetails) => void;
  /** Callback when transaction fails */
  onFailed?: (error: TransactionError) => void;
  /** Whether to auto-start polling on mount */
  autoStart?: boolean;
}

/**
 * Return type for useBridgeExecution hook
 */
export interface UseBridgeExecutionReturn {
  /** Current transaction status */
  status: BridgeTransactionStatus;
  /** Progress percentage (0-100) */
  progress: number;
  /** Current execution step description */
  step: string;
  /** Error information if failed */
  error: TransactionError | null;
  /** Estimated time remaining in seconds */
  estimatedTimeRemaining: number;
  /** Number of confirmations received */
  confirmations: number;
  /** Required confirmations for completion */
  requiredConfirmations: number;
  /** Whether currently polling for status */
  isPolling: boolean;
  /** Start transaction monitoring */
  start: (
    txHash: string,
    provider: BridgeProvider,
    sourceChain: ChainId,
    destinationChain: ChainId,
    amount?: number,
    token?: string,
    fee?: number,
    slippagePercent?: number
  ) => void;
  /** Stop transaction monitoring */
  stop: () => void;
  /** Retry failed transaction */
  retry: () => void;
  /** Current transaction details */
  details: TransactionStatusDetails | null;
  /** Whether transaction is pending */
  isPending: boolean;
  /** Whether transaction is confirmed */
  isConfirmed: boolean;
  /** Whether transaction failed */
  isFailed: boolean;
}

// Default configuration
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_MAX_POLL_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_REQUIRED_CONFIRMATIONS = 12;
const DEFAULT_ESTIMATED_TIME_SECONDS = 180; // 3 minutes

// Chain-specific confirmation requirements
const CHAIN_CONFIRMATIONS: Record<string, number> = {
  ethereum: 12,
  polygon: 20,
  arbitrum: 10,
  optimism: 10,
  base: 10,
  stellar: 1, // Stellar has instant finality
  solana: 32,
};

// Chain-specific estimated times (in seconds)
const CHAIN_ESTIMATED_TIMES: Record<string, number> = {
  ethereum: 180,
  polygon: 120,
  arbitrum: 60,
  optimism: 60,
  base: 60,
  stellar: 30,
  solana: 30,
};

/**
 * Mock function to simulate transaction status checking
 * In production, this would call actual bridge APIs or RPC endpoints
 */
const checkTransactionStatus = async (
  txHash: string,
  provider: BridgeProvider,
  sourceChain: ChainId,
  destinationChain: ChainId,
): Promise<{
  status: BridgeTransactionStatus;
  progress: number;
  confirmations: number;
  step: string;
}> => {
  // Simulate API call delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // This is a mock implementation
  // In production, this would:
  // 1. Call the bridge provider's API
  // 2. Check source chain RPC for confirmations
  // 3. Check destination chain for completion
  // 4. Return actual status

  const random = Math.random();
  
  // Simulate progressive status
  if (random < 0.1) {
    return {
      status: 'pending',
      progress: 10,
      confirmations: 0,
      step: 'Submitting to source chain...',
    };
  } else if (random < 0.3) {
    return {
      status: 'pending',
      progress: 30,
      confirmations: 2,
      step: 'Waiting for source confirmations...',
    };
  } else if (random < 0.5) {
    return {
      status: 'pending',
      progress: 50,
      confirmations: 6,
      step: 'Relaying to destination chain...',
    };
  } else if (random < 0.7) {
    return {
      status: 'pending',
      progress: 75,
      confirmations: 10,
      step: 'Finalizing on destination...',
    };
  } else if (random < 0.9) {
    return {
      status: 'confirmed',
      progress: 100,
      confirmations: CHAIN_CONFIRMATIONS[destinationChain.toLowerCase()] || DEFAULT_REQUIRED_CONFIRMATIONS,
      step: 'Transaction complete',
    };
  } else {
    // Simulate occasional failures
    return {
      status: 'failed',
      progress: 0,
      confirmations: 0,
      step: 'Transaction failed',
    };
  }
};

/**
 * Hook for managing bridge transaction execution
 * 
 * @example
 * ```tsx
 * const {
 *   status,
 *   progress,
 *   isPending,
 *   start,
 *   retry
 * } = useBridgeExecution({
 *   onStatusChange: (status) => console.log('Status:', status),
 *   onConfirmed: (details) => console.log('Confirmed:', details),
 * });
 * 
 * // Start monitoring a transaction
 * start('0x123...', 'hop', 'ethereum', 'polygon');
 * ```
 */
export function useBridgeExecution(
  options: UseBridgeExecutionOptions = {}
): UseBridgeExecutionReturn {
  const {
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    maxPollDurationMs = DEFAULT_MAX_POLL_DURATION_MS,
    requiredConfirmations: userConfirmations,
    estimatedTimeSeconds: userEstimatedTime,
    onStatusChange,
    onConfirmed,
    onFailed,
    autoStart = false,
  } = options;

  // State
  const [status, setStatus] = useState<BridgeTransactionStatus>('pending');
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState('Initializing...');
  const [error, setError] = useState<TransactionError | null>(null);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(
    userEstimatedTime || DEFAULT_ESTIMATED_TIME_SECONDS
  );
  const [confirmations, setConfirmations] = useState(0);
  const [isPolling, setIsPolling] = useState(false);
  const [details, setDetails] = useState<TransactionStatusDetails | null>(null);

  // Refs for managing polling
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartTimeRef = useRef<number>(0);
  const txInfoRef = useRef<{
    txHash: string;
    provider: BridgeProvider;
    sourceChain: ChainId;
    destinationChain: ChainId;
    amount: number;
    token?: string;
    fee?: number;
    slippagePercent?: number;
  } | null>(null);

  const requiredConfirmations =
    userConfirmations ||
    (txInfoRef.current?.destinationChain
      ? CHAIN_CONFIRMATIONS[txInfoRef.current.destinationChain.toLowerCase()] || DEFAULT_REQUIRED_CONFIRMATIONS
      : DEFAULT_REQUIRED_CONFIRMATIONS);

  // Computed states
  const isPending = status === 'pending';
  const isConfirmed = status === 'confirmed';
  const isFailed = status === 'failed';

  // Clear polling interval
  const clearPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  // Create transaction details object
  const createDetails = useCallback((): TransactionStatusDetails | null => {
    if (!txInfoRef.current) return null;
    const { txHash, provider, sourceChain, destinationChain, amount, token, fee, slippagePercent } =
      txInfoRef.current;
    return {
      txHash,
      status,
      bridgeName: provider,
      sourceChain,
      destinationChain,
      amount,
      token,
      fee,
      slippagePercent,
      progress,
      estimatedTimeRemaining,
      confirmations,
      requiredConfirmations,
      timestamp: Date.now(),
    };
  }, [status, progress, estimatedTimeRemaining, confirmations, requiredConfirmations]);

  // Update status with callbacks
  const updateStatus = useCallback(
    (newStatus: BridgeTransactionStatus, newDetails?: TransactionStatusDetails) => {
      setStatus(newStatus);
      const detailsToSend = newDetails || createDetails();
      
      if (detailsToSend) {
        setDetails(detailsToSend);
        onStatusChange?.(newStatus, detailsToSend);

        if (newStatus === 'confirmed') {
          onConfirmed?.(detailsToSend);
        } else if (newStatus === 'failed') {
          const txError: TransactionError = {
            code: 'TRANSACTION_FAILED',
            message: 'Transaction failed during execution',
            txHash: detailsToSend.txHash,
            recoverable: true,
            suggestedAction: 'retry',
          };
          setError(txError);
          onFailed?.(txError);
        }
      }
    },
    [createDetails, onStatusChange, onConfirmed, onFailed]
  );

  // Poll for transaction status
  const pollStatus = useCallback(async () => {
    if (!txInfoRef.current) return;

    const { txHash, provider, sourceChain, destinationChain } = txInfoRef.current;

    // Check for timeout
    if (Date.now() - pollStartTimeRef.current > maxPollDurationMs) {
      clearPolling();
      const timeoutError: TransactionError = {
        code: 'POLLING_TIMEOUT',
        message: 'Transaction monitoring timed out. Please check explorer for status.',
        txHash,
        recoverable: false,
        suggestedAction: 'contact_support',
      };
      setError(timeoutError);
      updateStatus('failed', createDetails() || undefined);
      onFailed?.(timeoutError);
      return;
    }

    try {
      const result = await checkTransactionStatus(txHash, provider, sourceChain, destinationChain);

      setProgress(result.progress);
      setStep(result.step);
      setConfirmations(result.confirmations);

      // Update estimated time remaining
      setEstimatedTimeRemaining((prev) => {
        if (result.status === 'confirmed') return 0;
        const elapsed = (Date.now() - pollStartTimeRef.current) / 1000;
        const total = userEstimatedTime || CHAIN_ESTIMATED_TIMES[destinationChain.toLowerCase()] || DEFAULT_ESTIMATED_TIME_SECONDS;
        return Math.max(0, Math.round(total - elapsed));
      });

      if (result.status !== status) {
        updateStatus(result.status, createDetails() || undefined);

        if (result.status === 'confirmed' || result.status === 'failed') {
          clearPolling();
        }
      }
    } catch (err) {
      console.error('Error polling transaction status:', err);
      // Don't stop polling on error, just retry next interval
    }
  }, [
    status,
    maxPollDurationMs,
    userEstimatedTime,
    clearPolling,
    updateStatus,
    createDetails,
    onFailed,
  ]);

  // Start monitoring a transaction
  const start = useCallback(
    (
      txHash: string,
      provider: BridgeProvider,
      sourceChain: ChainId,
      destinationChain: ChainId,
      amount: number = 0,
      token?: string,
      fee?: number,
      slippagePercent?: number
    ) => {
      // Reset state
      setStatus('pending');
      setProgress(0);
      setStep('Initializing...');
      setError(null);
      setConfirmations(0);
      setEstimatedTimeRemaining(
        userEstimatedTime || CHAIN_ESTIMATED_TIMES[destinationChain.toLowerCase()] || DEFAULT_ESTIMATED_TIME_SECONDS
      );

      // Store transaction info
      txInfoRef.current = {
        txHash,
        provider,
        sourceChain,
        destinationChain,
        amount,
        token,
        fee,
        slippagePercent,
      };

      // Start polling
      pollStartTimeRef.current = Date.now();
      setIsPolling(true);

      // Initial status check
      void pollStatus();

      // Set up polling interval
      pollIntervalRef.current = setInterval(() => {
        void pollStatus();
      }, pollIntervalMs);
    },
    [pollIntervalMs, userEstimatedTime, pollStatus]
  );

  // Stop monitoring
  const stop = useCallback(() => {
    clearPolling();
  }, [clearPolling]);

  // Retry failed transaction
  const retry = useCallback(() => {
    if (txInfoRef.current) {
      const { txHash, provider, sourceChain, destinationChain, amount, token, fee, slippagePercent } =
        txInfoRef.current;
      start(txHash, provider, sourceChain, destinationChain, amount, token, fee, slippagePercent);
    }
  }, [start]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearPolling();
    };
  }, [clearPolling]);

  return {
    status,
    progress,
    step,
    error,
    estimatedTimeRemaining,
    confirmations,
    requiredConfirmations,
    isPolling,
    start,
    stop,
    retry,
    details,
    isPending,
    isConfirmed,
    isFailed,
  };
}

export default useBridgeExecution;
