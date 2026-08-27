export type SettlementStatus = 'pending' | 'completed' | 'failed' | 'delayed';

export interface TimeoutPolicy {
  id: string;
  expectedDurationMs: number;
}

export interface SettlementTimeoutRecord {
  settlementId: string;
  startedAt: number;
  policyId: string;
  expectedDurationMs: number;
  status: SettlementStatus;
}

export interface TimeoutMonitorConfig {
  now?: () => number;
  onDelayed?: (settlementId: string) => void;
}

export class StellarSettlementTimeoutMonitor {
  private readonly policies = new Map<string, TimeoutPolicy>();
  private readonly records = new Map<string, SettlementTimeoutRecord>();
  private readonly now: () => number;
  private readonly onDelayed?: (settlementId: string) => void;

  constructor(config: TimeoutMonitorConfig = {}) {
    this.now = config.now ?? Date.now;
    this.onDelayed = config.onDelayed;
  }

  addPolicy(policy: TimeoutPolicy): void {
    if (!policy.id || policy.expectedDurationMs <= 0) {
      throw new Error('Invalid timeout policy');
    }
    this.policies.set(policy.id, policy);
  }

  track(settlementId: string, policyId: string): SettlementTimeoutRecord {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Unknown timeout policy: ${policyId}`);
    }
    const now = this.now();
    const record: SettlementTimeoutRecord = {
      settlementId,
      startedAt: now,
      policyId,
      expectedDurationMs: policy.expectedDurationMs,
      status: 'pending',
    };
    this.records.set(settlementId, record);
    return record;
  }

  check(settlementId: string): SettlementTimeoutRecord | null {
    const record = this.records.get(settlementId);
    if (!record) {
      return null;
    }
    if (record.status !== 'pending') {
      return record;
    }
    const elapsed = this.now() - record.startedAt;
    if (elapsed > record.expectedDurationMs) {
      record.status = 'delayed';
      this.onDelayed?.(settlementId);
    }
    return record;
  }

  complete(settlementId: string): SettlementTimeoutRecord | null {
    const record = this.records.get(settlementId);
    if (!record) {
      return null;
    }
    record.status = 'completed';
    return record;
  }

  markOverdue(settlementId: string): SettlementTimeoutRecord | null {
    const record = this.records.get(settlementId);
    if (!record) {
      return null;
    }
    record.status = 'delayed';
    this.onDelayed?.(settlementId);
    return record;
  }
}
