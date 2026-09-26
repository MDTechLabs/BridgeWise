import type { OutageSimulationResult, ProviderFailureReason, SimulatorProvider } from './provider-outage-simulator';

export interface SimulatorRunReport {
  simulator: 'provider-outage-simulator';
  createdAt: string;
  scenarios: Array<{
    scenarioId: string;
    durationMs: number;
    activeProviderId: string | null;
    failedProviders: string[];
    attemptedProviders: string[];
    quotes: Array<{ providerId: string; simulatedError?: string }>;
    expectations: {
      expectedActiveProviderId: string | null;
      expectedFailedProviders: string[];
    };
    meta: {
      // reserved for future provider configs
      providerCount: number;
    };
    pass: boolean;
  }>;
}

export function buildReport(
  params: {
    scenarioId: string;
    result: OutageSimulationResult;
    expectedActiveProviderId: string | null;
    expectedFailedProviders: string[];
    providerSnapshot: SimulatorProvider[];
  },
): SimulatorRunReport['scenarios'][number] {
  const { scenarioId, result, expectedActiveProviderId, expectedFailedProviders, providerSnapshot } = params;

  return {
    scenarioId,
    durationMs: result.durationMs,
    activeProviderId: result.activeProviderId,
    failedProviders: result.failedProviders,
    attemptedProviders: result.attemptedProviders,
    quotes: result.quotes.map((q) => ({ providerId: q.providerId, simulatedError: q.result.simulatedError })),
    expectations: {
      expectedActiveProviderId,
      expectedFailedProviders,
    },
    meta: {
      providerCount: providerSnapshot.length,
    },
    pass:
      result.activeProviderId === expectedActiveProviderId &&
      normalizeArray(result.failedProviders).join('|') === normalizeArray(expectedFailedProviders).join('|'),
  };
}

function normalizeArray(arr: string[]): string[] {
  return [...arr].sort();
}

export function buildTopLevelReport(params: {
  scenarios: SimulatorRunReport['scenarios'];
}): SimulatorRunReport {
  return {
    simulator: 'provider-outage-simulator',
    createdAt: new Date().toISOString(),
    scenarios: params.scenarios,
  };
}

