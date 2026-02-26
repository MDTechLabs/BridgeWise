/**
 * BridgeWise UI Components
 * Main entry point for the component library
 */

// Theme System
export {
  ThemeProvider,
  useTheme,
  BridgeWiseProvider,
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
   BridgeWiseTheme,
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

// SSR Compatibility Utils
export { isServer, isClient } from './ssr-utils/env';
export { safeStorage } from './ssr-utils/safe-storage';
export { createBrowserGuard, ServerAccessError } from './ssr-utils/browser-guard';

// SSR Hooks  
export { useIsClient } from './ssr-hooks/useIsClient';
export { useIsomorphicLayoutEffect } from './ssr-hooks/useIsomorphicLayoutEffect';

// SSR Components
export { ClientOnly } from './components/SSR/ClientOnly';
export type { ClientOnlyProps } from './components/SSR/ClientOnly';
