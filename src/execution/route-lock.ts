/**
 * Execution-layer access to Stellar bridge route locks.
 * Locks are keyed by execution ID so preparation and signing share one route.
 */
export {
  StellarBridgeRouteLockService,
  DEFAULT_ROUTE_LOCK_DURATION_MS,
} from '../routing/locks/stellar';
export type {
  LockedBridgeRoute,
  RouteLockConfig,
  RouteLockRecord,
  RouteLockResult,
  RouteUpdateGuardResult,
  RouteLockStatus,
} from '../routing/locks/stellar';
