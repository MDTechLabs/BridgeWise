"use strict";
/**
 * @bridgewise/bridge-core
 *
 * Central aggregation logic for multi-chain bridge route discovery.
 * Provides a unified interface to query routes from multiple bridge providers
 * including Stellar/Soroban, LayerZero, and Hop Protocol.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeValidator = exports.BridgeAggregator = exports.StellarAdapter = exports.LayerZeroAdapter = exports.HopAdapter = exports.BaseBridgeAdapter = void 0;
exports.getBridgeRoutes = getBridgeRoutes;
const aggregator_1 = require("./aggregator");
// Types
__exportStar(require("./types"), exports);
var base_1 = require("./adapters/base");
Object.defineProperty(exports, "BaseBridgeAdapter", { enumerable: true, get: function () { return base_1.BaseBridgeAdapter; } });
var hop_1 = require("./adapters/hop");
Object.defineProperty(exports, "HopAdapter", { enumerable: true, get: function () { return hop_1.HopAdapter; } });
var layerzero_1 = require("./adapters/layerzero");
Object.defineProperty(exports, "LayerZeroAdapter", { enumerable: true, get: function () { return layerzero_1.LayerZeroAdapter; } });
var stellar_1 = require("./adapters/stellar");
Object.defineProperty(exports, "StellarAdapter", { enumerable: true, get: function () { return stellar_1.StellarAdapter; } });
// Fee Estimation
__exportStar(require("./fee-estimation"), exports);
// Error Codes and Mapping
__exportStar(require("./error-codes"), exports);
// Aggregator
var aggregator_2 = require("./aggregator");
Object.defineProperty(exports, "BridgeAggregator", { enumerable: true, get: function () { return aggregator_2.BridgeAggregator; } });
// Validator
var validator_1 = require("./validator");
Object.defineProperty(exports, "BridgeValidator", { enumerable: true, get: function () { return validator_1.BridgeValidator; } });
/**
 * Main function to get aggregated bridge routes
 *
 * @example
 * ```typescript
 * import { getBridgeRoutes } from '@bridgewise/bridge-core';
 *
 * const routes = await getBridgeRoutes({
 *   sourceChain: 'ethereum',
 *   targetChain: 'polygon',
 *   assetAmount: '1000000000000000000', // 1 ETH in wei
 *   slippageTolerance: 0.5
 * });
 *
 * console.log(`Found ${routes.routes.length} routes`);
 * routes.routes.forEach(route => {
 *   console.log(`${route.provider}: ${route.feePercentage}% fee, ${route.estimatedTime}s`);
 * });
 * ```
 */
async function getBridgeRoutes(request, config) {
    const aggregator = new aggregator_1.BridgeAggregator(config);
    return aggregator.getRoutes(request);
}
// Default export
exports.default = {
    BridgeAggregator: aggregator_1.BridgeAggregator,
    getBridgeRoutes,
};
