import { StellarProviderCircuitBreakerRegistry } from '../../../src/providers/circuit-breaker/stellar';
import { StellarCircuitBreakerMiddleware } from '../../../src/providers/middleware';

// ─── Middleware ───────────────────────────────────────────────────────────────

describe('StellarCircuitBreakerMiddleware', () => {
  it('executes healthy providers and records success', async () => {
    const middleware = new StellarCircuitBreakerMiddleware({
      failureThreshold: 2,
      now: () => 0,
    });

    const calls: string[] = [];
    const result = await middleware.execute('horizon-a', async () => {
      calls.push('horizon-a');
      return 'quote';
    });

    expect(result).toEqual({
      providerId: 'horizon-a',
      bypassed: false,
      value: 'quote',
    });
    expect(calls).toEqual(['horizon-a']);
    expect(middleware.isAvailable('horizon-a')).toBe(true);
  });

  it('bypasses a provider once its circuit is open', async () => {
    const middleware = new StellarCircuitBreakerMiddleware({
      failureThreshold: 1,
      now: () => 0,
    });
    middleware.report('horizon-a', false); // trips horizon-a

    const calls: string[] = [];
    const result = await middleware.execute('horizon-a', async () => {
      calls.push('horizon-a');
      return 'should-not-happen';
    });

    expect(result).toEqual({
      providerId: 'horizon-a',
      bypassed: true,
      value: undefined,
    });
    expect(calls).toEqual([]);
    expect(middleware.suspendedProviders()).toEqual(['horizon-a']);
  });

  it('notifies on bypass via onBypass callback', async () => {
    const bypassed: string[] = [];
    const middleware = new StellarCircuitBreakerMiddleware({
      failureThreshold: 1,
      now: () => 0,
      onBypass: (providerId) => bypassed.push(providerId),
    });
    middleware.report('horizon-a', false);

    await middleware.execute('horizon-a', async () => 'nope');
    expect(bypassed).toEqual(['horizon-a']);
  });

  it('records failures and trips the circuit', async () => {
    const middleware = new StellarCircuitBreakerMiddleware({
      failureThreshold: 2,
      now: () => 0,
    });

    const failingCall = middleware.execute('horizon-a', async () => {
      throw new Error('provider down');
    });

    await expect(failingCall).rejects.toThrow('provider down');
    expect(middleware.isAvailable('horizon-a')).toBe(true); // 1 failure only

    await expect(
      middleware.execute('horizon-a', async () => {
        throw new Error('provider down');
      }),
    ).rejects.toThrow('provider down');
    expect(middleware.isAvailable('horizon-a')).toBe(false); // tripped
  });

  it('allows recovery after the cooldown and restores availability', async () => {
    let clock = 0;
    const middleware = new StellarCircuitBreakerMiddleware({
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      now: () => clock,
    });
    middleware.report('horizon-a', false);
    expect(middleware.isAvailable('horizon-a')).toBe(false);

    clock += 1000; // cooldown elapses -> half-open trial allowed
    const result = await middleware.execute('horizon-a', async () => 'quote');
    expect(result.bypassed).toBe(false);
    expect(result.value).toBe('quote');
    expect(middleware.statusFor('horizon-a')?.snapshot.state).toBe('closed');
    expect(middleware.filterAvailable(['horizon-a'])).toEqual(['horizon-a']);
  });

  it('filters unhealthy providers out of route discovery', () => {
    const middleware = new StellarCircuitBreakerMiddleware({
      failureThreshold: 1,
      now: () => 0,
    });
    middleware.report('horizon-a', false);

    expect(middleware.filterAvailable(['horizon-a', 'horizon-b'])).toEqual([
      'horizon-b',
    ]);
    expect(middleware.selectProvider(['horizon-a', 'horizon-b'])).toBe(
      'horizon-b',
    );
    expect(middleware.selectProvider(['horizon-a'])).toBeNull();
  });

  it('manually recovers a suspended provider', async () => {
    const middleware = new StellarCircuitBreakerMiddleware({
      failureThreshold: 1,
      now: () => 0,
    });
    middleware.report('horizon-a', false);
    expect(middleware.isAvailable('horizon-a')).toBe(false);

    middleware.recover('horizon-a');
    expect(middleware.isAvailable('horizon-a')).toBe(true);
    const result = await middleware.execute('horizon-a', async () => 'quote');
    expect(result.bypassed).toBe(false);
  });

  it('shares state when constructed with an existing registry', async () => {
    const registry = new StellarProviderCircuitBreakerRegistry({
      failureThreshold: 1,
      now: () => 0,
    });
    const middleware = new StellarCircuitBreakerMiddleware(registry);

    registry.reportFailure('horizon-a');
    expect(middleware.isAvailable('horizon-a')).toBe(false);

    const result = await middleware.execute('horizon-a', async () => 'nope');
    expect(result.bypassed).toBe(true);
  });
});
