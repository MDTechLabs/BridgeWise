import { StellarBridgeRouteLockService } from '../../../src/routing/locks/stellar';
import type { LockedBridgeRoute } from '../../../src/routing/locks/stellar';

const routeA: LockedBridgeRoute = {
  routeId: 'route-a',
  providerId: 'stellar-bridge',
  sourceAsset: 'USDC',
  destinationAsset: 'EURC',
  quotedInput: '100',
  quotedOutput: '98.5',
};

const routeB: LockedBridgeRoute = {
  ...routeA,
  routeId: 'route-b',
  quotedOutput: '97.0',
};

describe('StellarBridgeRouteLockService (#997)', () => {
  it('associates a lock with an execution ID', () => {
    const service = new StellarBridgeRouteLockService({ now: () => 1_000 });
    const result = service.acquire('exec-1', routeA, 5_000);
    expect(result.acquired).toBe(true);
    expect(result.lock?.executionId).toBe('exec-1');
    expect(service.getLock('exec-1')?.route.routeId).toBe('route-a');
  });

  it('uses a configurable lock duration', () => {
    let now = 0;
    const service = new StellarBridgeRouteLockService({
      durationMs: 100,
      now: () => now,
    });
    service.acquire('exec-1', routeA);
    expect(service.status('exec-1')).toBe('active');
    now = 99;
    expect(service.status('exec-1')).toBe('active');
    now = 100;
    expect(service.status('exec-1')).toBe('absent');
    expect(service.getLock('exec-1')).toBeUndefined();
  });

  it('prevents a conflicting route update while locked', () => {
    const service = new StellarBridgeRouteLockService({ now: () => 1 });
    service.acquire('exec-1', routeA);
    const guard = service.guardRouteUpdate('exec-1', routeB);
    expect(guard.allowed).toBe(false);
    expect(guard.reason).toMatch(/cannot be replaced/i);
    expect(service.acquire('exec-1', routeB).acquired).toBe(false);
  });

  it('allows the same locked route to be re-acquired', () => {
    const service = new StellarBridgeRouteLockService({ now: () => 1 });
    expect(service.acquire('exec-1', routeA).acquired).toBe(true);
    expect(service.acquire('exec-1', routeA).acquired).toBe(true);
    expect(service.guardRouteUpdate('exec-1', routeA).allowed).toBe(true);
  });

  it('releases the lock after execution', () => {
    const service = new StellarBridgeRouteLockService({ now: () => 1 });
    service.acquire('exec-1', routeA);
    expect(service.releaseAfterExecution('exec-1')).toBe(true);
    expect(service.status('exec-1')).toBe('absent');
    expect(service.guardRouteUpdate('exec-1', routeB).allowed).toBe(true);
  });

  it('sweeps expired locks', () => {
    let now = 0;
    const service = new StellarBridgeRouteLockService({
      durationMs: 10,
      now: () => now,
    });
    service.acquire('exec-1', routeA);
    now = 11;
    expect(service.sweepExpired()).toBe(1);
  });
});
