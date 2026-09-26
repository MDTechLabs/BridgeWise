import {
  StellarProviderDependencyGraph,
  worstDependencyStatus,
  type DependencyStatus,
  type ProviderHealthReport,
} from '../dependencies/stellar';

// ─── Provider health surface (#1068) ──────────────────────────────────────────

export interface ProviderHealthOverview {
  /** Worst provider status across the fleet. */
  overall: DependencyStatus;
  total: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
  unknown: number;
  /** Providers that are not healthy, worst first. */
  failing: ProviderHealthReport[];
  /**
   * Dependencies causing failures, and the providers each one takes down.
   *
   * This is the view an operator actually wants: five providers failing for
   * one reason is one problem, not five.
   */
  rootCauses: { dependencyId: string; label: string; providerIds: string[] }[];
}

const SEVERITY: Record<DependencyStatus, number> = {
  healthy: 0,
  unknown: 1,
  degraded: 2,
  unhealthy: 3,
};

/** Roll per-provider health into a fleet-level view. */
export function summarizeProviderHealth(
  graph: StellarProviderDependencyGraph,
): ProviderHealthOverview {
  const reports = graph.allProviderHealth();

  const counts = { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 };

  for (const report of reports) counts[report.status] += 1;

  const failing = reports
    .filter((report) => report.status !== 'healthy')
    .sort((a, b) => SEVERITY[b.status] - SEVERITY[a.status]);

  // Group failures by the dependency responsible, so one shared outage is
  // reported once rather than once per provider.
  const byDependency = new Map<string, Set<string>>();

  for (const report of reports) {
    for (const failure of report.failing) {
      const providers =
        byDependency.get(failure.dependencyId) ?? new Set<string>();

      providers.add(report.providerId);
      byDependency.set(failure.dependencyId, providers);
    }
  }

  const rootCauses = [...byDependency.entries()]
    .map(([dependencyId, providerIds]) => ({
      dependencyId,
      label: graph.getDependency(dependencyId)?.label ?? dependencyId,
      providerIds: [...providerIds].sort(),
    }))
    // Widest blast radius first.
    .sort((a, b) => b.providerIds.length - a.providerIds.length);

  return {
    overall: worstDependencyStatus(reports.map((report) => report.status)),
    total: reports.length,
    ...counts,
    failing,
    rootCauses,
  };
}

/** Providers currently able to serve traffic. */
export function healthyProviderIds(
  graph: StellarProviderDependencyGraph,
): string[] {
  return graph
    .allProviderHealth()
    .filter((report) => report.status === 'healthy')
    .map((report) => report.providerId);
}
