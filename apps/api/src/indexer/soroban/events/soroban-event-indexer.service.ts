import { Injectable, Logger } from '@nestjs/common';
import { LedgerCursorManagerService } from '../../stellar/cursors/ledger-cursor-manager.service';

export interface SorobanContractEvent {
  ledger: number;
  txHash: string;
  contractId: string;
  /** Position of the event within the transaction. */
  eventIndex: number;
  topics: string[];
  value: unknown;
}

export interface IndexedEvent extends SorobanContractEvent {
  /** Deterministic identity used for deduplication. */
  id: string;
  indexedAt: string;
}

/** Pluggable storage for indexed events (defaults to in-memory). */
export interface EventStore {
  has(id: string): boolean;
  save(event: IndexedEvent): void;
  count(): number;
  fromLedger(ledger: number): IndexedEvent[];
}

class InMemoryEventStore implements EventStore {
  private readonly map = new Map<string, IndexedEvent>();
  has(id: string): boolean {
    return this.map.has(id);
  }
  save(event: IndexedEvent): void {
    this.map.set(event.id, event);
  }
  count(): number {
    return this.map.size;
  }
  fromLedger(ledger: number): IndexedEvent[] {
    return [...this.map.values()].filter((e) => e.ledger >= ledger);
  }
}

/** Deterministic id from the immutable coordinates of a contract event. */
export function deriveEventId(event: SorobanContractEvent): string {
  return `${event.ledger}:${event.txHash}:${event.eventIndex}`;
}

export interface IndexResult {
  indexed: number;
  skipped: number;
  lastLedger: number;
}

/**
 * Indexes Soroban contract events for transfer tracking. Deduplicates by a
 * deterministic id, supports incremental synchronization via a ledger cursor,
 * and never stores the same event twice.
 */
@Injectable()
export class SorobanEventIndexerService {
  private readonly logger = new Logger(SorobanEventIndexerService.name);

  constructor(
    private readonly cursorManager: LedgerCursorManagerService,
    private readonly store: EventStore = new InMemoryEventStore(),
    private readonly cursorName = 'soroban-events',
  ) {}

  /** Ledger to fetch from next, based on the persisted cursor. */
  nextLedger(from = 0): number {
    return this.cursorManager.resumeLedger(this.cursorName, from);
  }

  index(events: SorobanContractEvent[]): IndexResult {
    let indexed = 0;
    let skipped = 0;
    let maxLedger = this.cursorManager.getCursor(this.cursorName)?.lastLedger ?? -1;

    for (const event of events) {
      const id = deriveEventId(event);
      if (this.store.has(id)) {
        skipped++;
        continue;
      }
      this.store.save({ ...event, id, indexedAt: new Date().toISOString() });
      indexed++;
      if (event.ledger > maxLedger) maxLedger = event.ledger;
    }

    // Advance the cursor only when we saw newer ledgers than the stored one.
    const current = this.cursorManager.getCursor(this.cursorName)?.lastLedger ?? -1;
    if (maxLedger > current) {
      this.cursorManager.advance(this.cursorName, maxLedger);
    }

    return { indexed, skipped, lastLedger: Math.max(maxLedger, 0) };
  }

  getEventsFromLedger(ledger: number): IndexedEvent[] {
    return this.store.fromLedger(ledger);
  }

  totalIndexed(): number {
    return this.store.count();
  }
}
