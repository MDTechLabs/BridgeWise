import {
  DEFAULT_ROUTE_LOCK_DURATION_MS,
  LockedBridgeRoute,
  RouteLockConfig,
  RouteLockRecord,
  RouteLockResult,
  RouteLockStatus,
  RouteUpdateGuardResult,
} from './types';

function fingerprintRoute(route: LockedBridgeRoute): string {
  return [
    route.routeId,
    route.providerId,
    route.sourceAsset,
    route.destinationAsset,
    route.quotedInput,
    route.quotedOutput,
  ].join('|');
}

function createLockId(executionId: string, now: number): string {
  return `lock-${executionId}-${now.toString(36)}`;
}

/**
 * Locks a selected Stellar bridge route to an execution ID so concurrent
 * quote refreshes cannot silently replace the route the user is about to sign.
 */
export class StellarBridgeRouteLockService {
  private readonly locks = new Map<string, RouteLockRecord>();
  private readonly durationMs: number;
  private readonly now: () => number;

  constructor(config: RouteLockConfig = {}) {
    this.durationMs = config.durationMs ?? DEFAULT_ROUTE_LOCK_DURATION_MS;
    this.now = config.now ?? (() => Date.now());
  }

  acquire(executionId: string, route: LockedBridgeRoute, durationMs?: number): RouteLockResult {
    this.assertExecutionId(executionId);
    this.assertRoute(route);

    this.purgeIfExpired(executionId);

    const existing = this.locks.get(executionId);
    if (existing && existing.status === 'active') {
      if (existing.fingerprint === fingerprintRoute(route)) {
        return { acquired: true, lock: existing };
      }
      return {
        acquired: false,
        lock: existing,
        reason: `Execution ${executionId} already holds a lock on a different route (${existing.route.routeId}).`,
      };
    }

    const acquiredAt = this.now();
    const ttl = durationMs ?? this.durationMs;
    const lock: RouteLockRecord = {
      lockId: createLockId(executionId, acquiredAt),
      executionId,
      route: { ...route },
      fingerprint: fingerprintRoute(route),
      acquiredAt,
      expiresAt: acquiredAt + ttl,
      status: 'active',
    };
    this.locks.set(executionId, lock);
    return { acquired: true, lock };
  }

  getLock(executionId: string): RouteLockRecord | undefined {
    this.purgeIfExpired(executionId);
    return this.locks.get(executionId);
  }

  status(executionId: string): RouteLockStatus {
    this.purgeIfExpired(executionId);
    const lock = this.locks.get(executionId);
    if (!lock) {
      return 'absent';
    }
    return lock.status;
  }

  /**
   * Rejects a conflicting route replacement while the lock is active.
   * Identical routes are allowed (idempotent refresh of the same quote).
   */
  guardRouteUpdate(executionId: string, candidate: LockedBridgeRoute): RouteUpdateGuardResult {
    this.assertExecutionId(executionId);
    this.assertRoute(candidate);
    this.purgeIfExpired(executionId);

    const lock = this.locks.get(executionId);
    if (!lock || lock.status !== 'active') {
      return { allowed: true };
    }

    if (lock.fingerprint === fingerprintRoute(candidate)) {
      return { allowed: true, lock };
    }

    return {
      allowed: false,
      lock,
      reason:
        'Locked route cannot be replaced while the lock is active. Release or wait for expiration first.',
    };
  }

  release(executionId: string): boolean {
    this.assertExecutionId(executionId);
    const lock = this.locks.get(executionId);
    if (!lock || lock.status === 'released') {
      return false;
    }
    lock.status = 'released';
    lock.releasedAt = this.now();
    this.locks.delete(executionId);
    return true;
  }

  /** Called when execution finishes (success or failure). */
  releaseAfterExecution(executionId: string): boolean {
    return this.release(executionId);
  }

  sweepExpired(): number {
    let removed = 0;
    for (const executionId of [...this.locks.keys()]) {
      if (this.purgeIfExpired(executionId)) {
        removed += 1;
      }
    }
    return removed;
  }

  private purgeIfExpired(executionId: string): boolean {
    const lock = this.locks.get(executionId);
    if (!lock || lock.status !== 'active') {
      return false;
    }
    if (this.now() >= lock.expiresAt) {
      lock.status = 'expired';
      this.locks.delete(executionId);
      return true;
    }
    return false;
  }

  private assertExecutionId(executionId: string): void {
    if (!executionId?.trim()) {
      throw new Error('executionId is required');
    }
  }

  private assertRoute(route: LockedBridgeRoute): void {
    if (!route?.routeId?.trim()) {
      throw new Error('route.routeId is required');
    }
    if (!route.providerId?.trim()) {
      throw new Error('route.providerId is required');
    }
  }
}
