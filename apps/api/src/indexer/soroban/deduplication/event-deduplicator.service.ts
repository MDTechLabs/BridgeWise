import { Injectable, Logger } from '@nestjs/common';

export interface DedupableEvent {
  ledger: number;
  txHash: string;
  eventIndex: number;
}

export interface ProcessedRecord {
  id: string;
  firstSeenAt: string;
  /** Arbitrary metadata captured the first time the event was processed. */
  metadata?: Record<string, unknown>;
}

export interface DedupResult {
  id: string;
  isDuplicate: boolean;
  record: ProcessedRecord;
}

/** Deterministic identity for a Soroban bridge event. */
export function deriveDedupId(event: DedupableEvent): string {
  return `${event.ledger}:${event.txHash}:${event.eventIndex}`;
}

/**
 * Prevents duplicate processing of Soroban bridge events. Uses a deterministic
 * event id so retried RPC responses map to the same key, ignores events already
 * seen, and preserves the metadata captured on first processing.
 */
@Injectable()
export class EventDeduplicatorService {
  private readonly logger = new Logger(EventDeduplicatorService.name);
  private readonly processed = new Map<string, ProcessedRecord>();

  isProcessed(event: DedupableEvent): boolean {
    return this.processed.has(deriveDedupId(event));
  }

  /**
   * Register an event. If it's new it's recorded with the supplied metadata;
   * if it's a duplicate the ORIGINAL record (and metadata) is returned unchanged.
   */
  register(event: DedupableEvent, metadata?: Record<string, unknown>): DedupResult {
    const id = deriveDedupId(event);
    const existing = this.processed.get(id);
    if (existing) {
      return { id, isDuplicate: true, record: existing };
    }
    const record: ProcessedRecord = { id, firstSeenAt: new Date().toISOString(), metadata };
    this.processed.set(id, record);
    return { id, isDuplicate: false, record };
  }

  /**
   * Run `handler` only for events not seen before. Duplicates are ignored and
   * the handler result is undefined.
   */
  async process<T>(
    event: DedupableEvent,
    handler: () => Promise<T> | T,
    metadata?: Record<string, unknown>,
  ): Promise<{ processed: boolean; result?: T }> {
    const { isDuplicate } = this.register(event, metadata);
    if (isDuplicate) {
      this.logger.debug(`Ignoring duplicate event ${deriveDedupId(event)}.`);
      return { processed: false };
    }
    return { processed: true, result: await handler() };
  }

  size(): number {
    return this.processed.size;
  }
}
