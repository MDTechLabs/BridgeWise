/**
 * TransactionHeartbeat Headless Component
 * Provides transaction state and logic without any styling
 * Uses render props pattern for maximum flexibility
 */

'use client';

import React from 'react';
import { useTransaction } from './TransactionContext';
import type { TransactionState } from './TransactionContext';
import type { BridgeTransaction } from '../../transaction-history/types';

export interface TransactionHeartbeatRenderProps {
  /** Full transaction state object */
  state: TransactionState;
  /** Function to clear/dismiss the transaction state */
  clearState: () => void;
  /** Update transaction state with partial updates */
  updateState: (updates: Partial<TransactionState>) => void;
  /** Start a new transaction */
  startTransaction: (id: string, initialState?: Partial<TransactionState>) => void;
  /** Record a normalized transaction directly into history */
  recordBridgeTransaction: (transaction: Partial<BridgeTransaction>) => Promise<void>;
  /** Convenience boolean: true if status is 'success' */
  isSuccess: boolean;
  /** Convenience boolean: true if status is 'failed' */
  isFailed: boolean;
  /** Convenience boolean: true if status is 'pending' */
  isPending: boolean;
}

export interface TransactionHeartbeatHeadlessProps {
  /**
   * Render function that receives transaction state and controls
   * Return null to hide the component
   */
  children: (props: TransactionHeartbeatRenderProps) => React.ReactNode;
}

/**
 * Headless transaction heartbeat component
 *
 * @example
 * ```tsx
 * <TransactionHeartbeatHeadless>
 *   {({ state, clearState, isSuccess, isPending }) => (
 *     <div className="my-custom-notification">
 *       <h2>{isSuccess ? '✅ Done!' : isPending ? '⏳ Processing...' : '❌ Failed'}</h2>
 *       <progress value={state.progress} max={100} />
 *       <p>{state.step}</p>
 *       <button onClick={clearState}>Dismiss</button>
 *     </div>
 *   )}
 * </TransactionHeartbeatHeadless>
 * ```
 */
export const TransactionHeartbeatHeadless: React.FC<TransactionHeartbeatHeadlessProps> = ({
  children,
}) => {
  const { state, clearState, updateState, startTransaction, recordBridgeTransaction } = useTransaction();

  // Don't render if transaction is idle
  if (state.status === 'idle') {
    return null;
  }

  // Derive convenience booleans from state
  const isSuccess = state.status === 'success';
  const isFailed = state.status === 'failed';
  const isPending = state.status === 'pending';

  return (
    <>
      {children({
        state,
        clearState,
        updateState,
        startTransaction,
        recordBridgeTransaction,
        isSuccess,
        isFailed,
        isPending,
      })}
    </>
  );
};
