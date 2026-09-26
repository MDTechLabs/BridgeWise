import type {
  DependencyHealth,
  DependencyStatus,
  ProviderDefinition,
  ProviderDependency,
  ProviderHealthReport,
} from './types';

/** Ordering used to decide which status is "worse". */
const SEVERITY: Record<DependencyStatus, number> = {
  healthy: 0,
  unknown: 1,
  degraded: 2,
  unhealthy: 3,
};

export function worstDependencyStatus(
  statuses: readonly DependencyStatus[],
): DependencyStatus {
  if (statuses.length === 0) return 'unknown';

  return statuses.reduce((worst, status) =>
    SEVERITY[status] > SEVERITY[worst] ? status : worst,
  );
}

export interface DependencyGraphOptions {
  /** Injectable clock, for deterministic tests. */
  now?: () => number;
}

/**
 * Models what each Stellar bridge provider depends on, and derives provider
 * health from the health of those dependencies (#1068).
 *
 * The problem this solves is attribution. A provider stops quoting and the
 * symptom is "provider X is down", but the cause is usually one shared RPC
 * endpoint, contract, or price API sitting underneath several providers. A
 * graph makes that a lookup rather than an investigation: record the
 * dependency as unhealthy once, and every provider that leans on it reports
 * the reason rather than a bare failure.
 *
 * Dependencies are shared by reference, so one failure fans out to every
 * provider that declares it — which is exactly what happens in production.
 */
export class StellarProviderDependencyGraph {
  private readonly dependencies = new Map<string, ProviderDependency>();
  private readonly providers = new Map<string, ProviderDefinition>();
  private readonly health = new Map<string, DependencyHealth>();
  private readonly now: () => number;

  constructor(options: DependencyGraphOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  /** Register a dependency. Re-registering updates its definition. */
  addDependency(dependency: ProviderDependency): void {
    this.dependencies.set(dependency.id, dependency);

    if (!this.health.has(dependency.id)) {
      this.health.set(dependency.id, {
        dependencyId: dependency.id,
        status: 'unknown',
        updatedAt: 0,
      });
    }
  }

  /**
   * Register a provider and the dependencies it requires.
   *
   * Every declared dependency must already be registered — a provider
   * pointing at a dependency that does not exist would silently report
   * healthy, having nothing to check.
   */
  addProvider(provider: ProviderDefinition): void {
    const unknownIds = provider.dependencyIds.filter(
      (id) => !this.dependencies.has(id),
    );

    if (unknownIds.length > 0) {
      throw new Error(
        `Provider ${provider.id} declares unknown dependencies: ${unknownIds.join(', ')}`,
      );
    }

    this.providers.set(provider.id, provider);
  }

  getDependency(dependencyId: string): ProviderDependency | undefined {
    return this.dependencies.get(dependencyId);
  }

  listDependencies(): ProviderDependency[] {
    return [...this.dependencies.values()];
  }

  listProviders(): ProviderDefinition[] {
    return [...this.providers.values()];
  }

  /** Record the current state of a dependency. */
  recordDependencyHealth(
    dependencyId: string,
    status: DependencyStatus,
    reason?: string,
  ): void {
    if (!this.dependencies.has(dependencyId)) {
      throw new Error(`Unknown dependency ${dependencyId}`);
    }

    this.health.set(dependencyId, {
      dependencyId,
      status,
      reason,
      updatedAt: this.now(),
    });
  }

  /** Current state of one dependency. */
  dependencyStatus(dependencyId: string): DependencyHealth {
    const existing = this.health.get(dependencyId);

    if (!existing) {
      throw new Error(`Unknown dependency ${dependencyId}`);
    }

    return { ...existing };
  }

  /** Current state of every dependency. */
  allDependencyStatuses(): DependencyHealth[] {
    return [...this.health.values()].map((entry) => ({ ...entry }));
  }

  /**
   * Which providers declare `dependencyId` — the answer to "what does this
   * outage affect?".
   */
  providersAffectedBy(dependencyId: string): ProviderDefinition[] {
    return [...this.providers.values()].filter((provider) =>
      provider.dependencyIds.includes(dependencyId),
    );
  }

  /**
   * Derive a provider's health from its dependencies.
   *
   * The grading is the point:
   *
   * - a **critical** dependency that is unhealthy makes the provider
   *   unhealthy — it cannot serve;
   * - a **critical** dependency that is degraded, or a **non-critical** one
   *   that is unhealthy, makes the provider degraded — it can still serve,
   *   worse;
   * - a critical dependency that has never reported leaves the provider
   *   `unknown`, because claiming health for something never checked is how a
   *   dashboard ends up lying.
   */
  providerHealth(providerId: string): ProviderHealthReport {
    const provider = this.providers.get(providerId);

    if (!provider) {
      throw new Error(`Unknown provider ${providerId}`);
    }

    const health = provider.dependencyIds.map((id) =>
      this.dependencyStatus(id),
    );

    const failing = health.filter(
      (entry) => entry.status === 'degraded' || entry.status === 'unhealthy',
    );
    const unknown = health.filter((entry) => entry.status === 'unknown');

    const isCritical = (entry: DependencyHealth) =>
      this.dependencies.get(entry.dependencyId)?.critical ?? false;

    const criticalFailures = failing.filter(
      (entry) => isCritical(entry) && entry.status === 'unhealthy',
    );

    let status: DependencyStatus;
    let summary: string;

    if (criticalFailures.length > 0) {
      status = 'unhealthy';
      summary = `Critical dependency failure: ${criticalFailures
        .map((entry) => this.labelFor(entry.dependencyId))
        .join(', ')}`;
    } else if (failing.length > 0) {
      status = 'degraded';
      summary = `Degraded by ${failing.map((entry) => this.labelFor(entry.dependencyId)).join(', ')}`;
    } else if (unknown.some(isCritical)) {
      status = 'unknown';
      summary = `Awaiting health for ${unknown
        .filter(isCritical)
        .map((entry) => this.labelFor(entry.dependencyId))
        .join(', ')}`;
    } else if (health.length === 0) {
      // A provider with no declared dependencies has nothing to derive health
      // from; saying "healthy" would be an unearned claim.
      status = 'unknown';
      summary = 'No dependencies declared';
    } else {
      status = 'healthy';
      summary = `All ${health.length} dependencies healthy`;
    }

    return {
      providerId,
      name: provider.name,
      status,
      failing,
      criticalFailures,
      unknown,
      summary,
    };
  }

  /** Health for every provider. */
  allProviderHealth(): ProviderHealthReport[] {
    return [...this.providers.keys()].map((id) => this.providerHealth(id));
  }

  /**
   * What breaks if `dependencyId` goes unhealthy, without actually recording
   * it — used to answer "is this endpoint safe to take out of rotation?".
   */
  impactOf(dependencyId: string): { unhealthy: string[]; degraded: string[] } {
    const dependency = this.dependencies.get(dependencyId);

    if (!dependency) {
      throw new Error(`Unknown dependency ${dependencyId}`);
    }

    const affected = this.providersAffectedBy(dependencyId);

    return dependency.critical
      ? { unhealthy: affected.map((provider) => provider.id), degraded: [] }
      : { unhealthy: [], degraded: affected.map((provider) => provider.id) };
  }

  private labelFor(dependencyId: string): string {
    return this.dependencies.get(dependencyId)?.label ?? dependencyId;
  }
}
