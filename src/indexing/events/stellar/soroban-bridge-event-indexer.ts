/**
 * Soroban Bridge Event Indexer
 *
 * Indexes bridge events (deposits, withdrawals, swaps, etc.) emitted by
 * Soroban bridge contracts for querying and analysis.
 */

export interface SorobanBridgeEvent {
  eventId: string;
  contractId: string;
  eventType: SorobanBridgeEventType;
  transactionHash: string;
  ledger: number;
  timestamp: number;
  /** Event topics as emitted by the contract */
  topics: string[];
  /** Event data (decoded or raw) */
  data: Record<string, unknown>;
  /** Indexed fields for querying */
  indexed: SorobanBridgeEventIndexedFields;
}

export type SorobanBridgeEventType =
  | 'deposit'
  | 'withdrawal'
  | 'swap'
  | 'route_update'
  | 'fee_update'
  | 'pause'
  | 'unpause'
  | 'ownership_transfer'
  | 'bridge_transfer'
  | 'unknown';

export interface SorobanBridgeEventIndexedFields {
  /** Source chain for cross-chain operations */
  sourceChain?: string;
  /** Destination chain for cross-chain operations */
  destinationChain?: string;
  /** Asset involved (contract ID or native) */
  asset?: string;
  /** Amount in stroops/wei */
  amount?: string;
  /** Sender address */
  from?: string;
  /** Recipient address */
  to?: string;
  /** Bridge-specific route ID */
  routeId?: string;
  /** Sender address on destination chain */
  destinationRecipient?: string;
}

export interface SorobanBridgeEventFilter {
  eventId?: string;
  contractId?: string;
  eventType?: SorobanBridgeEventType;
  transactionHash?: string;
  ledger?: number;
  minTimestamp?: number;
  maxTimestamp?: number;
  asset?: string;
  from?: string;
  to?: string;
  routeId?: string;
  sourceChain?: string;
  destinationChain?: string;
}

export interface SorobanBridgeEventQueryOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'ledger';
  order?: 'asc' | 'desc';
}

export interface SorobanBridgeEventQueryResult {
  total: number;
  items: SorobanBridgeEvent[];
}

export class SorobanBridgeEventIndexer {
  private readonly events = new Map<string, SorobanBridgeEvent>();
  private readonly insertionOrder: string[] = [];

  /**
   * Index a bridge event.
   * If an event with the same eventId already exists, it will be updated.
   */
  indexEvent(event: Omit<SorobanBridgeEvent, 'eventId'> & { eventId?: string }): SorobanBridgeEvent {
    const eventId = event.eventId ?? this.generateEventId(event);
    const storedEvent: SorobanBridgeEvent = {
      ...event,
      eventId,
      indexed: event.indexed ?? this.extractIndexedFields(event),
    };

    const exists = this.events.has(eventId);
    this.events.set(eventId, storedEvent);

    if (!exists) {
      this.insertionOrder.push(eventId);
    }

    return storedEvent;
  }

  /**
   * Index multiple bridge events in bulk.
   */
  bulkIndexEvents(
    events: Array<Omit<SorobanBridgeEvent, 'eventId'> & { eventId?: string }>,
  ): SorobanBridgeEvent[] {
    return events.map((event) => this.indexEvent(event));
  }

  /**
   * Get an indexed event by event ID.
   */
  getEvent(eventId: string): SorobanBridgeEvent | null {
    return this.events.get(eventId) ?? null;
  }

  /**
   * Check if an event is indexed.
   */
  hasEvent(eventId: string): boolean {
    return this.events.has(eventId);
  }

  /**
   * Remove an indexed event.
   */
  removeEvent(eventId: string): boolean {
    const removed = this.events.delete(eventId);
    if (removed) {
      const index = this.insertionOrder.indexOf(eventId);
      if (index !== -1) {
        this.insertionOrder.splice(index, 1);
      }
    }
    return removed;
  }

  /**
   * Clear all indexed events.
   */
  clear(): void {
    this.events.clear();
    this.insertionOrder.length = 0;
  }

  /**
   * Query indexed events with filters and pagination.
   */
  queryEvents(
    filter: SorobanBridgeEventFilter = {},
    options: SorobanBridgeEventQueryOptions = {},
  ): SorobanBridgeEventQueryResult {
    const entries = this.insertionOrder
      .map((eventId) => this.events.get(eventId))
      .filter((item): item is SorobanBridgeEvent => Boolean(item));

    const filtered = entries.filter((event) => this.matchesFilter(event, filter));

    const sorted = filtered.slice().sort((a, b) => {
      const order = options.order === 'asc' ? 1 : -1;
      const sortBy = options.sortBy ?? 'timestamp';
      if (sortBy === 'ledger') {
        return order * (a.ledger - b.ledger);
      }
      return order * (a.timestamp - b.timestamp);
    });

    const offset = Math.max(0, options.offset ?? 0);
    const limit = options.limit != null ? Math.max(0, options.limit) : sorted.length;
    const items = sorted.slice(offset, offset + limit);

    return {
      total: filtered.length,
      items,
    };
  }

  /**
   * Get events by contract ID.
   */
  getEventsByContract(contractId: string): SorobanBridgeEvent[] {
    return this.queryEvents({ contractId }).items;
  }

  /**
   * Get events by type.
   */
  getEventsByType(eventType: SorobanBridgeEventType): SorobanBridgeEvent[] {
    return this.queryEvents({ eventType }).items;
  }

  /**
   * Get events for a specific asset.
   */
  getEventsByAsset(asset: string): SorobanBridgeEvent[] {
    return this.queryEvents({ asset }).items;
  }

  /**
   * Get events in a ledger range.
   */
  getEventsByLedgerRange(minLedger: number, maxLedger: number): SorobanBridgeEvent[] {
    return this.queryEvents({ minTimestamp: minLedger, maxTimestamp: maxLedger }).items;
  }

  /**
   * Get total number of indexed events.
   */
  get size(): number {
    return this.events.size;
  }

  private generateEventId(event: Omit<SorobanBridgeEvent, 'eventId'>): string {
    return `${event.transactionHash}:${event.ledger}:${event.topics.join(':')}`;
  }

  private extractIndexedFields(event: Omit<SorobanBridgeEvent, 'eventId'>): SorobanBridgeEventIndexedFields {
    const topics = event.topics;
    const data = event.data;

    // Extract common indexed fields from topics and data
    // Topic 0 is typically the event type signature
    // Topics 1-3 are typically indexed parameters
    return {
      sourceChain: (data.sourceChain as string) ?? (topics[1] as string),
      destinationChain: (data.destinationChain as string) ?? (topics[2] as string),
      asset: (data.asset as string) ?? (topics[3] as string),
      amount: data.amount as string,
      from: data.from as string,
      to: data.to as string,
      routeId: data.routeId as string,
      destinationRecipient: data.destinationRecipient as string,
    };
  }

  private matchesFilter(event: SorobanBridgeEvent, filter: SorobanBridgeEventFilter): boolean {
    if (filter.eventId && event.eventId !== filter.eventId) {
      return false;
    }
    if (filter.contractId && event.contractId !== filter.contractId) {
      return false;
    }
    if (filter.eventType && event.eventType !== filter.eventType) {
      return false;
    }
    if (filter.transactionHash && event.transactionHash !== filter.transactionHash) {
      return false;
    }
    if (filter.ledger != null && event.ledger !== filter.ledger) {
      return false;
    }
    if (filter.minTimestamp != null && event.timestamp < filter.minTimestamp) {
      return false;
    }
    if (filter.maxTimestamp != null && event.timestamp > filter.maxTimestamp) {
      return false;
    }
    if (filter.asset && event.indexed.asset !== filter.asset) {
      return false;
    }
    if (filter.from && event.indexed.from !== filter.from) {
      return false;
    }
    if (filter.to && event.indexed.to !== filter.to) {
      return false;
    }
    if (filter.routeId && event.indexed.routeId !== filter.routeId) {
      return false;
    }
    if (filter.sourceChain && event.indexed.sourceChain !== filter.sourceChain) {
      return false;
    }
    if (filter.destinationChain && event.indexed.destinationChain !== filter.destinationChain) {
      return false;
    }
    return true;
  }
}

export const sorobanBridgeEventIndexer = new SorobanBridgeEventIndexer();