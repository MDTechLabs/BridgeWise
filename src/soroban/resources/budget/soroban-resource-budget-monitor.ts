/**
 * Soroban resource budget monitoring.
 *
 * Soroban charges independently for CPU instructions, memory and ledger
 * read/write bytes, and a transaction that is comfortably inside one budget
 * can still be refused for another. This monitor tracks cumulative consumption
 * per contract and resource, warns before a budget is reached, and surfaces the
 * consumption that led to each alert.
 */

export type SorobanResourceKind =
  | 'cpu-instructions'
  | 'memory-bytes'
  | 'read-bytes'
  | 'write-bytes'
  | 'fee-stroops';

export type SorobanResourceStatus = 'ok' | 'warning' | 'critical' | 'exceeded';

export interface SorobanResourceUsage {
  cpuInstructions?: number;
  memoryBytes?: number;
  readBytes?: number;
  writeBytes?: number;
  feeStroops?: number;
}

export interface SorobanResourceBudget {
  cpuInstructions: number;
  memoryBytes: number;
  readBytes: number;
  writeBytes: number;
  feeStroops: number;
  /** Fraction of budget at which a warning is raised. Default 0.75. */
  warningThreshold?: number;
  /** Fraction of budget at which a critical alert is raised. Default 0.9. */
  criticalThreshold?: number;
}

export interface SorobanResourceAlert {
  contractId: string;
  kind: SorobanResourceKind;
  status: Exclude<SorobanResourceStatus, 'ok'>;
  used: number;
  limit: number;
  ratio: number;
  message: string;
}

export interface SorobanResourceSnapshot {
  contractId: string;
  usage: SorobanResourceUsage;
  perResource: Record<
    SorobanResourceKind,
    { used: number; limit: number; ratio: number; status: SorobanResourceStatus }
  >;
  sampleCount: number;
}

export interface SorobanResourceRecordContext {
  contractId: string;
  operation?: string;
}

export const DEFAULT_SOROBAN_RESOURCE_BUDGET: SorobanResourceBudget = {
  cpuInstructions: 100_000_000,
  memoryBytes: 40 * 1024 * 1024,
  readBytes: 200_000,
  writeBytes: 100_000,
  feeStroops: 10_000_000,
};

const RESOURCE_FIELDS: Record<SorobanResourceKind, keyof SorobanResourceUsage> = {
  'cpu-instructions': 'cpuInstructions',
  'memory-bytes': 'memoryBytes',
  'read-bytes': 'readBytes',
  'write-bytes': 'writeBytes',
  'fee-stroops': 'feeStroops',
};

function classify(
  ratio: number,
  warningThreshold: number,
  criticalThreshold: number,
): SorobanResourceStatus {
  if (ratio > 1) return 'exceeded';
  if (ratio >= criticalThreshold) return 'critical';
  if (ratio >= warningThreshold) return 'warning';
  return 'ok';
}

export class SorobanResourceBudgetMonitor {
  private readonly budget: Required<SorobanResourceBudget>;
  private readonly usage = new Map<string, Record<SorobanResourceKind, number>>();
  private readonly samples = new Map<string, number>();

  constructor(budget: Partial<SorobanResourceBudget> = {}) {
    const merged = { ...DEFAULT_SOROBAN_RESOURCE_BUDGET, ...budget };
    this.budget = {
      ...merged,
      warningThreshold: merged.warningThreshold ?? 0.75,
      criticalThreshold: merged.criticalThreshold ?? 0.9,
    };
  }

  getBudget(): SorobanResourceBudget {
    return { ...this.budget };
  }

  /**
   * Record one transaction's resource usage and return an alert for every
   * resource that crossed a threshold. Consuming nothing raises nothing.
   */
  record(
    usage: SorobanResourceUsage,
    context: SorobanResourceRecordContext,
  ): SorobanResourceAlert[] {
    const totals = this.ensure(usagePrefix(context));
    const alerts: SorobanResourceAlert[] = [];

    for (const kind of Object.keys(RESOURCE_FIELDS) as SorobanResourceKind[]) {
      const field = RESOURCE_FIELDS[kind];
      const amount = usage[field] ?? 0;
      if (amount === 0) continue;

      totals[kind] += amount;
      const limit = this.budget[field] as number;
      const ratio = limit === 0 ? (totals[kind] > 0 ? Infinity : 0) : totals[kind] / limit;
      const status = classify(
        ratio,
        this.budget.warningThreshold,
        this.budget.criticalThreshold,
      );

      if (status !== 'ok') {
        alerts.push({
          contractId: context.contractId,
          kind,
          status,
          used: totals[kind],
          limit,
          ratio,
          message: `Soroban ${kind} usage for ${context.contractId} is ${status} at ${formatRatio(ratio)} of budget`,
        });
      }
    }

    this.samples.set(
      usagePrefix(context),
      (this.samples.get(usagePrefix(context)) ?? 0) + 1,
    );

    return alerts;
  }

  getSnapshot(contractId: string): SorobanResourceSnapshot {
    const prefix = usagePrefix({ contractId });
    const totals = this.usage.get(prefix) ?? emptyTotals();
    const perResource = {} as SorobanResourceSnapshot['perResource'];

    for (const kind of Object.keys(RESOURCE_FIELDS) as SorobanResourceKind[]) {
      const limit = this.budget[RESOURCE_FIELDS[kind]] as number;
      const ratio = limit === 0 ? (totals[kind] > 0 ? Infinity : 0) : totals[kind] / limit;
      perResource[kind] = {
        used: totals[kind],
        limit,
        ratio,
        status: classify(
          ratio,
          this.budget.warningThreshold,
          this.budget.criticalThreshold,
        ),
      };
    }

    return {
      contractId,
      usage: this.toUsage(totals),
      perResource,
      sampleCount: this.samples.get(prefix) ?? 0,
    };
  }

  reset(contractId?: string): void {
    if (contractId === undefined) {
      this.usage.clear();
      this.samples.clear();
      return;
    }

    const prefix = usagePrefix({ contractId });
    this.usage.delete(prefix);
    this.samples.delete(prefix);
  }

  private ensure(prefix: string): Record<SorobanResourceKind, number> {
    const existing = this.usage.get(prefix);
    if (existing) return existing;

    const created = emptyTotals();
    this.usage.set(prefix, created);
    return created;
  }

  private toUsage(
    totals: Record<SorobanResourceKind, number>,
  ): SorobanResourceUsage {
    return {
      cpuInstructions: totals['cpu-instructions'],
      memoryBytes: totals['memory-bytes'],
      readBytes: totals['read-bytes'],
      writeBytes: totals['write-bytes'],
      feeStroops: totals['fee-stroops'],
    };
  }
}

function usagePrefix(context: SorobanResourceRecordContext): string {
  return context.contractId;
}

function emptyTotals(): Record<SorobanResourceKind, number> {
  return {
    'cpu-instructions': 0,
    'memory-bytes': 0,
    'read-bytes': 0,
    'write-bytes': 0,
    'fee-stroops': 0,
  };
}

function formatRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return 'an undefined';
  return `${(ratio * 100).toFixed(1)}%`;
}
