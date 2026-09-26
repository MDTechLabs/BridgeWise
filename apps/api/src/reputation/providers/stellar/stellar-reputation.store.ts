import { Injectable } from '@nestjs/common';
import { ProviderRecord, ProviderHistoryEntry } from './types';

@Injectable()
export class StellarReputationStore {
  // In production replace with a DB/Redis-backed store
  private readonly store = new Map<string, ProviderRecord>();

  getOrCreate(providerId: string): ProviderRecord {
    if (!this.store.has(providerId)) {
      this.store.set(providerId, {
        providerId,
        history: [],
        currentScore: null,
        lastUpdated: new Date(),
      });
    }
    return this.store.get(providerId)!;
  }

  appendEntry(providerId: string, entry: ProviderHistoryEntry): void {
    const record = this.getOrCreate(providerId);
    record.history.push(entry);
    record.lastUpdated = new Date();
  }

  getHistory(
    providerId: string,
    since?: Date
  ): ProviderHistoryEntry[] {
    const record = this.getOrCreate(providerId);
    if (!since) return record.history;
    return record.history.filter((e) => e.timestamp >= since);
  }

  setScore(providerId: string, score: import('./types').ReputationScore): void {
    const record = this.getOrCreate(providerId);
    record.currentScore = score;
  }

  getScore(providerId: string) {
    return this.getOrCreate(providerId).currentScore;
  }

  getAllProviderIds(): string[] {
    return Array.from(this.store.keys());
  }
}