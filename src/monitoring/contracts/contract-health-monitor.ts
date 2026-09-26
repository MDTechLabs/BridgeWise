import {
  checkSorobanContractHealth,
  messageOf,
  type ContractHealthResult,
  type ContractHealthStatus,
  type HealthCheckOptions,
  type SorobanContractConfig,
  type SorobanContractProbe,
} from '../../contracts/health/soroban';

// ─── Contract integration monitoring (#1067) ──────────────────────────────────

export interface ContractHealthSummary {
  /** Worst status across every monitored contract. */
  overall: ContractHealthStatus;
  total: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
  /** Contract ids that are not healthy, worst first. */
  failing: string[];
  checkedAt: number;
}

export interface MonitorOptions extends HealthCheckOptions {
  /** Results retained per contract. Default 20. */
  historyLimit?: number;
}

/** Ordering used to decide which status is "worse". */
const SEVERITY: Record<ContractHealthStatus, number> = {
  healthy: 0,
  unknown: 1,
  degraded: 2,
  unhealthy: 3,
};

export function worstStatus(
  statuses: readonly ContractHealthStatus[],
): ContractHealthStatus {
  // No contracts is not the same as healthy contracts. Reporting "healthy"
  // for an empty monitor would hide a misconfiguration where nothing was
  // registered at all.
  if (statuses.length === 0) return 'unknown';

  return statuses.reduce((worst, status) =>
    SEVERITY[status] > SEVERITY[worst] ? status : worst,
  );
}

/**
 * Runs health checks across every configured contract integration and keeps a
 * short history of the results.
 *
 * History matters because a single failing check does not distinguish a
 * transient RPC blip from an integration that has been broken since deploy,
 * and those need different responses.
 */
export class ContractHealthMonitor {
  private readonly contracts = new Map<string, SorobanContractConfig>();
  private readonly history = new Map<string, ContractHealthResult[]>();
  private readonly historyLimit: number;
  private readonly options: HealthCheckOptions;
  private readonly now: () => number;

  constructor(
    private readonly probe: SorobanContractProbe,
    options: MonitorOptions = {},
  ) {
    const { historyLimit = 20, ...checkOptions } = options;

    this.historyLimit = historyLimit;
    this.options = checkOptions;
    this.now = checkOptions.now ?? Date.now;
  }

  register(config: SorobanContractConfig): void {
    this.contracts.set(config.id, config);
  }

  unregister(contractId: string): void {
    this.contracts.delete(contractId);
    this.history.delete(contractId);
  }

  registered(): SorobanContractConfig[] {
    return [...this.contracts.values()];
  }

  /** Check one contract and record the result. */
  async check(contractId: string): Promise<ContractHealthResult> {
    const config = this.contracts.get(contractId);

    if (!config) {
      throw new Error(`No contract registered with id ${contractId}`);
    }

    const result = await checkSorobanContractHealth(
      config,
      this.probe,
      this.options,
    );

    const existing = this.history.get(contractId) ?? [];

    this.history.set(
      contractId,
      [result, ...existing].slice(0, this.historyLimit),
    );

    return result;
  }

  /**
   * Check every registered contract.
   *
   * Checks run concurrently and a thrown check becomes an `unknown` result
   * rather than failing the sweep — one unreachable integration must not hide
   * the status of the others.
   */
  async checkAll(): Promise<ContractHealthResult[]> {
    const ids = [...this.contracts.keys()];

    return Promise.all(
      ids.map(async (id) => {
        try {
          return await this.check(id);
        } catch (error) {
          const config = this.contracts.get(id);

          return {
            contractId: id,
            name: config?.name ?? id,
            network: config?.network ?? 'local',
            status: 'unknown' as const,
            checks: [
              {
                name: 'availability' as const,
                ok: false,
                message: messageOf(error),
                durationMs: 0,
              },
            ],
            missingMethods: [],
            checkedAt: this.now(),
            totalDurationMs: 0,
          };
        }
      }),
    );
  }

  /** Most recent result for a contract, if it has been checked. */
  latest(contractId: string): ContractHealthResult | undefined {
    return this.history.get(contractId)?.[0];
  }

  /** Recorded results for a contract, most recent first. */
  historyFor(contractId: string): ContractHealthResult[] {
    return [...(this.history.get(contractId) ?? [])];
  }

  /** Roll the latest result for every contract into one verdict. */
  summary(): ContractHealthSummary {
    const latest = [...this.contracts.keys()]
      .map((id) => this.latest(id))
      .filter((result): result is ContractHealthResult => result !== undefined);

    const counts = { healthy: 0, degraded: 0, unhealthy: 0 };

    for (const result of latest) {
      if (result.status === 'healthy') counts.healthy += 1;
      else if (result.status === 'degraded') counts.degraded += 1;
      else if (result.status === 'unhealthy') counts.unhealthy += 1;
    }

    const failing = latest
      .filter((result) => result.status !== 'healthy')
      .sort((a, b) => SEVERITY[b.status] - SEVERITY[a.status])
      .map((result) => result.contractId);

    return {
      overall: worstStatus(latest.map((result) => result.status)),
      total: latest.length,
      ...counts,
      failing,
      checkedAt: this.now(),
    };
  }

  /**
   * Whether a contract has failed every one of its last `count` checks.
   *
   * A run of failures is what separates a broken integration from a blip.
   */
  isPersistentlyFailing(contractId: string, count = 3): boolean {
    const recent = (this.history.get(contractId) ?? []).slice(0, count);

    if (recent.length < count) return false;

    return recent.every((result) => result.status === 'unhealthy');
  }
}
