import { Injectable, Logger } from '@nestjs/common';

export interface TransferRequest {
  transferId: string;
  /** The value used to correlate on-chain events back to this request. */
  correlationKey: string;
}

export interface SorobanBridgeEvent {
  txHash: string;
  eventIndex: number;
  correlationKey: string;
  type: string;
  payload?: unknown;
}

export interface CorrelatedEvent extends SorobanBridgeEvent {
  transferId: string;
}

/**
 * Correlates Soroban contract events with BridgeWise transfer requests. A single
 * transfer can emit multiple events; all events sharing the transfer's
 * correlation key are grouped under it, and events with no matching transfer are
 * tracked separately.
 */
@Injectable()
export class TransferEventCorrelatorService {
  private readonly logger = new Logger(TransferEventCorrelatorService.name);

  private readonly transfersByKey = new Map<string, TransferRequest>();
  private readonly eventsByTransfer = new Map<string, CorrelatedEvent[]>();
  private readonly unmatched: SorobanBridgeEvent[] = [];

  registerTransfer(request: TransferRequest): void {
    this.transfersByKey.set(request.correlationKey, request);
    if (!this.eventsByTransfer.has(request.transferId)) {
      this.eventsByTransfer.set(request.transferId, []);
    }
  }

  /** Correlate a single event; returns the correlated event or null if unmatched. */
  correlate(event: SorobanBridgeEvent): CorrelatedEvent | null {
    const transfer = this.transfersByKey.get(event.correlationKey);
    if (!transfer) {
      this.unmatched.push(event);
      this.logger.debug(`Unmatched event ${event.txHash}:${event.eventIndex} (key ${event.correlationKey}).`);
      return null;
    }
    const correlated: CorrelatedEvent = { ...event, transferId: transfer.transferId };
    const list = this.eventsByTransfer.get(transfer.transferId) ?? [];
    // Guard against correlating the same on-chain event twice.
    if (!list.some((e) => e.txHash === event.txHash && e.eventIndex === event.eventIndex)) {
      list.push(correlated);
    }
    this.eventsByTransfer.set(transfer.transferId, list);
    return correlated;
  }

  correlateBatch(events: SorobanBridgeEvent[]): CorrelatedEvent[] {
    return events.map((e) => this.correlate(e)).filter((e): e is CorrelatedEvent => e !== null);
  }

  getEventsForTransfer(transferId: string): CorrelatedEvent[] {
    return this.eventsByTransfer.get(transferId) ?? [];
  }

  getUnmatchedEvents(): SorobanBridgeEvent[] {
    return [...this.unmatched];
  }

  /** Re-attempt correlation of previously-unmatched events (e.g. after a late transfer registration). */
  reconcileUnmatched(): CorrelatedEvent[] {
    const stillUnmatched: SorobanBridgeEvent[] = [];
    const correlated: CorrelatedEvent[] = [];
    for (const event of this.unmatched) {
      const result = this.tryCorrelateWithoutTracking(event);
      if (result) correlated.push(result);
      else stillUnmatched.push(event);
    }
    this.unmatched.length = 0;
    this.unmatched.push(...stillUnmatched);
    return correlated;
  }

  private tryCorrelateWithoutTracking(event: SorobanBridgeEvent): CorrelatedEvent | null {
    const transfer = this.transfersByKey.get(event.correlationKey);
    if (!transfer) return null;
    const correlated: CorrelatedEvent = { ...event, transferId: transfer.transferId };
    const list = this.eventsByTransfer.get(transfer.transferId) ?? [];
    if (!list.some((e) => e.txHash === event.txHash && e.eventIndex === event.eventIndex)) {
      list.push(correlated);
    }
    this.eventsByTransfer.set(transfer.transferId, list);
    return correlated;
  }
}
