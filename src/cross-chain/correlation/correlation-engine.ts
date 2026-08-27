import { randomUUID } from 'node:crypto';

export type ChainIdentifier = 'stellar' | 'evm';

export type CorrelationStatus =
  'pending' | 'source_linked' | 'destination_linked' | 'completed' | 'failed';

export interface CorrelatedTransaction {
  chain: ChainIdentifier;
  txHash: string;
  linkedAt: number;
}

export interface CorrelationRecord {
  correlationId: string;
  source?: CorrelatedTransaction;
  destination?: CorrelatedTransaction;
  status: CorrelationStatus;
  createdAt: number;
  updatedAt: number;
}

export interface CorrelationEngineConfig {
  now?: () => number;
}

export class CrossChainTransferCorrelationEngine {
  private readonly records = new Map<string, CorrelationRecord>();
  private readonly now: () => number;

  constructor(config: CorrelationEngineConfig = {}) {
    this.now = config.now ?? Date.now;
  }

  create(source: CorrelatedTransaction): CorrelationRecord {
    const now = this.now();
    const record: CorrelationRecord = {
      correlationId: randomUUID(),
      source,
      status: 'source_linked',
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(record.correlationId, record);
    return record;
  }

  linkDestination(
    correlationId: string,
    destination: CorrelatedTransaction,
  ): CorrelationRecord | null {
    const record = this.records.get(correlationId);
    if (!record) {
      return null;
    }
    record.destination = destination;
    record.status = 'destination_linked';
    record.updatedAt = this.now();
    return record;
  }

  complete(correlationId: string): CorrelationRecord | null {
    const record = this.records.get(correlationId);
    if (!record) {
      return null;
    }
    record.status = 'completed';
    record.updatedAt = this.now();
    return record;
  }

  fail(correlationId: string): CorrelationRecord | null {
    const record = this.records.get(correlationId);
    if (!record) {
      return null;
    }
    record.status = 'failed';
    record.updatedAt = this.now();
    return record;
  }

  get(correlationId: string): CorrelationRecord | null {
    return this.records.get(correlationId) ?? null;
  }
}
