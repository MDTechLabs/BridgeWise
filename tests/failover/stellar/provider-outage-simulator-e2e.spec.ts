import path from 'node:path';
import { runProviderOutageFailoverSimulation } from './provider-outage-simulator.runner';

import { ProviderOutageSimulator, buildFailoverScenarios } from './provider-outage-simulator';

describe('#461 Stellar Provider Failover Simulator (integration)', () => {
  it('writes an artifacts JSON report and matches scenario expectations', async () => {
    const outPath = await runProviderOutageFailoverSimulation({ outDir: path.join(__dirname, 'artifacts') });
    expect(typeof outPath).toBe('string');
    expect(outPath).toContain('provider-outage-failover-');

    const scenarios = buildFailoverScenarios();
    for (const scenario of scenarios) {
      const sim = new ProviderOutageSimulator(scenario.providers, { priority: scenario.priority });
      const result = await sim.run(
        scenario.routeId,
        scenario.request.sourceChain,
        scenario.request.destinationChain,
      );

      expect(result.activeProviderId).toBe(scenario.expectedActiveProviderId);
      const failed = [...result.failedProviders].sort();
      const expectedFailed = [...scenario.expectedFailedProviders].sort();
      expect(failed).toEqual(expectedFailed);
    }
  });
});

