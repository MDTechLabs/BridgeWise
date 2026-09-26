/**
 * StellarWalletConnectionProvider
 *
 * React context provider that wraps the StellarWalletConnectionStateManager
 * and exposes its state reactively to component trees.
 *
 * Follows the same Provider/hook pattern as the existing I18nProvider.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import {
  StellarWalletConnectionStateManager,
  StellarConnectionStatus,
  StellarConnectionEvent,
} from '../../../wallets/stellar/state/stellar-wallet-connection-state';
import type { WalletAccount } from '../../../packages/wallet/src';

// ─── Context Shape ──────────────────────────────────────────────────────────

export interface StellarWalletConnectionContextValue {
  /** Current connection status */
  status: StellarConnectionStatus;
  /** The connected Stellar account, or null */
  account: WalletAccount | null;
  /** The wallet adapter ID used for the current connection */
  adapterId: string | null;
  /** Last error message, if any */
  error: string | null;
  /** Whether the wallet is currently connected */
  isConnected: boolean;
  /** Whether a connect/disconnect operation is in progress */
  isBusy: boolean;
  /** Connect to a Stellar wallet adapter */
  connect: (adapter: WalletAdapter, chainId?: string) => Promise<WalletAccount>;
  /** Disconnect the current wallet */
  disconnect: () => Promise<void>;
  /** Subscribe to connection events */
  onEvent: (listener: (event: StellarConnectionEvent) => void) => () => void;
}

// Re-export for convenience
import type { WalletAdapter } from '../../../packages/wallet/src';

const StellarWalletConnectionContext = createContext<StellarWalletConnectionContextValue | undefined>(
  undefined,
);

// ─── Provider ───────────────────────────────────────────────────────────────

export interface StellarWalletConnectionProviderProps {
  children: ReactNode;
  /** Optional pre-existing state manager instance (for testing or shared usage) */
  stateManager?: StellarWalletConnectionStateManager;
}

export const StellarWalletConnectionProvider: React.FC<StellarWalletConnectionProviderProps> = ({
  children,
  stateManager: externalManager,
}) => {
  const managerRef = useRef<StellarWalletConnectionStateManager>(
    externalManager || new StellarWalletConnectionStateManager(),
  );

  const [status, setStatus] = useState<StellarConnectionStatus>(
    managerRef.current.getStatus(),
  );
  const [account, setAccount] = useState<WalletAccount | null>(
    managerRef.current.getAccount(),
  );
  const [adapterId, setAdapterId] = useState<string | null>(
    managerRef.current.getState().adapterId,
  );
  const [error, setError] = useState<string | null>(
    managerRef.current.getState().error,
  );

  useEffect(() => {
    const manager = managerRef.current;

    const unsubscribe = manager.subscribe((event: StellarConnectionEvent) => {
      switch (event.type) {
        case 'statusChanged':
          setStatus(event.current);
          break;
        case 'accountChanged':
          setAccount(event.current);
          break;
        case 'accountDisconnected':
          setAccount(null);
          break;
        case 'error':
          setError(event.error);
          break;
      }
    });

    // Sync initial state
    const currentState = manager.getState();
    setStatus(currentState.status);
    setAccount(currentState.account);
    setAdapterId(currentState.adapterId);
    setError(currentState.error);

    return unsubscribe;
  }, []);

  const connect = useCallback(
    async (adapter: WalletAdapter, chainId?: string): Promise<WalletAccount> => {
      setError(null);
      const result = await managerRef.current.connect(adapter, chainId);
      setAdapterId(managerRef.current.getState().adapterId);
      return result;
    },
    [],
  );

  const disconnect = useCallback(async (): Promise<void> => {
    await managerRef.current.disconnect();
    setAdapterId(null);
    setError(null);
  }, []);

  const onEvent = useCallback(
    (listener: (event: StellarConnectionEvent) => void): (() => void) => {
      return managerRef.current.subscribe(listener);
    },
    [],
  );

  const value: StellarWalletConnectionContextValue = {
    status,
    account,
    adapterId,
    error,
    isConnected: status === 'connected',
    isBusy: status === 'connecting' || status === 'disconnecting',
    connect,
    disconnect,
    onEvent,
  };

  return (
    <StellarWalletConnectionContext.Provider value={value}>
      {children}
    </StellarWalletConnectionContext.Provider>
  );
};
