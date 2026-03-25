import React, { createContext, useContext, useMemo } from 'react';
import { useWalletConnections } from './useWalletConnections';
import type {
  WalletProviderProps,
  WalletConnection,
  UseWalletConnectionsReturn,
} from './types';

const MultiWalletContext = createContext<UseWalletConnectionsReturn | null>(null);

export const MultiWalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  const walletConnections = useWalletConnections();

  const value = useMemo(() => ({ ...walletConnections }), [walletConnections]);

  return (
    <MultiWalletContext.Provider value={value}>
      {children}
    </MultiWalletContext.Provider>
  );
};

export const useMultiWalletContext = (): UseWalletConnectionsReturn => {
  const context = useContext(MultiWalletContext);
  if (!context) {
    throw new Error('useMultiWalletContext must be used within a MultiWalletProvider');
  }
  return context;
};
