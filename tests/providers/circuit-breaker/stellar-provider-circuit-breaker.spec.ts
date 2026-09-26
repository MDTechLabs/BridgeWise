import {
  CircuitBreaker,
  StellarProviderCircuitBreakerRegistry,
} from '../../../src/providers/circuit-breaker/stellar';

// ─── CircuitBreaker ───────────────────────────────────────────────────────────

describe('CircuitBreaker', () => {
  it('starts closed and allows requests', () => {
    const breaker = new CircuitBreaker({ now: () => 0 });
    expect(breaker.getState()).toBe('closed');
    expect(breaker.canRequest()).toBe(true);
  });

  it('opens after the failure threshold and blocks requests', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, now: () => 0 });
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('closed');
    expect(breaker.canRequest()).toBe(true);

    breaker.recordFailure(); // 3rd consecutive failure trips it
    expect(breaker.getState()).toBe('open');
    expect(breaker.canRequest()).toBe(false);
  });

  it('exposes configurable failure thresholds', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 5, now: () => 0 });
    for (let i = 0; i < 4; i++) breaker.recordFailure();
    expect(breaker.getState()).toBe('closed');
    breaker.recordFailure();
    expect(breaker.getState()).toBe('open');
  });

  it('moves to half-open after the cooldown and closes on success', () => {
    let clock = 1000;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 500,
      now: () => clock,
    });
    breaker.recordFailure();
    expect(breaker.getState()).toBe('open');

    clock += 500; // cooldown elapses
    expect(breaker.getState()).toBe('half_open');
    expect(breaker.canRequest()).toBe(true);

    breaker.recordSuccess();
    expect(breaker.getState()).toBe('closed');
    expect(breaker.canRequest()).toBe(true);
  });

  it('respects a half-open success threshold before closing', () => {
    let clock = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 100,
      halfOpenSuccessThreshold: 2,
      now: () => clock,
    });
    breaker.recordFailure();
    clock += 100;
    expect(breaker.getState()).toBe('half_open');

    breaker.recordSuccess();
    expect(breaker.getState()).toBe('half_open');

    breaker.recordSuccess();
    expect(breaker.getState()).toBe('closed');
  });

  it('re-opens immediately when a half-open trial fails', () => {
    let clock = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 100,
      now: () => clock,
    });
    breaker.recordFailure();
    clock += 100;
    expect(breaker.getState()).toBe('half_open');

    breaker.recordFailure();
    expect(breaker.getState()).toBe('open');
    expect(breaker.canRequest()).toBe(false);
  });

  it('records cooldown remaining in snapshots', () => {
    let clock = 1000;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      now: () => clock,
    });
    breaker.recordFailure();
    clock += 250;
    const snapshot = breaker.getSnapshot();
    expect(snapshot.state).toBe('open');
    expect(snapshot.cooldownRemainingMs).toBe(750);
  });

  it('resets a tripped breaker back to closed', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, now: () => 0 });
    breaker.recordFailure();
    expect(breaker.getState()).toBe('open');
    breaker.reset();
    expect(breaker.getState()).toBe('closed');
    expect(breaker.canRequest()).toBe(true);
  });

  it('fires state-change events', () => {
    const events: string[] = [];
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      now: () => 0,
      onStateChange: (e) => events.push(`${e.from}->${e.to}`),
    });
    breaker.recordFailure();
    expect(events).toContain('closed->open');
  });

  it('rejects invalid thresholds', () => {
    expect(() => new CircuitBreaker({ failureThreshold: 0 })).toThrow(
      RangeError,
    );
    expect(() => new CircuitBreaker({ resetTimeoutMs: -1 })).toThrow(
      RangeError,
    );
    expect(() => new CircuitBreaker({ halfOpenSuccessThreshold: 0 })).toThrow(
      RangeError,
    );
  });
});

// ─── StellarProviderCircuitBreakerRegistry ────────────────────────────────────

describe('StellarProviderCircuitBreakerRegistry', () => {
  it('suspends an unhealthy provider and filters availability', () => {
    const registry = new StellarProviderCircuitBreakerRegistry({
      failureThreshold: 2,
      now: () => 0,
    });
    registry.report('horizon-a', false);
    registry.report('horizon-a', false); // trips horizon-a
    registry.report('horizon-b', true);

    expect(registry.isAvailable('horizon-a')).toBe(false);
    expect(registry.isAvailable('horizon-b')).toBe(true);
    expect(registry.availableProviders(['horizon-a', 'horizon-b'])).toEqual([
      'horizon-b',
    ]);
    expect(registry.suspendedProviders()).toEqual(['horizon-a']);
  });

  it('selects the first available provider from an ordered list', () => {
    const registry = new StellarProviderCircuitBreakerRegistry({
      failureThreshold: 1,
      now: () => 0,
    });
    registry.reportFailure('horizon-a');
    expect(registry.selectProvider(['horizon-a', 'horizon-b'])).toBe(
      'horizon-b',
    );
    expect(registry.selectProvider(['horizon-a'])).toBeNull();
  });

  it('restores provider availability after recovery', () => {
    let clock = 0;
    const registry = new StellarProviderCircuitBreakerRegistry({
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      now: () => clock,
    });
    registry.reportFailure('horizon-a');
    expect(registry.isAvailable('horizon-a')).toBe(false);

    clock += 1000; // cooldown elapses -> half-open
    expect(registry.isAvailable('horizon-a')).toBe(true);

    registry.reportSuccess('horizon-a'); // recovery confirmed
    expect(registry.statusFor('horizon-a')?.snapshot.state).toBe('closed');
    expect(registry.availableProviders(['horizon-a'])).toEqual(['horizon-a']);
  });

  it('keeps per-provider state isolated', () => {
    const registry = new StellarProviderCircuitBreakerRegistry({
      failureThreshold: 1,
      now: () => 0,
    });
    registry.reportFailure('horizon-a');
    expect(registry.isAvailable('horizon-a')).toBe(false);
    expect(registry.isAvailable('horizon-b')).toBe(true);
  });

  it('resets providers manually', () => {
    const registry = new StellarProviderCircuitBreakerRegistry({
      failureThreshold: 1,
      now: () => 0,
    });
    registry.reportFailure('horizon-a');
    expect(registry.isAvailable('horizon-a')).toBe(false);
    registry.resetProvider('horizon-a');
    expect(registry.isAvailable('horizon-a')).toBe(true);
  });
});
