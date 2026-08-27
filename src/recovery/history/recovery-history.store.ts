/**
 * src/recovery/history/recovery-history.store.ts
 *
 * Storage abstraction for recovery history records. An in-memory
 * implementation is provided for tests/local dev; swap in a persistent
 * implementation (Postgres, Redis, etc.) by implementing the same
 * interface and providing it to RecoveryHistoryService.
 */

import { RecoveryHistoryRecord } from './types';

export interface RecoveryHistoryStore {
  get(transferId: string): RecoveryHistoryRecord | undefined;
  save(record: RecoveryHistoryRecord): void;
  delete(transferId: string): void;
  all(): RecoveryHistoryRecord[];
}

export class InMemoryRecoveryHistoryStore implements RecoveryHistoryStore {
  private readonly records = new Map<string, RecoveryHistoryRecord>();

  get(transferId: string): RecoveryHistoryRecord | undefined {
    const record = this.records.get(transferId);
    // Return a shallow-cloned copy so callers can't mutate internal state
    // without going through save().
    return record ? { ...record, attempts: [...record.attempts] } : undefined;
  }

  save(record: RecoveryHistoryRecord): void {
    this.records.set(record.transferId, {
      ...record,
      attempts: [...record.attempts],
    });
  }

  delete(transferId: string): void {
    this.records.delete(transferId);
  }

  all(): RecoveryHistoryRecord[] {
    return Array.from(this.records.values()).map((record) => ({
      ...record,
      attempts: [...record.attempts],
    }));
  }
}
