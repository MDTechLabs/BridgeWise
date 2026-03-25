/**
 * useWallet Hook
 * React hook for wallet integration with SSR-safe behavior
 */
'use client';
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useWallet = useWallet;
const react_1 = require("react");
// Import adapters
const MetaMaskAdapter_1 = require("./adapters/MetaMaskAdapter");
const StellarAdapter_1 = require("./adapters/StellarAdapter");
// Default adapters factory
const createDefaultAdapters = () => {
    const adapters = [];
    // MetaMask
    const metaMask = new MetaMaskAdapter_1.MetaMaskAdapter();
    if (metaMask.isAvailable) {
        adapters.push(metaMask);
    }
    // Stellar wallets
    const stellar = new StellarAdapter_1.StellarAdapter();
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
function useWallet(options = {}) {
    const { adapters: userAdapters, autoConnect = false, onConnect, onDisconnect, onAccountChange, onNetworkChange, onError, } = options;
    // SSR safety
    const [isClient, setIsClient] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        setIsClient(true);
    }, []);
    // Initialize adapters
    const adapters = (0, react_1.useMemo)(() => {
        if (!isClient)
            return [];
        return userAdapters || createDefaultAdapters();
    }, [userAdapters, isClient]);
    // State
    const [connected, setConnected] = (0, react_1.useState)(false);
    const [connecting, setConnecting] = (0, react_1.useState)(false);
    const [disconnecting, setDisconnecting] = (0, react_1.useState)(false);
    const [account, setAccount] = (0, react_1.useState)(null);
    const [chainId, setChainId] = (0, react_1.useState)(null);
    const [network, setNetwork] = (0, react_1.useState)(null);
    const [balances, setBalances] = (0, react_1.useState)([]);
    const [error, setError] = (0, react_1.useState)(null);
    const [selectedWallet, setSelectedWallet] = (0, react_1.useState)(null);
    // Refs for tracking
    const isMountedRef = (0, react_1.useRef)(true);
    const eventCleanupRef = (0, react_1.useRef)(null);
    // Cleanup on unmount
    (0, react_1.useEffect)(() => {
        return () => {
            isMountedRef.current = false;
            if (eventCleanupRef.current) {
                eventCleanupRef.current();
            }
        };
    }, []);
    // Setup event listeners for the selected wallet
    const setupWalletEvents = (0, react_1.useCallback)((wallet) => {
        // Clean up previous listeners
        if (eventCleanupRef.current) {
            eventCleanupRef.current();
            eventCleanupRef.current = null;
        }
        const handleConnect = (data) => {
            if (!isMountedRef.current)
                return;
            const accountData = data;
            setAccount(accountData.address);
            setChainId(accountData.chainId);
            setNetwork(accountData.network);
            setConnected(true);
            onConnect?.(accountData);
        };
        const handleDisconnect = () => {
            if (!isMountedRef.current)
                return;
            setAccount(null);
            setChainId(null);
            setNetwork(null);
            setBalances([]);
            setConnected(false);
            setSelectedWallet(null);
            onDisconnect?.();
        };
        const handleAccountsChanged = (data) => {
            if (!isMountedRef.current)
                return;
            const { account: newAccount } = data;
            setAccount(newAccount);
            if (newAccount) {
                wallet.getAccount().then((acc) => {
                    if (acc && isMountedRef.current) {
                        onAccountChange?.(acc);
                    }
                });
            }
            else {
                onAccountChange?.(null);
            }
        };
        const handleChainChanged = (data) => {
            if (!isMountedRef.current)
                return;
            const { chainId: newChainId } = data;
            setChainId(newChainId);
            wallet.getAccount().then((acc) => {
                if (acc && isMountedRef.current) {
                    setNetwork(acc.network);
                    onNetworkChange?.(newChainId, acc.network);
                }
            });
        };
        const handleError = (data) => {
            if (!isMountedRef.current)
                return;
            const walletError = data;
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
    const connect = (0, react_1.useCallback)(async (walletType, targetChainId) => {
        if (!isClient) {
            throw new Error('Cannot connect on server side');
        }
        setConnecting(true);
        setError(null);
        try {
            let wallet;
            // Handle adapter instance
            if (typeof walletType === 'object' && 'connect' in walletType) {
                wallet = walletType;
            }
            else {
                // Find adapter by type
                const foundAdapter = adapters.find((a) => a.type === walletType || a.id === walletType);
                if (!foundAdapter) {
                    throw {
                        code: 'WALLET_NOT_FOUND',
                        message: `Wallet adapter for ${walletType} not found or not available`,
                    };
                }
                wallet = foundAdapter;
            }
            // Check if already connected
            if (selectedWallet?.id === wallet.id && connected) {
                throw {
                    code: 'ALREADY_CONNECTED',
                    message: 'Already connected to this wallet',
                };
            }
            // Disconnect from current wallet if any
            if (selectedWallet && selectedWallet.id !== wallet.id) {
                await selectedWallet.disconnect();
            }
            // Connect
            const accountData = await wallet.connect(targetChainId);
            if (!isMountedRef.current)
                return;
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
            }
            catch (balanceError) {
                console.error('Failed to fetch initial balances:', balanceError);
            }
            onConnect?.(accountData);
        }
        catch (err) {
            if (!isMountedRef.current)
                return;
            const walletError = err;
            setError(walletError);
            onError?.(walletError);
            throw err;
        }
        finally {
            if (isMountedRef.current) {
                setConnecting(false);
            }
        }
    }, [adapters, connected, isClient, onConnect, onError, selectedWallet, setupWalletEvents]);
    // Disconnect from wallet
    const disconnect = (0, react_1.useCallback)(async () => {
        if (!selectedWallet)
            return;
        setDisconnecting(true);
        try {
            await selectedWallet.disconnect();
            if (!isMountedRef.current)
                return;
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
        }
        catch (err) {
            if (!isMountedRef.current)
                return;
            const walletError = err;
            setError(walletError);
            onError?.(walletError);
            throw err;
        }
        finally {
            if (isMountedRef.current) {
                setDisconnecting(false);
            }
        }
    }, [onDisconnect, onError, selectedWallet]);
    // Select a wallet without connecting
    const selectWallet = (0, react_1.useCallback)((wallet) => {
        if (typeof wallet === 'object' && 'connect' in wallet) {
            setSelectedWallet(wallet);
        }
        else {
            const foundAdapter = adapters.find((a) => a.type === wallet || a.id === wallet);
            if (foundAdapter) {
                setSelectedWallet(foundAdapter);
            }
        }
    }, [adapters]);
    // Switch network
    const switchNetwork = (0, react_1.useCallback)(async (targetChainId) => {
        if (!selectedWallet) {
            throw {
                code: 'NOT_CONNECTED',
                message: 'No wallet connected',
            };
        }
        try {
            await selectedWallet.switchNetwork(targetChainId);
            if (!isMountedRef.current)
                return;
            setChainId(targetChainId);
            // Refresh balances after network switch
            const newBalances = await selectedWallet.getAllBalances();
            if (isMountedRef.current) {
                setBalances(newBalances);
            }
        }
        catch (err) {
            if (!isMountedRef.current)
                return;
            const walletError = err;
            setError(walletError);
            onError?.(walletError);
            throw err;
        }
    }, [onError, selectedWallet]);
    // Refresh balances
    const refreshBalances = (0, react_1.useCallback)(async () => {
        if (!selectedWallet)
            return;
        try {
            const newBalances = await selectedWallet.getAllBalances();
            if (isMountedRef.current) {
                setBalances(newBalances);
            }
        }
        catch (err) {
            if (!isMountedRef.current)
                return;
            const walletError = err;
            setError(walletError);
            onError?.(walletError);
        }
    }, [onError, selectedWallet]);
    // Sign data
    const sign = (0, react_1.useCallback)(async (data) => {
        if (!selectedWallet) {
            throw {
                code: 'NOT_CONNECTED',
                message: 'No wallet connected',
            };
        }
        try {
            return await selectedWallet.sign(data);
        }
        catch (err) {
            const walletError = err;
            setError(walletError);
            onError?.(walletError);
            throw err;
        }
    }, [onError, selectedWallet]);
    // Send transaction
    const sendTransaction = (0, react_1.useCallback)(async (transaction) => {
        if (!selectedWallet) {
            throw {
                code: 'NOT_CONNECTED',
                message: 'No wallet connected',
            };
        }
        try {
            return await selectedWallet.sendTransaction(transaction);
        }
        catch (err) {
            const walletError = err;
            setError(walletError);
            onError?.(walletError);
            throw err;
        }
    }, [onError, selectedWallet]);
    // Auto-connect on mount
    (0, react_1.useEffect)(() => {
        if (!isClient || !autoConnect)
            return;
        // Try to restore connection from storage
        const tryAutoConnect = async () => {
            try {
                const storedWalletId = localStorage.getItem('bridgewise_wallet_id');
                const storedChainId = localStorage.getItem('bridgewise_chain_id');
                if (storedWalletId) {
                    const wallet = adapters.find((a) => a.id === storedWalletId);
                    if (wallet) {
                        await connect(wallet, storedChainId);
                    }
                }
            }
            catch {
                // Auto-connect failed, clear storage
                localStorage.removeItem('bridgewise_wallet_id');
                localStorage.removeItem('bridgewise_chain_id');
            }
        };
        void tryAutoConnect();
    }, [adapters, autoConnect, connect, isClient]);
    // Persist connection to storage
    (0, react_1.useEffect)(() => {
        if (!isClient)
            return;
        if (connected && selectedWallet) {
            localStorage.setItem('bridgewise_wallet_id', selectedWallet.id);
            if (chainId) {
                localStorage.setItem('bridgewise_chain_id', chainId);
            }
        }
        else if (!connected) {
            localStorage.removeItem('bridgewise_wallet_id');
            localStorage.removeItem('bridgewise_chain_id');
        }
    }, [chainId, connected, isClient, selectedWallet]);
    // Build state object
    const state = (0, react_1.useMemo)(() => ({
        connected,
        connecting,
        disconnecting,
        account: account
            ? {
                address: account,
                chainId: chainId,
                network: network,
            }
            : null,
        balances,
        chainId,
        network,
        error,
    }), [account, balances, chainId, connected, connecting, disconnecting, error, network]);
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
exports.default = useWallet;
//# sourceMappingURL=useWallet.js.map