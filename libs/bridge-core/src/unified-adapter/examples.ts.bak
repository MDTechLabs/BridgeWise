/**
 * BridgeAdapter Usage Examples - Documentation Only
 * 
 * This file contains reference documentation for implementing and using the
 * Unified Bridge Adapter Interface. All example code is commented out to 
 * avoid TypeScript compilation issues during the build process.
 * 
 * For detailed implementation examples, see:
 * - UNIFIED_ADAPTER_GUIDE.md
 * - API_REFERENCE.md
 * - QUICK_START.md
 * 
 * To use these examples, copy the code from the comment blocks below and adapt to your needs.
 */

// Example 1: Implementing a Bridge Adapter
// ============================================================================
// 
// import { BaseBridgeAdapter } from '@bridgewise/bridge-core';
// 
// export class MyBridgeAdapter extends BaseBridgeAdapter {
//   readonly provider = 'mybridge' as const;
//   
//   getName(): string {
//     return 'My Bridge Protocol';
//   }
//   
//   supportsChainPair(source: ChainId, target: ChainId): boolean {
//     return true; // Implement your chain pair support logic
//   }
//   
//   async fetchRoutes(request: RouteRequest): Promise<BridgeRoute[]> {
//     // Fetch from your bridge API
//     return [];
//   }
// }

// Example 2: Registering Adapters
// ============================================================================
//
// import { getAdapterFactory } from '@bridgewise/bridge-core';
//
// const factory = getAdapterFactory();
// factory.registerAdapter('mybridge', MyBridgeAdapter, config);
// await factory.initializeAll();

// Example 3: Query Routes
// ============================================================================
//
// const adapters = factory.getAdaptersForChainPair('ethereum', 'polygon');
// const routes = await Promise.all(
//   adapters.map(a => a.fetchRoutes(request))
// );

// Example 4: Token Registry
// ============================================================================
//
// const registry = new TokenRegistry();
// await registry.registerToken({ symbol: 'USDC', ... });
// const supported = await registry.isBridgeable(...);

// Example 5: Fee Analysis
// ============================================================================
//
// const cheapest = FeeNormalizer.normalizeRoutesByFees(routes)[0];
// const savings = FeeNormalizer.calculateFeeSavings(routes[0], routes[1]);

// Example 6: Adapter Factory
// ============================================================================
//
// const stats = factory.getStats();
// const providers = factory.getRegisteredProviders();

// See documentation files for complete implementations
export {};
