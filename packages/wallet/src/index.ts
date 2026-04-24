/**
 * @bridgewise/wallet
 * Wallet Integration Module for BridgeWise
 * Connects EVM and Stellar wallets through a unified adapter interface
 *
 * @example
 * ```ts
 * import { WalletManager, MetaMaskAdapter, FreighterAdapter } from '@bridgewise/wallet';
 *
 * const manager = new WalletManager({
 *   adapters: [new MetaMaskAdapter(), new FreighterAdapter()],
 * });
 *
 * // Discover available wallets
 * const available = manager.getAvailableWallets();
 *
 * // Connect to MetaMask
 * const account = await manager.connect('metamask');
 * console.log('Connected:', account.address);
 *
 * // Connect to Freighter (Stellar)
 * const stellarAccount = await manager.connect('freighter');
 * console.log('Stellar:', stellarAccount.address);
 *
 * // Get balances
 * const balances = await manager.getBalances();
 * ```
 */

// Core types
export type {
  NetworkType,
  ChainId,
  WalletType,
  WalletAccount,
  TokenBalance,
  WalletError,
  WalletErrorCode,
  WalletEvent,
  WalletEventCallback,
  WalletTransaction,
  TransactionReceipt,
  EVMProvider,
  StellarProvider,
  WindowWithEthereum,
  WindowWithStellar,
  WalletAdapter,
  WalletAdapterConfig,
  WalletState,
  WalletConnection,
  MultiWalletState,
  NetworkSwitcherResult,
} from './types';

// Constants
export {
  EVM_CHAINS,
  STELLAR_CHAINS,
  EVM_NUMERIC_CHAIN_IDS,
  NUMERIC_TO_EVM_CHAIN,
  STELLAR_NETWORK_PASSPHRASES,
  STELLAR_HORIZON_URLS,
  numericToEvmChainId,
  evmChainIdToNumeric,
  getNetworkType,
} from './types';

// EVM Adapters
export { EVMBaseAdapter } from './adapters/evm';
export type { EVMAdapterOptions } from './adapters/evm';
export { MetaMaskAdapter } from './adapters/evm';
export type { MetaMaskAdapterOptions } from './adapters/evm';
export { WalletConnectAdapter } from './adapters/evm';
export type { WalletConnectAdapterOptions } from './adapters/evm';

// Stellar Adapters
export { StellarBaseAdapter } from './adapters/stellar';
export type { StellarAdapterOptions } from './adapters/stellar';
export { FreighterAdapter } from './adapters/stellar';
export type { FreighterAdapterOptions } from './adapters/stellar';

// Wallet Manager
export { WalletManager } from './WalletManager';
export type { WalletManagerOptions } from './WalletManager';

// Version
export const WALLET_MODULE_VERSION = '0.1.0';
