/**
 * BridgeWise UI Components
 * Main entry point for the component library
 */

// Theme System
export {
  ThemeProvider,
  useTheme,
  ThemeScript,
  defaultTheme,
  darkTheme,
  primitiveColors,
  mergeTheme,
  generateCSSVariables,
} from './theme';

export type {
  Theme,
  ThemeMode,
  ThemeColors,
  ThemeSpacing,
  ThemeTypography,
  ThemeShadows,
  ThemeRadii,
  ThemeTransitions,
  ThemeContextValue,
  DeepPartial,
  ThemeConfig,
  CSSVariables,
} from './theme';

// Components
export {
  TransactionHeartbeat,
  BridgeStatus as BridgeStatusLegacy,
  TransactionProvider,
  useTransaction,
} from './components/TransactionHeartbeat';
export { BridgeHistory } from './components/BridgeHistory';
export { BridgeCompare } from './components/BridgeCompare';
export {
  BridgeStatus,
  BridgeStatusHeadless,
} from './components/BridgeStatus';

export type { TransactionState } from './components/TransactionHeartbeat';
export type { BridgeHistoryProps } from './components/BridgeHistory';
export type {
  BridgeStatusProps,
  BridgeStatusState,
  BridgeStatusHeadlessProps,
  BridgeStatusRenderProps,
  BridgeTransactionStatus as BridgeStatusTransactionStatus,
  TransactionStatusDetails,
  TransactionError,
} from './components/BridgeStatus';

// Hooks
export { useFeeSlippageBenchmark } from './hooks/useFeeSlippageBenchmark';
export { useTransactionHistory } from './hooks/useTransactionHistory';
export { useBridgeLiquidity } from './hooks/useBridgeLiquidity';
export { useBridgeExecution } from './hooks/useBridgeExecution';
export type { FeeSlippageBenchmarkHookProps, FeeSlippageBenchmarkHookReturn } from './hooks/useFeeSlippageBenchmark';
export type {
  UseBridgeExecutionOptions,
  UseBridgeExecutionReturn,
} from './hooks/useBridgeExecution';

// Transaction history
export { createHttpTransactionHistoryBackend } from './transaction-history/storage';
export type {
  BridgeTransaction,
  BridgeTransactionStatus,
  TransactionHistoryBackend,
  TransactionHistoryConfig,
  TransactionHistoryFilter,
  UseTransactionHistoryOptions,
} from './transaction-history/types';

// Liquidity
export { BridgeLiquidityMonitor, prioritizeRoutesByLiquidity } from './liquidity/monitor';
export type {
  BridgeLiquidity,
  BridgeLiquidityProvider,
  BridgeLiquidityQuery,
  LiquidityProviderError,
  BridgeLiquidityMonitorConfig,
} from './liquidity/types';
export type { UseBridgeLiquidityOptions, UseBridgeLiquidityResult } from './hooks/useBridgeLiquidity';

// Wallet Integration
export {
  MetaMaskAdapter,
  WalletConnectAdapter,
  StellarAdapter,
  useWallet,
  WalletProvider,
  useWalletContext,
} from './wallet';

export type {
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
  WalletProviderProps,
  WalletContextValue,
} from './wallet';
