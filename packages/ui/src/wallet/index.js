"use strict";
/**
 * Wallet Integration Layer
 * Main entry point for wallet adapters and hooks
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletConnector = exports.useMultiWalletContext = exports.MultiWalletProvider = exports.useActiveAccount = exports.useWalletConnections = exports.useWalletContext = exports.WalletProvider = exports.useWallet = exports.StellarAdapter = exports.WalletConnectAdapter = exports.MetaMaskAdapter = void 0;
// Adapters
var MetaMaskAdapter_1 = require("./adapters/MetaMaskAdapter");
Object.defineProperty(exports, "MetaMaskAdapter", { enumerable: true, get: function () { return MetaMaskAdapter_1.MetaMaskAdapter; } });
var WalletConnectAdapter_1 = require("./adapters/WalletConnectAdapter");
Object.defineProperty(exports, "WalletConnectAdapter", { enumerable: true, get: function () { return WalletConnectAdapter_1.WalletConnectAdapter; } });
var StellarAdapter_1 = require("./adapters/StellarAdapter");
Object.defineProperty(exports, "StellarAdapter", { enumerable: true, get: function () { return StellarAdapter_1.StellarAdapter; } });
// Hooks and Provider
var useWallet_1 = require("./useWallet");
Object.defineProperty(exports, "useWallet", { enumerable: true, get: function () { return useWallet_1.useWallet; } });
var WalletProvider_1 = require("./WalletProvider");
Object.defineProperty(exports, "WalletProvider", { enumerable: true, get: function () { return WalletProvider_1.WalletProvider; } });
Object.defineProperty(exports, "useWalletContext", { enumerable: true, get: function () { return WalletProvider_1.useWalletContext; } });
var useWalletConnections_1 = require("./useWalletConnections");
Object.defineProperty(exports, "useWalletConnections", { enumerable: true, get: function () { return useWalletConnections_1.useWalletConnections; } });
Object.defineProperty(exports, "useActiveAccount", { enumerable: true, get: function () { return useWalletConnections_1.useActiveAccount; } });
var MultiWalletProvider_1 = require("./MultiWalletProvider");
Object.defineProperty(exports, "MultiWalletProvider", { enumerable: true, get: function () { return MultiWalletProvider_1.MultiWalletProvider; } });
Object.defineProperty(exports, "useMultiWalletContext", { enumerable: true, get: function () { return MultiWalletProvider_1.useMultiWalletContext; } });
var WalletConnector_1 = require("./WalletConnector");
Object.defineProperty(exports, "WalletConnector", { enumerable: true, get: function () { return WalletConnector_1.WalletConnector; } });
//# sourceMappingURL=index.js.map