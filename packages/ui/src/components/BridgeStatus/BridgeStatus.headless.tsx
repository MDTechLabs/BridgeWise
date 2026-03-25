/**
 * BridgeStatus Headless Component
 * Provides transaction status logic without any styling
 * Uses render props pattern for maximum flexibility
 */

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useBridgeExecution } from '../../hooks/useBridgeExecution';
import type {
  BridgeStatusHeadlessProps,
  BridgeStatusRenderProps,
  BridgeTransactionStatus,
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

/**
 * BridgeStatusHeadless Component
 * Headless component that provides transaction status logic via render props
 * 
 * @example
 * ```tsx
 * <BridgeStatusHeadless
 *   txHash="0x123..."
 *   bridgeName="hop"
 *   sourceChain="ethereum"
 *   destinationChain="polygon"
 *   amount={1000}
 * >
 *   {({ state, isPending, isConfirmed, timeRemainingText }) => (
 *     <div className="my-custom-status">
 *       {isPending && <span>Processing... {state.progress}%</span>}
 *       {isConfirmed && <span>Complete!</span>}
 *       <p>{timeRemainingText}</p>
 *     </div>
 *   )}
 * </BridgeStatusHeadless>
 * ```
 */
export const BridgeStatusHeadless: React.FC<BridgeStatusHeadlessProps> = ({
  children,
  txHash,
  bridgeName,
  sourceChain,
  destinationChain,
  amount,
  onStatusChange,
  onConfirmed,
  onFailed,
  onRetry,
  token,
  fee,
  slippagePercent,
  estimatedTimeSeconds,
  slippageWarningThreshold = 1.0,
  explorerUrlTemplate,
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
  } = useBridgeExecution({
    estimatedTimeSeconds,
    onStatusChange,
    onConfirmed,
    onFailed,
    autoStart: false,
  });

  // Start monitoring when component mounts
  useEffect(() => {
    if (isHydrated) {
      start(
        txHash,
        bridgeName,
        sourceChain,
        destinationChain,
        amount,
        token,
        fee,
        slippagePercent
      );
    }
  }, [txHash, bridgeName, sourceChain, destinationChain, amount, token, fee, slippagePercent, isHydrated, start]);

  // Handle retry
  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry();
    } else {
      retry();
    }
  }, [onRetry, retry]);

  // Handle dismiss error
  const dismissError = useCallback(() => {
    // Error is cleared by the hook when status changes
  }, []);

  // Check slippage warning
  const showSlippageWarning =
    slippagePercent !== undefined && slippagePercent > slippageWarningThreshold;

  // Get explorer URL
  const explorerUrl = getExplorerUrl(txHash, sourceChain, explorerUrlTemplate);

  // Build state object
  const state = {
    status,
    progress,
    step,
    error,
    estimatedTimeRemaining,
    confirmations,
    requiredConfirmations,
    showSlippageWarning,
    isHydrated,
  };

  // Build props object for render
  const renderProps: BridgeStatusRenderProps = {
    state,
    props: {
      txHash,
      bridgeName,
      sourceChain,
      destinationChain,
      amount,
      token,
      fee,
      slippagePercent,
      onStatusChange,
      onConfirmed,
      onFailed,
      onRetry,
      slippageWarningThreshold,
      explorerUrlTemplate,
    },
    isPending,
    isConfirmed,
    isFailed,
    timeRemainingText: formatTimeRemaining(estimatedTimeRemaining),
    explorerUrl,
    retry: handleRetry,
    dismissError,
  };

  return <>{children(renderProps)}</>;
};

export default BridgeStatusHeadless;
