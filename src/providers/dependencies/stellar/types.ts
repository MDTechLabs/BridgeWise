// ─── Stellar bridge provider dependencies (#1068) ─────────────────────────────

/** What kind of thing a provider depends on. */
export type DependencyKind =
  'rpc' | 'horizon' | 'contract' | 'liquidity' | 'api' | 'indexer';

export type DependencyStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface ProviderDependency {
  id: string;
  kind: DependencyKind;
  /** Human label used in reports. */
  label: string;
  /**
   * Whether the provider can function at all without it.
   *
   * Critical is not "important" — it is "the provider cannot serve a quote or
   * a transfer without this". A price API going down may degrade quality; an
   * RPC endpoint going down stops the provider entirely, and the two must not
   * be reported the same way.
   */
  critical: boolean;
}

export interface ProviderDefinition {
  id: string;
  name: string;
  /** Ids of the dependencies this provider requires. */
  dependencyIds: readonly string[];
}

export interface DependencyHealth {
  dependencyId: string;
  status: DependencyStatus;
  /** Why it is in this state, when known. */
  reason?: string;
  /** Epoch ms of the last update; 0 when never reported. */
  updatedAt: number;
}

export interface ProviderHealthReport {
  providerId: string;
  name: string;
  status: DependencyStatus;
  /** Dependencies that are not healthy. */
  failing: DependencyHealth[];
  /** The subset of `failing` the provider cannot operate without. */
  criticalFailures: DependencyHealth[];
  /** Dependencies that have never reported. */
  unknown: DependencyHealth[];
  /** One-line explanation of the status. */
  summary: string;
}
