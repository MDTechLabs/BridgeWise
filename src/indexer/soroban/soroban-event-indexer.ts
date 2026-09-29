/**
 * Soroban event indexing.
 *
 * Soroban RPC returns events per ledger and in page order, not in the order a
 * consumer wants them. This indexer stores events in ledger order, removes the
 * duplicates that arrive when a range is re-read, serves filtered and paged
 * queries, and can drop a ledger range that a reorg has invalidated.
 */

export interface SorobanIndexedEvent {
  ledger: number;
  txHash: string;
  /** Position of the event within its transaction. */
  eventIndex: number;
  contractId: string;
  topics: string[];
  value: unknown;
}

export interface SorobanEventQuery {
  contractId?: string;
  topic?: string;
  fromLedger?: number;
  toLedger?: number;
  limit?: number;
  offset?: number;
}

export interface SorobanEventPage {
  events: SorobanIndexedEvent[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface SorobanIngestStats {
  received: number;
  indexed: number;
  duplicates: number;
}

export interface SorobanEventIndexStats {
  total: number;
  contracts: number;
  minLedger: number | null;
  maxLedger: number | null;
}

const DEFAULT_LIMIT = 50;

function eventKey(event: SorobanIndexedEvent): string {
  return `${event.ledger}:${event.txHash}:${event.eventIndex}`;
}

function compareEvents(
  left: SorobanIndexedEvent,
  right: SorobanIndexedEvent,
): number {
  if (left.ledger !== right.ledger) return left.ledger - right.ledger;
  if (left.txHash !== right.txHash) return left.txHash < right.txHash ? -1 : 1;
  return left.eventIndex - right.eventIndex;
}

export class SorobanEventIndexer {
  private readonly events = new Map<string, SorobanIndexedEvent>();
  private readonly contracts = new Set<string>();

  /** Store a batch of events, discarding those already indexed. */
  ingest(events: SorobanIndexedEvent[]): SorobanIngestStats {
    let indexed = 0;
    let duplicates = 0;

    for (const event of events) {
      const key = eventKey(event);

      if (this.events.has(key)) {
        duplicates += 1;
        continue;
      }

      this.events.set(key, {
        ...event,
        topics: [...event.topics],
      });
      this.contracts.add(event.contractId);
      indexed += 1;
    }

    return { received: events.length, indexed, duplicates };
  }

  query(query: SorobanEventQuery = {}): SorobanEventPage {
    const offset = Math.max(0, query.offset ?? 0);
    const limit = query.limit === undefined ? DEFAULT_LIMIT : Math.max(0, query.limit);

    const matched = [...this.events.values()]
      .filter((event) => this.matches(event, query))
      .sort(compareEvents);

    const page = matched.slice(offset, offset + limit);

    return {
      events: page,
      total: matched.length,
      offset,
      limit,
      hasMore: offset + limit < matched.length,
    };
  }

  /**
   * Drop every event at or above `ledger`. A reorg replaces that range, so the
   * events from it must be re-read rather than kept.
   */
  rollbackTo(ledger: number): number {
    let removed = 0;

    for (const [key, event] of this.events) {
      if (event.ledger >= ledger) {
        this.events.delete(key);
        removed += 1;
      }
    }

    this.rebuildContracts();

    return removed;
  }

  getStats(): SorobanEventIndexStats {
    const events = [...this.events.values()];
    const ledgers = events.map((event) => event.ledger);

    return {
      total: events.length,
      contracts: this.contracts.size,
      minLedger: ledgers.length > 0 ? Math.min(...ledgers) : null,
      maxLedger: ledgers.length > 0 ? Math.max(...ledgers) : null,
    };
  }

  clear(): void {
    this.events.clear();
    this.contracts.clear();
  }

  private matches(event: SorobanIndexedEvent, query: SorobanEventQuery): boolean {
    if (query.contractId && event.contractId !== query.contractId) return false;
    if (query.topic && !event.topics.includes(query.topic)) return false;
    if (query.fromLedger !== undefined && event.ledger < query.fromLedger) return false;
    if (query.toLedger !== undefined && event.ledger > query.toLedger) return false;

    return true;
  }

  private rebuildContracts(): void {
    this.contracts.clear();
    for (const event of this.events.values()) {
      this.contracts.add(event.contractId);
    }
  }
}
