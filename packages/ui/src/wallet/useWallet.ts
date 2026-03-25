/**
 * useWallet Hook
 * React hook for wallet integration with SSR-safe behavior
 */

'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type {
  WalletAdapter,
  WalletAccount,
  TokenBalance,
  WalletError,
  WalletEvent,
  WalletEventCallback,
  ChainId,
  NetworkType,
  WalletTransaction,
  UseWalletReturn,
  UseWalletOptions,
  WalletType,
} from './types';

// Import adapters
import { MetaMaskAdapter } from './adapters/MetaMaskAdapter';
import { WalletConnectAdapter } from './adapters/WalletConnectAdapter';
import { StellarAdapter } from './adapters/StellarAdapter';

// Default adapters factory
const createDefaultAdapters = (): WalletAdapter[] => {
  const adapters: WalletAdapter[] = [];

  // MetaMask
  const metaMask = new MetaMaskAdapter();
  if (metaMask.isAvailable) {
    adapters.push(metaMask);
  }

  // Stellar wallets
  const stellar = new StellarAdapter();
  if (stellar.isAvailable) {
    adapters.push(stellar);
  }

  return adapters;
};

/**
 * useWallet hook
 * 
 * @example
 * ```tsx
 * const { 
 *   connect, 
 *   disconnect, 
 *   account, 
 *   balances, 
 *   connected,
 *   error 
 * } = useWallet({
 *   onConnect: (account) => console.log('Connected:', account),
 *   onError: (error) => console.error('Error:', error),
 * });
 * 
 * // Connect to MetaMask
 * await connect('metamask');
 * 
 * // Connect to Stellar
 * await connect('stellar');
 * ```
 */
export function useWallet(options: UseWalletOptions = {}): UseWalletReturn {
  const {
    adapters: userAdapters,
    autoConnect = false,
    onConnect,
    onDisconnect,
    onAccountChange,
    onNetworkChange,
    onError,
  } = options;

  // SSR safety
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Initialize adapters
  const adapters = useMemo(() => {
    if (!isClient) return [];
    return userAdapters || createDefaultAdapters();
  }, [userAdapters, isClient]);

  // State
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<ChainId | null>(null);
  const [network, setNetwork] = useState<NetworkType | null>(null);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [error, setError] = useState<WalletError | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<WalletAdapter | null>(null);

  // Refs for tracking
  const isMountedRef = useRef(true);
  const eventCleanupRef = useRef<(() => void) | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (eventCleanupRef.current) {
        eventCleanupRef.current();
      }
    };
  }, []);

  // Setup event listeners for the selected wallet
  const setupWalletEvents = useCallback((wallet: WalletAdapter) => {
    // Clean up previous listeners
    if (eventCleanupRef.current) {
      eventCleanupRef.current();
      eventCleanupRef.current = null;
    }

    const handleConnect = (data: unknown) => {
      if (!isMountedRef.current) return;
      const accountData = data as WalletAccount;
      setAccount(accountData.address);
      setChainId(accountData.chainId);
      setNetwork(accountData.network);
      setConnected(true);
      onConnect?.(accountData);
    };

    const handleDisconnect = () => {
      if (!isMountedRef.current) return;
      setAccount(null);
      setChainId(null);
      setNetwork(null);
      setBalances([]);
      setConnected(false);
      setSelectedWallet(null);
      onDisconnect?.();
    };

    const handleAccountsChanged = (data: unknown) => {
      if (!isMountedRef.current) return;
      const { account: newAccount } = data as { account: string };
      setAccount(newAccount);
      if (newAccount) {
        wallet.getAccount().then((acc) => {
          if (acc && isMountedRef.current) {
            onAccountChange?.(acc);
          }
        });
      } else {
        onAccountChange?.(null);
      }
    };

    const handleChainChanged = (data: unknown) => {
      if (!isMountedRef.current) return;
      const { chainId: newChainId } = data as { chainId: ChainId };
      setChainId(newChainId);
      wallet.getAccount().then((acc) => {
        if (acc && isMountedRef.current) {
          setNetwork(acc.network);
          onNetworkChange?.(newChainId, acc.network);
        }
      });
    };

    const handleError = (data: unknown) => {
      if (!isMountedRef.current) return;
      const walletError = data as WalletError;
      setError(walletError);
      onError?.(walletError);
    };

    // Subscribe to events
    wallet.on('connect', handleConnect);
    wallet.on('disconnect', handleDisconnect);
    wallet.on('accountsChanged', handleAccountsChanged);
    wallet.on('chainChanged', handleChainChanged);
    wallet.on('error', handleError);

    // Store cleanup function
    eventCleanupRef.current = () => {
      wallet.off('connect', handleConnect);
      wallet.off('disconnect', handleDisconnect);
      wallet.off('accountsChanged', handleAccountsChanged);
      wallet.off('chainChanged', handleChainChanged);
      wallet.off('error', handleError);
    };
  }, [onConnect, onDisconnect, onAccountChange, onNetworkChange, onError]);

  // Connect to a wallet
  const connect = useCallback(
    async (walletType: WalletType | WalletAdapter, targetChainId?: ChainId) => {
      if (!isClient) {
        throw new Error('Cannot connect on server side');
      }

      setConnecting(true);
      setError(null);

      try {
        let wallet: WalletAdapter;

        // Handle adapter instance
        if (typeof walletType === 'object' && 'connect' in walletType) {
          wallet = walletType;
        } else {
          // Find adapter by type
          const foundAdapter = adapters.find((a) => a.type === walletType || a.id === walletType);
          if (!foundAdapter) {
            throw {
              code: 'WALLET_NOT_FOUND',
              message: `Wallet adapter for ${walletType} not found or not available`,
            } as WalletError;
          }
          wallet = foundAdapter;
        }

        // Check if already connected
        if (selectedWallet?.id === wallet.id && connected) {
          throw {
            code: 'ALREADY_CONNECTED',
            message: 'Already connected to this wallet',
          } as WalletError;
        }

        // Disconnect from current wallet if any
        if (selectedWallet && selectedWallet.id !== wallet.id) {
          await selectedWallet.disconnect();
        }

        // Connect
        const accountData = await wallet.connect(targetChainId);

        if (!isMountedRef.current) return;

        // Update state
        setSelectedWallet(wallet);
        setAccount(accountData.address);
        setChainId(accountData.chainId);
        setNetwork(accountData.network);
        setConnected(true);

        // Setup event listeners
        setupWalletEvents(wallet);

        // Fetch initial balances
        try {
          const initialBalances = await wallet.getAllBalances();
          if (isMountedRef.current) {
            setBalances(initialBalances);
          }
        } catch (balanceError) {
          console.error('Failed to fetch initial balances:', balanceError);
        }

        onConnect?.(accountData);
      } catch (err) {
        if (!isMountedRef.current) return;
        const walletError = err as WalletError;
        setError(walletError);
        onError?.(walletError);
        throw err;
      } finally {
        if (isMountedRef.current) {
          setConnecting(false);
        }
      }
    },
    [adapters, connected, isClient, onConnect, onError, selectedWallet, setupWalletEvents]
  );

  // Disconnect from wallet
  const disconnect = useCallback(async () => {
    if (!selectedWallet) return;

    setDisconnecting(true);

    try {
      await selectedWallet.disconnect();

      if (!isMountedRef.current) return;

      // Clean up event listeners
      if (eventCleanupRef.current) {
        eventCleanupRef.current();
        eventCleanupRef.current = null;
      }

      // Reset state
      setSelectedWallet(null);
      setAccount(null);
      setChainId(null);
      setNetwork(null);
      setBalances([]);
      setConnected(false);
      setError(null);

      onDisconnect?.();
    } catch (err) {
      if (!isMountedRef.current) return;
      const walletError = err as WalletError;
      setError(walletError);
      onError?.(walletError);
      throw err;
    } finally {
      if (isMountedRef.current) {
        setDisconnecting(false);
      }
    }
  }, [onDisconnect, onError, selectedWallet]);

  // Select a wallet without connecting
  const selectWallet = useCallback(
    (wallet: WalletType | WalletAdapter) => {
      if (typeof wallet === 'object' && 'connect' in wallet) {
        setSelectedWallet(wallet);
      } else {
        const foundAdapter = adapters.find((a) => a.type === wallet || a.id === wallet);
        if (foundAdapter) {
          setSelectedWallet(foundAdapter);
        }
      }
    },
    [adapters]
  );

  // Switch network
  const switchNetwork = useCallback(
    async (targetChainId: ChainId) => {
      if (!selectedWallet) {
        throw {
          code: 'NOT_CONNECTED',
          message: 'No wallet connected',
        } as WalletError;
      }

      try {
        await selectedWallet.switchNetwork(targetChainId);

        if (!isMountedRef.current) return;

        setChainId(targetChainId);

        // Refresh balances after network switch
        const newBalances = await selectedWallet.getAllBalances();
        if (isMountedRef.current) {
          setBalances(newBalances);
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        const walletError = err as WalletError;
        setError(walletError);
        onError?.(walletError);
        throw err;
      }
    },
    [onError, selectedWallet]
  );

  // Refresh balances
  const refreshBalances = useCallback(async () => {
    if (!selectedWallet) return;

    try {
      const newBalances = await selectedWallet.getAllBalances();
      if (isMountedRef.current) {
        setBalances(newBalances);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      const walletError = err as WalletError;
      setError(walletError);
      onError?.(walletError);
    }
  }, [onError, selectedWallet]);

  // Sign data
  const sign = useCallback(
    async (data: string | object) => {
      if (!selectedWallet) {
        throw {
          code: 'NOT_CONNECTED',
          message: 'No wallet connected',
        } as WalletError;
      }

      try {
        return await selectedWallet.sign(data);
      } catch (err) {
        const walletError = err as WalletError;
        setError(walletError);
        onError?.(walletError);
        throw err;
      }
    },
    [onError, selectedWallet]
  );

  // Send transaction
  const sendTransaction = useCallback(
    async (transaction: WalletTransaction) => {
      if (!selectedWallet) {
        throw {
          code: 'NOT_CONNECTED',
          message: 'No wallet connected',
        } as WalletError;
      }

      try {
        return await selectedWallet.sendTransaction(transaction);
      } catch (err) {
        const walletError = err as WalletError;
        setError(walletError);
        onError?.(walletError);
        throw err;
      }
    },
    [onError, selectedWallet]
  );

  // Auto-connect on mount
  useEffect(() => {
    if (!isClient || !autoConnect) return;

    // Try to restore connection from storage
    const tryAutoConnect = async () => {
      try {
        const storedWalletId = localStorage.getItem('bridgewise_wallet_id');
        const storedChainId = localStorage.getItem('bridgewise_chain_id');

        if (storedWalletId) {
          const wallet = adapters.find((a) => a.id === storedWalletId);
          if (wallet) {
            await connect(wallet, storedChainId as ChainId | undefined);
          }
        }
      } catch {
        // Auto-connect failed, clear storage
        localStorage.removeItem('bridgewise_wallet_id');
        localStorage.removeItem('bridgewise_chain_id');
      }
    };

    void tryAutoConnect();
  }, [adapters, autoConnect, connect, isClient]);

  // Persist connection to storage
  useEffect(() => {
    if (!isClient) return;

    if (connected && selectedWallet) {
      localStorage.setItem('bridgewise_wallet_id', selectedWallet.id);
      if (chainId) {
        localStorage.setItem('bridgewise_chain_id', chainId);
      }
    } else if (!connected) {
      localStorage.removeItem('bridgewise_wallet_id');
      localStorage.removeItem('bridgewise_chain_id');
    }
  }, [chainId, connected, isClient, selectedWallet]);

  // Build state object
  const state = useMemo(
    () => ({
      connected,
      connecting,
      disconnecting,
      account: account
        ? {
            address: account,
            chainId: chainId!,
            network: network!,
          }
        : null,
      balances,
      chainId,
      network,
      error,
    }),
    [account, balances, chainId, connected, connecting, disconnecting, error, network]
  );

  return {
    state,
    connected,
    connecting,
    account,
    chainId,
    network,
    balances,
    error,
    availableWallets: adapters,
    selectedWallet,
    connect,
    disconnect,
    selectWallet,
    switchNetwork,
    refreshBalances,
    sign,
    sendTransaction,
  };
}

export default useWallet;
