/**
 * Wallet Provider Component
 * React context provider for wallet integration
 */

'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { useWallet } from './useWallet';
import type {
  WalletProviderProps,
  WalletContextValue,
  WalletAdapter,
} from './types';

// Create context
const WalletContext = createContext<WalletContextValue | null>(null);

/**
 * WalletProvider component
 * Provides wallet state and functions to child components
 * 
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <WalletProvider autoConnect>
 *       <YourApp />
 *     </WalletProvider>
 *   );
 * }
 * ```
 */
export const WalletProvider: React.FC<WalletProviderProps> = ({
  children,
  adapters,
  autoConnect = false,
  onConnect,
  onDisconnect,
  onError,
}) => {
  const walletState = useWallet({
    adapters,
    autoConnect,
    onConnect,
    onDisconnect,
    onError,
  });

  const value = useMemo<WalletContextValue>(
    () => ({
      ...walletState,
    }),
    [walletState]
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
};

/**
 * Hook to access wallet context
 * Must be used within a WalletProvider
 * 
 * @example
 * ```tsx
 * const { connect, disconnect, account, connected } = useWalletContext();
 * ```
 */
export const useWalletContext = (): WalletContextValue => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWalletContext must be used within a WalletProvider');
  }
  return context;
};

export default WalletProvider;
