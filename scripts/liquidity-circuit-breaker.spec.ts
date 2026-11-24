import { evaluateCircuitBreaker } from './liquidity-circuit-breaker';

describe('liquidity circuit breaker', () => {
  it('opens on min reserve breach', () => {
    expect(evaluateCircuitBreaker({ available: 90n, minReserve: 100n, depletionWindow: 0n, maxDepletion: 50n }).open).toBe(true);
  });
  it('stays closed within thresholds', () => {
    expect(evaluateCircuitBreaker({ available: 200n, minReserve: 100n, depletionWindow: 10n, maxDepletion: 50n }).open).toBe(false);
  });
});
