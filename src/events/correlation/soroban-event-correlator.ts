import type { BridgeWiseTransferEvent } from '../types/soroban-contract-event.types';

export interface SorobanEventCorrelation {
  eventId: string;
  transferId: string;
  transactionHash: string;
  correlatedAt: number;
}

export interface EventCorrelationConfig {
  now?: () => number;
}

export class SorobanEventCorrelator {
  private readonly correlations = new Map<string, SorobanEventCorrelation>();
  private readonly now: () => number;

  constructor(config: EventCorrelationConfig = {}) {
    this.now = config.now ?? Date.now;
  }

  correlate(
    event: BridgeWiseTransferEvent,
    transferId: string,
  ): SorobanEventCorrelation {
    const correlation: SorobanEventCorrelation = {
      eventId: event.eventId,
      transferId,
      transactionHash: event.transactionHash,
      correlatedAt: this.now(),
    };
    this.correlations.set(event.eventId, correlation);
    return correlation;
  }

  get(eventId: string): SorobanEventCorrelation | null {
    return this.correlations.get(eventId) ?? null;
  }
}
