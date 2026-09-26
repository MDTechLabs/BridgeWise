import { ProviderOutageSimulator, buildFailoverScenarios } from './provider-outage-simulator';

function stableSort(arr: string[]): string[] {
  return [...arr].sort();
}

describe('#461 Stellar Provider Failover Simulator', () => {
  const scenarios = buildFailoverScenarios();

  it('simulates provider outages and validates failover selection', async () => {
    for (const scenario of scenarios) {
      const sim = new ProviderOutageSimulator(scenario.providers, { priority: scenario.priority });
      const result = await sim.run(scenario.routeId, scenario.request.sourceChain, scenario.request.destinationChain);

      expect(result.activeProviderId).toBe(scenario.expectedActiveProviderId);
      expect(stableSort(result.failedProviders)).toEqual(stableSort(scenario.expectedFailedProviders));

      // Providers attempted must include all failed providers (in priority order), and may include the winning one.
      for (const fp of scenario.expectedFailedProviders) {
        expect(result.attemptedProviders).toContain(fp);
      }

      // Quotes captured for every provider attempted.
      expect(result.quotes.length).toBe(result.attemptedProviders.length);
    }
  });

  it('resets call state between runs', async () => {
    const scenario = scenarios[1];
    const sim = new ProviderOutageSimulator(scenario.providers, { priority: scenario.priority });

    const first = await sim.run(scenario.routeId, scenario.request.sourceChain, scenario.request.destinationChain);
    expect(first.activeProviderId).toBe(scenario.expectedActiveProviderId);

    // On reset, AllBridge failure triggers after calls again; active should remain the same.
    sim.reset();
    const second = await sim.run(scenario.routeId, scenario.request.sourceChain, scenario.request.destinationChain);
    expect(second.activeProviderId).toBe(scenario.expectedActiveProviderId);
    expect(stableSort(second.failedProviders)).toEqual(stableSort(scenario.expectedFailedProviders));
  });
});

