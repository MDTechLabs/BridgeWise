/**
 * Types for Stellar bridge route locking during transaction preparation.
 */

export interface LockedBridgeRoute {
  routeId: string;
  providerId: string;
  sourceAsset: string;
  destinationAsset: string;
  quotedInput: string;
  quotedOutput: string;
}

export interface RouteLockConfig {
  /** How long a lock remains valid. Default: 120_000 ms. */
  durationMs?: number;
  /** Clock injection for tests. */
  now?: () => number;
}

export type RouteLockStatus = 'active' | 'expired' | 'released' | 'absent';

export interface RouteLockRecord {
  lockId: string;
  executionId: string;
  route: LockedBridgeRoute;
  fingerprint: string;
  acquiredAt: number;
  expiresAt: number;
  releasedAt?: number;
  status: Exclude<RouteLockStatus, 'absent'>;
}

export interface RouteLockResult {
  acquired: boolean;
  lock?: RouteLockRecord;
  reason?: string;
}

export interface RouteUpdateGuardResult {
  allowed: boolean;
  reason?: string;
  lock?: RouteLockRecord;
}

export const DEFAULT_ROUTE_LOCK_DURATION_MS = 120_000;
