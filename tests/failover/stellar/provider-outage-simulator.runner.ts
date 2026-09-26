import fs from 'node:fs';
import path from 'node:path';
import { ProviderOutageSimulator, buildFailoverScenarios, SimulatorProvider } from './provider-outage-simulator';
import { buildReport, buildTopLevelReport } from './failover-simulator-report';

export interface RunnerOptions {
  outDir?: string;
}

function ensureDir(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

export async function runProviderOutageFailoverSimulation(opts: RunnerOptions = {}): Promise<string> {
  const scenarios = buildFailoverScenarios();

  const outDir = opts.outDir ?? path.join(__dirname, 'artifacts');
  ensureDir(outDir);

  const results = [] as ReturnType<typeof buildReport>[];

  for (const scenario of scenarios) {
    const sim = new ProviderOutageSimulator(scenario.providers as SimulatorProvider[], { priority: scenario.priority });
    const result = await sim.run(scenario.routeId, scenario.request.sourceChain, scenario.request.destinationChain);

    results.push(
      buildReport({
        scenarioId: scenario.id,
        result,
        expectedActiveProviderId: scenario.expectedActiveProviderId,
        expectedFailedProviders: scenario.expectedFailedProviders,
        providerSnapshot: scenario.providers as SimulatorProvider[],
      }),
    );
  }

  const top = buildTopLevelReport({ scenarios: results });

  const fileName = `provider-outage-failover-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const outPath = path.join(outDir, fileName);
  fs.writeFileSync(outPath, JSON.stringify(top, null, 2), 'utf-8');

  return outPath;
}

