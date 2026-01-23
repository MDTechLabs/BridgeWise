/**
 * @bridgewise/bridge-core
 * 
 * Central aggregation logic for multi-chain bridge route discovery.
 * Provides a unified interface to query routes from multiple bridge providers
 * including Stellar/Soroban, LayerZero, and Hop Protocol.
 */

// Types
export * from './types';

// Adapters
export { BridgeAdapter, BaseBridgeAdapter } from './adapters/base';
export { HopAdapter } from './adapters/hop';
export { LayerZeroAdapter } from './adapters/layerzero';
export { StellarAdapter } from './adapters/stellar';

// Aggregator
export { BridgeAggregator, AggregatorConfig } from './aggregator';

// Validator
export {
  BridgeValidator,
  ValidationError,
  ValidationResult,
  BridgeExecutionRequest,
} from './validator';

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
export async function getBridgeRoutes(
  request: {
    sourceChain: string;
    targetChain: string;
    assetAmount: string;
    tokenAddress?: string;
    slippageTolerance?: number;
    recipientAddress?: string;
  },
  config?: {
    providers?: {
      hop?: boolean;
      layerzero?: boolean;
      stellar?: boolean;
    };
    layerZeroApiKey?: string;
    timeout?: number;
  }
) {
  const aggregator = new BridgeAggregator(config);
  return aggregator.getRoutes(request);
}

// Default export
export default {
  BridgeAggregator,
  getBridgeRoutes,
};
