/**
 * @bridgewise/bridge-core
 *
 * Central aggregation logic for multi-chain bridge route discovery.
 * Provides a unified interface to query routes from multiple bridge providers
 * including Stellar/Soroban, LayerZero, and Hop Protocol.
 */
import { BridgeAggregator } from './aggregator';
import type { RouteRequest } from './types';
export * from './types';
export type { BridgeAdapter } from './adapters/base';
export { BaseBridgeAdapter } from './adapters/base';
export { HopAdapter } from './adapters/hop';
export { LayerZeroAdapter } from './adapters/layerzero';
export { StellarAdapter } from './adapters/stellar';
export * from './fee-estimation';
export * from './error-codes';
export { BridgeAggregator } from './aggregator';
export type { AggregatorConfig } from './aggregator';
export { BridgeValidator } from './validator';
export type { ValidationError, ValidationResult, BridgeExecutionRequest, } from './validator';
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
export declare function getBridgeRoutes(request: RouteRequest, config?: {
    providers?: {
        hop?: boolean;
        layerzero?: boolean;
        stellar?: boolean;
    };
    layerZeroApiKey?: string;
    timeout?: number;
}): Promise<import("./types").AggregatedRoutes>;
declare const _default: {
    BridgeAggregator: typeof BridgeAggregator;
    getBridgeRoutes: typeof getBridgeRoutes;
};
export default _default;
