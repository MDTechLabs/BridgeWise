/**
 * Stellar Route Discovery Cache Module
 *
 * Provides caching for discovered Stellar bridge routes to reduce
 * repeated route discovery latency.
 *
 * @module
 */

export {
  StellarRouteDiscoveryCache,
  routeDiscoveryCache,
  buildRouteDiscoveryKey,
  buildRouteKey,
} from './stellar-route-discovery-cache';

export type {
  RouteDiscoveryCacheEntry,
  RouteDiscoveryCacheConfig,
  RouteDiscoveryCacheStats,
  RouteDiscoveryQuery,
} from './stellar-route-discovery-cache';

// Also export the original routeCache for backward compatibility
export { RouteCacheStore, routeCache } from './routeCache';

export type {
  RouteQuery,
  RouteResponse,
  CacheEntry,
  RouteCacheOptions,
} from './routeCache';
