/**
 * @bridgewise/wallet - Core Type Definitions
 * Framework-agnostic wallet integration types for EVM and Stellar networks
 */

// ─── Network & Chain Types ────────────────────────────────────────────────────

/**
 * Supported blockchain network types
 */
export type NetworkType = 'evm' | 'stellar';

/**
 * Chain identifier (CAIP-2 format: namespace:reference)
 * EVM: eip155:<chainId> (e.g., eip155:1 for Ethereum)
 * Stellar: stellar:<network> (e.g., stellar:public)
 */
export type ChainId = string;

/**
 * Supported wallet types
 */
export type WalletType = 'metamask' | 'walletconnect' | 'freighter' | 'rabet' | 'albedo' | 'xbull' | 'custom';

// ─── Account & Balance Types ──────────────────────────────────────────────────

/**
 * Wallet account information
 */
export interface WalletAccount {
  /** Account address (EVM: 0x... hex, Stellar: G... public key) */
  address: string;
  /** Public key (mainly for Stellar accounts) */
  publicKey?: string;
  /** Current chain ID */
  chainId: ChainId;
  /** Network type */
  network: NetworkType;
}

/**
 * Token balance information
 */
export interface TokenBalance {
  /** Token contract address or identifier */
  token: string;
  /** Human-readable token symbol */
  symbol: string;
  /** Token decimals */
  decimals: number;
  /** Raw balance (in smallest unit) */
  balance: string;
  /** Formatted balance string */
  balanceFormatted: string;
  /** USD value if available */
  usdValue?: number;
}

// ─── Error Types ──────────────────────────────────────────────────────────────

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
  | 'TX_FAILED'
  | 'TX_REJECTED'
  | 'SIGN_FAILED'
  | 'UNKNOWN_ERROR';

/**
 * Wallet error structure
 */
export interface WalletError {
  code: WalletErrorCode;
  message: string;
  originalError?: unknown;
}

// ─── Event Types ──────────────────────────────────────────────────────────────

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

// ─── Transaction Types ────────────────────────────────────────────────────────

/**
 * Generic wallet transaction structure
 */
export interface WalletTransaction {
  /** Recipient address */
  to: string;
  /** Sender address */
  from?: string;
  /** Value to send (in smallest unit) */
  value?: string;
  /** Encoded transaction data */
  data?: string;
  /** Gas limit */
  gasLimit?: string;
  /** Gas price (legacy) */
  gasPrice?: string;
  /** EIP-1559 max fee per gas */
  maxFeePerGas?: string;
  /** EIP-1559 max priority fee per gas */
  maxPriorityFeePerGas?: string;
  /** Transaction nonce */
  nonce?: number;
  /** Chain ID for the transaction */
  chainId?: ChainId;
}

/**
 * Transaction receipt
 */
export interface TransactionReceipt {
  /** Transaction hash */
  hash: string;
  /** Block number (EVM) or ledger sequence (Stellar) */
  blockNumber?: number;
  /** Whether the transaction was successful */
  status: 'success' | 'failed' | 'pending';
  /** Gas used (EVM) */
  gasUsed?: string;
  /** Effective gas price (EVM) */
  effectiveGasPrice?: string;
}

// ─── Provider Interfaces ──────────────────────────────────────────────────────

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
 * Window interface with EVM provider
 */
export interface WindowWithEthereum {
  ethereum?: EVMProvider;
}

/**
 * Window interface with Stellar providers
 */
export interface WindowWithStellar {
  freighter?: StellarProvider;
  rabet?: StellarProvider;
  albedo?: StellarProvider;
  xBull?: StellarProvider;
}

// ─── Adapter Interface ────────────────────────────────────────────────────────

/**
 * Wallet adapter interface
 * Unified interface for all wallet types (EVM + Stellar)
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
  /** Wallet icon URL */
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
   * Get the current connected account
   */
  getAccount(): Promise<WalletAccount | null>;

  /**
   * Get balance for a specific token
   * @param token Token address or symbol
   */
  getBalance(token: string): Promise<TokenBalance>;

  /**
   * Get all token balances for the connected account
   */
  getAllBalances(): Promise<TokenBalance[]>;

  /**
   * Switch to a different network/chain
   * @param chainId Target chain ID
   */
  switchNetwork(chainId: ChainId): Promise<void>;

  /**
   * Sign a message or data
   * @param data Data to sign
   */
  sign(data: string | object): Promise<string>;

  /**
   * Send a transaction
   * @param transaction Transaction to send
   */
  sendTransaction(transaction: WalletTransaction): Promise<string>;

  /**
   * Subscribe to wallet events
   */
  on(event: WalletEvent, callback: WalletEventCallback): void;

  /**
   * Unsubscribe from wallet events
   */
  off(event: WalletEvent, callback: WalletEventCallback): void;
}

/**
 * Wallet adapter configuration
 */
export interface WalletAdapterConfig {
  /** Wallet type */
  type: WalletType;
  /** Custom adapter instance */
  adapter?: WalletAdapter;
  /** WalletConnect project ID (for WalletConnect) */
  projectId?: string;
  /** Supported chains */
  chains?: ChainId[];
  /** Auto-connect on initialization */
  autoConnect?: boolean;
  /** RPC URLs for chain IDs */
  rpcUrls?: Record<ChainId, string>;
}

// ─── Wallet Manager Types ─────────────────────────────────────────────────────

/**
 * Wallet connection state
 */
export interface WalletState {
  /** Whether the wallet is connected */
  connected: boolean;
  /** Whether a connection is in progress */
  connecting: boolean;
  /** Whether a disconnection is in progress */
  disconnecting: boolean;
  /** Current account info */
  account: WalletAccount | null;
  /** Token balances */
  balances: TokenBalance[];
  /** Current chain ID */
  chainId: ChainId | null;
  /** Current network type */
  network: NetworkType | null;
  /** Current error */
  error: WalletError | null;
}

/**
 * Multi-wallet connection structure
 */
export interface WalletConnection {
  walletType: WalletType | string;
  wallet: WalletAdapter;
  accounts: WalletAccount[];
  connected: boolean;
  activeAccountIndex: number;
}

/**
 * Multi-wallet state
 */
export interface MultiWalletState {
  wallets: WalletConnection[];
  activeWalletIndex: number | null;
  activeAccount: WalletAccount | null;
  error: WalletError | null;
  isRestoring: boolean;
}

// ─── Network Switcher Types ───────────────────────────────────────────────────

/**
 * Network switcher return type
 */
export interface NetworkSwitcherResult {
  currentNetwork: ChainId | null;
  switchNetwork: (targetChain: ChainId) => Promise<void>;
  isSwitching: boolean;
  error: WalletError | null;
  supportedNetworks: ChainId[];
}

// ─── Common Chain Constants ───────────────────────────────────────────────────

/**
 * Common EVM chain IDs (CAIP-2 format)
 */
export const EVM_CHAINS = {
  ETHEREUM: 'eip155:1',
  GOERLI: 'eip155:5',
  SEPOLIA: 'eip155:11155111',
  POLYGON: 'eip155:137',
  MUMBAI: 'eip155:80001',
  BSC: 'eip155:56',
  ARBITRUM: 'eip155:42161',
  OPTIMISM: 'eip155:10',
  BASE: 'eip155:8453',
  AVALANCHE: 'eip155:43114',
  GNOSIS: 'eip155:100',
} as const;

/**
 * Stellar chain IDs
 */
export const STELLAR_CHAINS = {
  PUBLIC: 'stellar:public',
  TESTNET: 'stellar:testnet',
  FUTURENET: 'stellar:futurenet',
} as const;

/**
 * EVM chain ID to numeric chain ID mapping
 */
export const EVM_NUMERIC_CHAIN_IDS: Record<string, number> = {
  [EVM_CHAINS.ETHEREUM]: 1,
  [EVM_CHAINS.GOERLI]: 5,
  [EVM_CHAINS.SEPOLIA]: 11155111,
  [EVM_CHAINS.POLYGON]: 137,
  [EVM_CHAINS.MUMBAI]: 80001,
  [EVM_CHAINS.BSC]: 56,
  [EVM_CHAINS.ARBITRUM]: 42161,
  [EVM_CHAINS.OPTIMISM]: 10,
  [EVM_CHAINS.BASE]: 8453,
  [EVM_CHAINS.AVALANCHE]: 43114,
  [EVM_CHAINS.GNOSIS]: 100,
};

/**
 * Numeric chain ID to CAIP-2 chain ID mapping
 */
export const NUMERIC_TO_EVM_CHAIN: Record<number, string> = Object.fromEntries(
  Object.entries(EVM_NUMERIC_CHAIN_IDS).map(([caip2, numeric]) => [numeric, caip2])
);

/**
 * Stellar network passphrases
 */
export const STELLAR_NETWORK_PASSPHRASES: Record<string, string> = {
  [STELLAR_CHAINS.PUBLIC]: 'Public Global Stellar Network ; September 2015',
  [STELLAR_CHAINS.TESTNET]: 'Test SDF Network ; September 2015',
  [STELLAR_CHAINS.FUTURENET]: 'Test SDF Future Network ; October 2022',
};

/**
 * Stellar Horizon URLs
 */
export const STELLAR_HORIZON_URLS: Record<string, string> = {
  [STELLAR_CHAINS.PUBLIC]: 'https://horizon.stellar.org',
  [STELLAR_CHAINS.TESTNET]: 'https://horizon-testnet.stellar.org',
  [STELLAR_CHAINS.FUTURENET]: 'https://horizon-futurenet.stellar.org',
};

/**
 * Helper to convert numeric EVM chain ID to CAIP-2 format
 */
export function numericToEvmChainId(numericId: number): string {
  return `eip155:${numericId}`;
}

/**
 * Helper to extract numeric chain ID from CAIP-2 format
 */
export function evmChainIdToNumeric(chainId: string): number | null {
  const match = chainId.match(/^eip155:(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Helper to determine network type from chain ID
 */
export function getNetworkType(chainId: string): NetworkType {
  if (chainId.startsWith('eip155:')) return 'evm';
  if (chainId.startsWith('stellar:')) return 'stellar';
  throw new Error(`Unknown chain ID format: ${chainId}`);
}
