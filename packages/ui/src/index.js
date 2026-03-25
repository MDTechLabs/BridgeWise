"use strict";
/**
 * BridgeWise UI Components
 * Main entry point for the component library
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.useWalletContext = exports.WalletProvider = exports.useWallet = exports.StellarAdapter = exports.WalletConnectAdapter = exports.MetaMaskAdapter = exports.prioritizeRoutesByLiquidity = exports.BridgeLiquidityMonitor = exports.createHttpTransactionHistoryBackend = exports.useBridgeExecution = exports.useBridgeLiquidity = exports.useTransactionHistory = exports.useFeeSlippageBenchmark = exports.BridgeStatusHeadless = exports.BridgeStatus = exports.BridgeCompare = exports.BridgeHistory = exports.useTransaction = exports.TransactionProvider = exports.BridgeStatusLegacy = exports.TransactionHeartbeat = exports.generateCSSVariables = exports.mergeTheme = exports.primitiveColors = exports.darkTheme = exports.defaultTheme = exports.ThemeScript = exports.BridgeWiseProvider = exports.useTheme = exports.ThemeProvider = void 0;
// Theme System
var theme_1 = require("./theme");
Object.defineProperty(exports, "ThemeProvider", { enumerable: true, get: function () { return theme_1.ThemeProvider; } });
Object.defineProperty(exports, "useTheme", { enumerable: true, get: function () { return theme_1.useTheme; } });
Object.defineProperty(exports, "BridgeWiseProvider", { enumerable: true, get: function () { return theme_1.BridgeWiseProvider; } });
Object.defineProperty(exports, "ThemeScript", { enumerable: true, get: function () { return theme_1.ThemeScript; } });
Object.defineProperty(exports, "defaultTheme", { enumerable: true, get: function () { return theme_1.defaultTheme; } });
Object.defineProperty(exports, "darkTheme", { enumerable: true, get: function () { return theme_1.darkTheme; } });
Object.defineProperty(exports, "primitiveColors", { enumerable: true, get: function () { return theme_1.primitiveColors; } });
Object.defineProperty(exports, "mergeTheme", { enumerable: true, get: function () { return theme_1.mergeTheme; } });
Object.defineProperty(exports, "generateCSSVariables", { enumerable: true, get: function () { return theme_1.generateCSSVariables; } });
// Components
var TransactionHeartbeat_1 = require("./components/TransactionHeartbeat");
Object.defineProperty(exports, "TransactionHeartbeat", { enumerable: true, get: function () { return TransactionHeartbeat_1.TransactionHeartbeat; } });
Object.defineProperty(exports, "BridgeStatusLegacy", { enumerable: true, get: function () { return TransactionHeartbeat_1.BridgeStatus; } });
Object.defineProperty(exports, "TransactionProvider", { enumerable: true, get: function () { return TransactionHeartbeat_1.TransactionProvider; } });
Object.defineProperty(exports, "useTransaction", { enumerable: true, get: function () { return TransactionHeartbeat_1.useTransaction; } });
var BridgeHistory_1 = require("./components/BridgeHistory");
Object.defineProperty(exports, "BridgeHistory", { enumerable: true, get: function () { return BridgeHistory_1.BridgeHistory; } });
var BridgeCompare_1 = require("./components/BridgeCompare");
Object.defineProperty(exports, "BridgeCompare", { enumerable: true, get: function () { return BridgeCompare_1.BridgeCompare; } });
var BridgeStatus_1 = require("./components/BridgeStatus");
Object.defineProperty(exports, "BridgeStatus", { enumerable: true, get: function () { return BridgeStatus_1.BridgeStatus; } });
Object.defineProperty(exports, "BridgeStatusHeadless", { enumerable: true, get: function () { return BridgeStatus_1.BridgeStatusHeadless; } });
// Hooks
var useFeeSlippageBenchmark_1 = require("./hooks/useFeeSlippageBenchmark");
Object.defineProperty(exports, "useFeeSlippageBenchmark", { enumerable: true, get: function () { return useFeeSlippageBenchmark_1.useFeeSlippageBenchmark; } });
var useTransactionHistory_1 = require("./hooks/useTransactionHistory");
Object.defineProperty(exports, "useTransactionHistory", { enumerable: true, get: function () { return useTransactionHistory_1.useTransactionHistory; } });
var useBridgeLiquidity_1 = require("./hooks/useBridgeLiquidity");
Object.defineProperty(exports, "useBridgeLiquidity", { enumerable: true, get: function () { return useBridgeLiquidity_1.useBridgeLiquidity; } });
var useBridgeExecution_1 = require("./hooks/useBridgeExecution");
Object.defineProperty(exports, "useBridgeExecution", { enumerable: true, get: function () { return useBridgeExecution_1.useBridgeExecution; } });
// Transaction history
var storage_1 = require("./transaction-history/storage");
Object.defineProperty(exports, "createHttpTransactionHistoryBackend", { enumerable: true, get: function () { return storage_1.createHttpTransactionHistoryBackend; } });
// Liquidity
var monitor_1 = require("./liquidity/monitor");
Object.defineProperty(exports, "BridgeLiquidityMonitor", { enumerable: true, get: function () { return monitor_1.BridgeLiquidityMonitor; } });
Object.defineProperty(exports, "prioritizeRoutesByLiquidity", { enumerable: true, get: function () { return monitor_1.prioritizeRoutesByLiquidity; } });
// Wallet Integration
var wallet_1 = require("./wallet");
Object.defineProperty(exports, "MetaMaskAdapter", { enumerable: true, get: function () { return wallet_1.MetaMaskAdapter; } });
Object.defineProperty(exports, "WalletConnectAdapter", { enumerable: true, get: function () { return wallet_1.WalletConnectAdapter; } });
Object.defineProperty(exports, "StellarAdapter", { enumerable: true, get: function () { return wallet_1.StellarAdapter; } });
Object.defineProperty(exports, "useWallet", { enumerable: true, get: function () { return wallet_1.useWallet; } });
Object.defineProperty(exports, "WalletProvider", { enumerable: true, get: function () { return wallet_1.WalletProvider; } });
Object.defineProperty(exports, "useWalletContext", { enumerable: true, get: function () { return wallet_1.useWalletContext; } });
//# sourceMappingURL=index.js.map