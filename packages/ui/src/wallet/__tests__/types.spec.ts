/**
 * Wallet Adapter Type Tests
 * Type validation for wallet integration layer
 */

import type {
  WalletAdapter,
  WalletAccount,
  TokenBalance,
  WalletError,
  WalletErrorCode,
  WalletEvent,
  WalletState,
  ChainId,
  NetworkType,
  WalletType,
  WalletTransaction,
  UseWalletReturn,
  UseWalletOptions,
} from '../types';

// Type assertion helper
function assertType<T>(_value: T) {}

// Validate WalletErrorCode
const errorCodes: WalletErrorCode[] = [
  'WALLET_NOT_FOUND',
  'CONNECTION_REJECTED',
  'CONNECTION_FAILED',
  'DISCONNECT_FAILED',
  'NETWORK_SWITCH_REJECTED',
  'NETWORK_NOT_SUPPORTED',
  'BALANCE_FETCH_FAILED',
  'ACCOUNT_NOT_FOUND',
  'ALREADY_CONNECTED',
  'NOT_CONNECTED',
  'USER_REJECTED',
  'TIMEOUT',
  'UNKNOWN_ERROR',
];

assertType<WalletErrorCode[]>(errorCodes);

// Validate WalletError
const walletError: WalletError = {
  code: 'CONNECTION_FAILED',
  message: 'Failed to connect',
  originalError: new Error('Original'),
};

assertType<WalletError>(walletError);

// Validate WalletEvent
const events: WalletEvent[] = [
  'connect',
  'disconnect',
  'accountsChanged',
  'chainChanged',
  'networkChanged',
  'error',
];

assertType<WalletEvent[]>(events);

// Validate TokenBalance
const tokenBalance: TokenBalance = {
  token: 'native',
  symbol: 'ETH',
  decimals: 18,
  balance: '1000000000000000000',
  balanceFormatted: '1.0 ETH',
  usdValue: 2000,
};

assertType<TokenBalance>(tokenBalance);

// Validate WalletAccount
const walletAccount: WalletAccount = {
  address: '0x1234567890abcdef',
  publicKey: '0xpubkey',
  chainId: 'eip155:1',
  network: 'evm',
};

assertType<WalletAccount>(walletAccount);

// Validate WalletState
const walletState: WalletState = {
  connected: true,
  connecting: false,
  disconnecting: false,
  account: walletAccount,
  balances: [tokenBalance],
  chainId: 'eip155:1',
  network: 'evm',
  error: null,
};

assertType<WalletState>(walletState);

// Validate ChainId
const chainIds: ChainId[] = [
  'eip155:1',
  'eip155:137',
  'stellar:public',
  'stellar:testnet',
];

assertType<ChainId[]>(chainIds);

// Validate NetworkType
const networkTypes: NetworkType[] = ['evm', 'stellar'];
assertType<NetworkType[]>(networkTypes);

// Validate WalletType
const walletTypes: WalletType[] = ['metamask', 'walletconnect', 'stellar', 'custom'];
assertType<WalletType[]>(walletTypes);

// Validate WalletTransaction
const transaction: WalletTransaction = {
  to: '0xabcdef123456',
  from: '0x123456abcdef',
  value: '0x0',
  data: '0x',
  gasLimit: '0x5208',
  gasPrice: '0x1',
  nonce: 0,
  chainId: 'eip155:1',
};

assertType<WalletTransaction>(transaction);

// Validate UseWalletOptions
const walletOptions: UseWalletOptions = {
  autoConnect: false,
  onConnect: (account) => console.log(account),
  onDisconnect: () => console.log('Disconnected'),
  onAccountChange: (account) => console.log(account),
  onNetworkChange: (chainId, network) => console.log(chainId, network),
  onError: (error) => console.error(error),
};

assertType<UseWalletOptions>(walletOptions);

// Validate UseWalletReturn
const walletReturn: UseWalletReturn = {
  state: walletState,
  connected: true,
  connecting: false,
  account: '0x123',
  chainId: 'eip155:1',
  network: 'evm',
  balances: [tokenBalance],
  error: null,
  availableWallets: [],
  selectedWallet: null,
  connect: async () => {},
  disconnect: async () => {},
  selectWallet: () => {},
  switchNetwork: async () => {},
  refreshBalances: async () => {},
  sign: async () => '0xsignature',
  sendTransaction: async () => '0xtxhash',
};

assertType<UseWalletReturn>(walletReturn);

// Validate WalletAdapter interface structure
const mockAdapter: WalletAdapter = {
  id: 'mock',
  name: 'Mock Wallet',
  type: 'custom',
  networkType: 'evm',
  supportedChains: ['eip155:1'],
  isAvailable: true,
  icon: 'https://example.com/icon.png',

  connect: async () => walletAccount,
  disconnect: async () => {},
  getAccount: async () => walletAccount,
  getBalance: async () => tokenBalance,
  getAllBalances: async () => [tokenBalance],
  switchNetwork: async () => {},
  sign: async () => '0xsignature',
  sendTransaction: async () => '0xtxhash',
  on: () => {},
  off: () => {},
};

assertType<WalletAdapter>(mockAdapter);

// Export to make this a module
export {};
