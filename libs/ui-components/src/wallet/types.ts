/**
 * Wallet Adapter Types
 * Type definitions for the Wallet Adapter Integration Layer
 */

import type { ReactNode } from 'react';

/**
 * Supported wallet types
 */
export type WalletType = 'metamask' | 'walletconnect' | 'stellar' | 'custom';

/**
 * Supported blockchain networks
 */
export type NetworkType = 'evm' | 'stellar';

/**
 * Chain identifier (CAIP-2 format or custom)
 */
export type ChainId = string;

/**
 * Token balance information
 */
export interface TokenBalance {
  token: string;
  symbol: string;
  decimals: number;
  balance: string;
  balanceFormatted: string;
  usdValue?: number;
}

/**
 * Wallet account information
 */
export interface WalletAccount {
  address: string;
  publicKey?: string;
  chainId: ChainId;
  network: NetworkType;
}

/**
 * Wallet connection state
 */
export interface WalletState {
  connected: boolean;
  connecting: boolean;
  disconnecting: boolean;
  account: WalletAccount | null;
  balances: TokenBalance[];
  chainId: ChainId | null;
  network: NetworkType | null;
  error: WalletError | null;
}

/**
 * Wallet error structure
 */
export interface WalletError {
  code: WalletErrorCode;
  message: string;
  originalError?: unknown;
}

/**
 * Wallet error codes
 */
export type WalletErrorCode =
  | 'WALLET_NOT_FOUND'
  | 'CONNECTION_REJECTED'
  | 'CONNECTION_FAILED'
  | 'DISCONNECT_FAILED'
  | 'NETWORK_SWITCH_REJECTED'
  | 'NETWORK_NOT_SUPPORTED'
  | 'BALANCE_FETCH_FAILED'
  | 'ACCOUNT_NOT_FOUND'
  | 'ALREADY_CONNECTED'
  | 'NOT_CONNECTED'
  | 'USER_REJECTED'
  | 'TIMEOUT'
  | 'UNKNOWN_ERROR';

/**
 * Wallet event types
 */
export type WalletEvent =
  | 'connect'
  | 'disconnect'
  | 'accountsChanged'
  | 'chainChanged'
  | 'networkChanged'
  | 'error';

/**
 * Event callback type
 */
export type WalletEventCallback = (data: unknown) => void;

/**
 * Wallet adapter interface
 * Unified interface for all wallet types
 */
export interface WalletAdapter {
  /** Unique wallet identifier */
  readonly id: string;
  /** Wallet display name */
  readonly name: string;
  /** Wallet type */
  readonly type: WalletType;
  /** Supported network type */
  readonly networkType: NetworkType;
  /** Whether the wallet is installed/available */
  readonly isAvailable: boolean;
  /** Wallet icon URL or data URI */
  readonly icon?: string;
  /** Supported chain IDs */
  readonly supportedChains: ChainId[];

  /**
   * Connect to the wallet
   * @param chainId Optional chain ID to connect to
   */
  connect(chainId?: ChainId): Promise<WalletAccount>;

  /**
   * Disconnect from the wallet
   */
  disconnect(): Promise<void>;

  /**
   * Get the current account
   */
  getAccount(): Promise<WalletAccount | null>;

  /**
   * Get balance for a specific token
   * @param token Token address or symbol
   */
  getBalance(token: string): Promise<TokenBalance>;

  /**
   * Get all balances for the connected account
   */
  getAllBalances(): Promise<TokenBalance[]>;

  /**
   * Switch to a different network
   * @param chainId Chain ID to switch to
   */
  switchNetwork(chainId: ChainId): Promise<void>;

  /**
   * Sign a transaction or message
   * @param data Data to sign
   */
  sign(data: string | object): Promise<string>;

  /**
   * Send a transaction
   * @param transaction Transaction object
   */
  sendTransaction(transaction: WalletTransaction): Promise<string>;

  /**
   * Subscribe to wallet events
   * @param event Event name
   * @param callback Event callback
   */
  on(event: WalletEvent, callback: WalletEventCallback): void;

  /**
   * Unsubscribe from wallet events
   * @param event Event name
   * @param callback Event callback
   */
  off(event: WalletEvent, callback: WalletEventCallback): void;
}

/**
 * Wallet transaction structure
 */
export interface WalletTransaction {
  to: string;
  from?: string;
  value?: string;
  data?: string;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: number;
  chainId?: ChainId;
}

/**
 * EVM provider interface (EIP-1193)
 */
export interface EVMProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, callback: (data: unknown) => void): void;
  removeListener(event: string, callback: (data: unknown) => void): void;
  isMetaMask?: boolean;
  isWalletConnect?: boolean;
}

/**
 * Stellar wallet provider interface
 */
export interface StellarProvider {
  publicKey(): Promise<string>;
  signTransaction(transaction: unknown): Promise<unknown>;
  signData(data: unknown): Promise<unknown>;
  getNetwork(): Promise<string>;
  isConnected(): boolean;
}

/**
 * Wallet adapter configuration
 */
export interface WalletAdapterConfig {
  /** Wallet type */
  type: WalletType;
  /** Custom adapter instance (optional) */
  adapter?: WalletAdapter;
  /** WalletConnect project ID (for WalletConnect) */
  projectId?: string;
  /** Supported chains */
  chains?: ChainId[];
  /** Auto-connect on mount */
  autoConnect?: boolean;
  /** RPC URLs for chain IDs */
  rpcUrls?: Record<ChainId, string>;
}

/**
 * useWallet hook return type
 */
export interface UseWalletReturn {
  /** Current wallet state */
  state: WalletState;
  /** Whether wallet is connected */
  connected: boolean;
  /** Whether wallet is connecting */
  connecting: boolean;
  /** Current account address */
  account: string | null;
  /** Current chain ID */
  chainId: ChainId | null;
  /** Current network type */
  network: NetworkType | null;
  /** Token balances */
  balances: TokenBalance[];
  /** Current error */
  error: WalletError | null;
  /** Available wallets */
  availableWallets: WalletAdapter[];
  /** Currently selected wallet */
  selectedWallet: WalletAdapter | null;

  /**
   * Connect to a wallet
   * @param walletType Wallet type or adapter instance
   * @param chainId Optional chain ID
   */
  connect: (walletType: WalletType | WalletAdapter, chainId?: ChainId) => Promise<void>;

  /**
   * Disconnect from the current wallet
   */
  disconnect: () => Promise<void>;

  /**
   * Select a wallet (without connecting)
   * @param wallet Wallet type or adapter instance
   */
  selectWallet: (wallet: WalletType | WalletAdapter) => void;

  /**
   * Switch network
   * @param chainId Chain ID to switch to
   */
  switchNetwork: (chainId: ChainId) => Promise<void>;

  /**
   * Refresh balances
   */
  refreshBalances: () => Promise<void>;

  /**
   * Sign data
   * @param data Data to sign
   */
  sign: (data: string | object) => Promise<string>;

  /**
   * Send transaction
   * @param transaction Transaction to send
   */
  sendTransaction: (transaction: WalletTransaction) => Promise<string>;
}

/**
 * useWallet hook options
 */
export interface UseWalletOptions {
  /** Wallet adapters to use */
  adapters?: WalletAdapter[];
  /** Auto-connect on mount */
  autoConnect?: boolean;
  /** Callback when wallet connects */
  onConnect?: (account: WalletAccount) => void;
  /** Callback when wallet disconnects */
  onDisconnect?: () => void;
  /** Callback when account changes */
  onAccountChange?: (account: WalletAccount | null) => void;
  /** Callback when network changes */
  onNetworkChange?: (chainId: ChainId, network: NetworkType) => void;
  /** Callback on error */
  onError?: (error: WalletError) => void;
}

/**
 * Wallet provider props
 */
export interface WalletProviderProps {
  /** Child components */
  children: ReactNode;
  /** Wallet adapters to provide */
  adapters?: WalletAdapter[];
  /** Auto-connect on mount */
  autoConnect?: boolean;
  /** Callbacks */
  onConnect?: (account: WalletAccount) => void;
  onDisconnect?: () => void;
  onError?: (error: WalletError) => void;
}

/**
 * Wallet context value
 */
export interface WalletContextValue extends UseWalletReturn {}

/**
 * MetaMask provider window interface
 */
export interface WindowWithEthereum extends Window {
  ethereum?: EVMProvider;
}

/**
 * Stellar window interface
 */
export interface WindowWithStellar extends Window {
  freighter?: StellarProvider;
  rabet?: StellarProvider;
  albedo?: StellarProvider;
  xBull?: StellarProvider;
}
