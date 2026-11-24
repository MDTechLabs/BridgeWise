export type Provider = { id: string; capacity: number; domains: string[]; healthy: boolean };
export type Route = { id: string; requiredCapacity: number; providers: Provider[] };

export type SimulationResult = {
  routeId: string;
  scenario: string;
  availableCapacity: number;
  fillable: boolean;
  failedProviders: string[];
};

export function simulateDomainFailure(route: Route, failedDomain: string): SimulationResult {
  const failedProviders = route.providers.filter((p) => p.domains.includes(failedDomain)).map((p) => p.id);
  const availableCapacity = route.providers
    .filter((p) => !p.domains.includes(failedDomain) && p.healthy)
    .reduce((sum, p) => sum + p.capacity, 0);
  return {
    routeId: route.id,
    scenario: `domain:${failedDomain}`,
    availableCapacity,
    fillable: availableCapacity >= route.requiredCapacity,
    failedProviders,
  };
}

export function routeEnablementAllowed(results: SimulationResult[]): boolean {
  return results.every((r) => r.fillable);
}
