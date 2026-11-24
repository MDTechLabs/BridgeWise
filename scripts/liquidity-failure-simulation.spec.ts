import { routeEnablementAllowed, simulateDomainFailure } from './liquidity-failure-simulation';

describe('correlated liquidity provider failure simulation', () => {
  const route = {
    id: 'route-1',
    requiredCapacity: 100,
    providers: [
      { id: 'lp-a', capacity: 60, domains: ['custody-x', 'eth'], healthy: true },
      { id: 'lp-b', capacity: 60, domains: ['custody-x', 'arb'], healthy: true },
      { id: 'lp-c', capacity: 80, domains: ['custody-y', 'eth'], healthy: true },
    ],
  };

  it('blocks route when correlated domain failure makes it unfillable', () => {
    const res = simulateDomainFailure(route, 'custody-x');
    expect(res.fillable).toBe(false);
    expect(routeEnablementAllowed([res])).toBe(false);
  });

  it('allows route when remaining capacity is sufficient', () => {
    const res = simulateDomainFailure(route, 'arb');
    expect(res.fillable).toBe(true);
  });
});
