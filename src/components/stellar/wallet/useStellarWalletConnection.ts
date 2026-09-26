/**
 * useStellarWalletConnection
 *
 * React hook to access Stellar wallet connection state.
 * Must be used within a StellarWalletConnectionProvider.
 *
 * @example
 * ```tsx
 * const { status, account, isConnected, connect, disconnect } = useStellarWalletConnection();
 *
 * // Connect to Freighter
 * const freighter = new FreighterAdapter();
 * await connect(freighter, 'stellar:testnet');
 * ```
 */

import { useContext } from 'react';
import { StellarWalletConnectionContext } from './StellarWalletConnectionProvider';
import type { StellarWalletConnectionContextValue } from './StellarWalletConnectionProvider';

export function useStellarWalletConnection(): StellarWalletConnectionContextValue {
  const context = useContext(StellarWalletConnectionContext);

  if (!context) {
    throw new Error(
      'useStellarWalletConnection must be used within a <StellarWalletConnectionProvider>',
    );
  }

  return context;
}

/**
 * Hook that returns only the connection status (lightweight selector).
 */
export function useStellarConnectionStatus(): StellarWalletConnectionContextValue['status'] {
  const { status } = useStellarWalletConnection();
  return status;
}

/**
 * Hook that returns only the connected account (lightweight selector).
 */
export function useStellarAccount(): WalletAccount | null {
  const { account } = useStellarWalletConnection();
  return account;
}

/**
 * Hook that returns only the connection boolean flag (lightweight selector).
 */
export function useStellarIsConnected(): boolean {
  const { isConnected } = useStellarWalletConnection();
  return isConnected;
}

import type { WalletAccount } from '../../../packages/wallet/src';
