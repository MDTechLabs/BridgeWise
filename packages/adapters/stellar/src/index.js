"use strict";
/**
 * @bridgewise/stellar-adapter
 * Stellar/Soroban bridge adapter with Freighter wallet integration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.version = exports.StellarBridgeExecutor = exports.BridgeContract = exports.FreighterProvider = void 0;
exports.createStellarAdapter = createStellarAdapter;
const FreighterProvider_1 = require("./wallet/FreighterProvider");
const BridgeContract_1 = require("./contracts/BridgeContract");
const BridgeExecutor_1 = require("./executor/BridgeExecutor");
// Wallet exports
var FreighterProvider_2 = require("./wallet/FreighterProvider");
Object.defineProperty(exports, "FreighterProvider", { enumerable: true, get: function () { return FreighterProvider_2.FreighterProvider; } });
// Contract exports
var BridgeContract_2 = require("./contracts/BridgeContract");
Object.defineProperty(exports, "BridgeContract", { enumerable: true, get: function () { return BridgeContract_2.BridgeContract; } });
// Executor exports
var BridgeExecutor_2 = require("./executor/BridgeExecutor");
Object.defineProperty(exports, "StellarBridgeExecutor", { enumerable: true, get: function () { return BridgeExecutor_2.StellarBridgeExecutor; } });
/**
 * Create a complete Stellar bridge adapter instance
 * @param rpcUrl Soroban RPC endpoint URL
 * @param horizonUrl Horizon API endpoint URL
 * @param contractId Bridge contract address
 * @param network Target network
 * @returns Configured bridge executor ready for use
 */
function createStellarAdapter(rpcUrl = 'https://soroban-rpc.mainnet.stellar.org', horizonUrl = 'https://horizon.stellar.org', contractId, network = 'mainnet', safetyGate) {
    const wallet = new FreighterProvider_1.FreighterProvider(rpcUrl, horizonUrl);
    const bridgeContract = new BridgeContract_1.BridgeContract({
        contractId,
        rpcUrl,
        networkPassphrase: network === 'mainnet' ? 'Public Global Stellar Network ; September 2015' : 'Test SDF Network ; September 2015',
    });
    return new BridgeExecutor_1.StellarBridgeExecutor(wallet, bridgeContract, safetyGate, horizonUrl);
}
// Version export
exports.version = '0.1.0';
//# sourceMappingURL=index.js.map
