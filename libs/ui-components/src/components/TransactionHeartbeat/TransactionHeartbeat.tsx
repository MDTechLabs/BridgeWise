/**
 * TransactionHeartbeat Component
 * Styled notification component for transaction status
 * Uses BridgeWise theme CSS variables for styling
 */

'use client';

import React from 'react';
import { TransactionHeartbeatHeadless } from './TransactionHeartbeat.headless';

/**
 * Transaction heartbeat notification component
 * Displays transaction progress with themed styling
 *
 * @example
 * ```tsx
 * import { TransactionProvider, TransactionHeartbeat } from '@bridgewise/ui-components';
 *
 * function App() {
 *   return (
 *     <TransactionProvider>
 *       <YourApp />
 *       <TransactionHeartbeat />
 *     </TransactionProvider>
 *   );
 * }
 * ```
 */
export const TransactionHeartbeat: React.FC = () => {
  return (
    <TransactionHeartbeatHeadless>
      {({ state, clearState, isSuccess, isFailed, isPending }) => (
        <div
          className="fixed bottom-4 right-4 z-50 w-80 overflow-hidden font-sans"
          style={{
            backgroundColor: 'var(--bw-colors-transaction-background)',
            borderRadius: 'var(--bw-radii-lg)',
            boxShadow: 'var(--bw-shadows-xl)',
            border: `1px solid var(--bw-colors-transaction-border)`,
            transition: `all var(--bw-transitions-base)`,
            fontFamily: 'var(--bw-typography-font-family-sans)',
          }}
        >
          <div style={{ padding: 'var(--bw-spacing-md)' }}>
            {/* Header */}
            <div
              className="flex items-center justify-between"
              style={{ marginBottom: 'var(--bw-spacing-sm)' }}
            >
              <h3
                style={{
                  fontSize: 'var(--bw-typography-font-size-sm)',
                  fontWeight: 'var(--bw-typography-font-weight-semibold)',
                  color: 'var(--bw-colors-foreground-primary)',
                  margin: 0,
                }}
              >
                {isSuccess
                  ? 'Transaction Complete'
                  : isFailed
                  ? 'Transaction Failed'
                  : 'Bridging Assets...'}
              </h3>
              <button
                onClick={clearState}
                aria-label="Close"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'var(--bw-colors-foreground-tertiary)',
                  transition: `color var(--bw-transitions-fast)`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--bw-colors-foreground-secondary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--bw-colors-foreground-tertiary)';
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {/* Progress bar */}
            <div
              className="flex items-center"
              style={{
                gap: 'var(--bw-spacing-sm)',
                marginBottom: 'var(--bw-spacing-sm)',
              }}
            >
              <div style={{ position: 'relative', flex: 1 }}>
                <div
                  style={{
                    height: '0.5rem',
                    backgroundColor: 'var(--bw-colors-background-secondary)',
                    borderRadius: 'var(--bw-radii-full)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${state.progress}%`,
                      backgroundColor: isSuccess
                        ? 'var(--bw-colors-transaction-progress-bar-success)'
                        : isFailed
                        ? 'var(--bw-colors-transaction-progress-bar-error)'
                        : 'var(--bw-colors-transaction-progress-bar-pending)',
                      transition: `all var(--bw-transitions-slow)`,
                    }}
                  />
                </div>
              </div>
              <span
                style={{
                  fontSize: 'var(--bw-typography-font-size-xs)',
                  fontWeight: 'var(--bw-typography-font-weight-medium)',
                  color: 'var(--bw-colors-foreground-tertiary)',
                  width: '2rem',
                  textAlign: 'right',
                }}
              >
                {state.progress}%
              </span>
            </div>

            {/* Status text */}
            <p
              style={{
                fontSize: 'var(--bw-typography-font-size-xs)',
                color: 'var(--bw-colors-foreground-secondary)',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {state.step}
            </p>

            {/* Transaction hash link */}
            {state.txHash && (
              <div style={{ marginTop: 'var(--bw-spacing-sm)' }}>
                <a
                  href="#"
                  style={{
                    fontSize: 'var(--bw-typography-font-size-xs)',
                    color: 'var(--bw-colors-foreground-link)',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.textDecoration = 'underline';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.textDecoration = 'none';
                  }}
                >
                  View on explorer
                </a>
              </div>
            )}
          </div>

          {/* Status indicator bar at bottom */}
          <div
            style={{
              height: '0.25rem',
              width: '100%',
              backgroundColor: isSuccess
                ? 'var(--bw-colors-status-success)'
                : isFailed
                ? 'var(--bw-colors-status-error)'
                : 'var(--bw-colors-status-pending)',
              animation: isPending ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
            }}
          />

          {/* Pulse animation keyframes */}
          <style>
            {`
              @keyframes pulse {
                0%, 100% {
                  opacity: 1;
                }
                50% {
                  opacity: 0.5;
                }
              }
            `}
          </style>
        </div>
      )}
    </TransactionHeartbeatHeadless>
  );
};
