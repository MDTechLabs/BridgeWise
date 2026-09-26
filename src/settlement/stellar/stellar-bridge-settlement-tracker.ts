import { SorobanTransactionStatusTracker } from '../../tracking/stellar/soroban-transaction-status-tracker';

export type BridgeSettlementStatus =
  | 'initiated'
  | 'tracking_source'
  | 'tracking_destination'
  | 'completed'
  | 'failed';

export interface BridgeSettlementRecord {
  settlementId: string;
  sourceTransactionId?: string;
  destinationTransactionId?: string;
  sourceTxHash?: string;
  destinationTxHash?: string;
  status: BridgeSettlementStatus;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface BridgeSettlementTrackerConfig {
  requiredConfirmations?: number;
}

export class StellarBridgeSettlementTracker {
  private readonly tracker: SorobanTransactionStatusTracker;
  private readonly settlements = new Map<string, BridgeSettlementRecord>();

  constructor(config: BridgeSettlementTrackerConfig = {}) {
    this.tracker = new SorobanTransactionStatusTracker({
      requiredConfirmations: config.requiredConfirmations,
    });
  }

  trackSettlement(record: Omit<BridgeSettlementRecord, 'updatedAt'>): BridgeSettlementRecord {
    const tracked: BridgeSettlementRecord = {
      ...record,
      updatedAt: Date.now(),
    };

    this.settlements.set(record.settlementId, tracked);
    if (record.sourceTransactionId) {
      this.tracker.trackTransaction({
        transactionId: record.sourceTransactionId,
        txHash: record.sourceTxHash,
        status: 'submitted',
        type: 'bridge_deposit',
        sourceChain: 'stellar',
        destinationChain: 'stellar',
        asset: 'unknown',
        amount: '0',
        createdAt: tracked.updatedAt,
      });
    }

    return tracked;
  }

  updateSettlement(
    settlementId: string,
    changes: Partial<Omit<BridgeSettlementRecord, 'settlementId' | 'updatedAt'>>,
  ): BridgeSettlementRecord | null {
    const existing = this.settlements.get(settlementId);
    if (!existing) {
      return null;
    }

    const updated: BridgeSettlementRecord = {
      ...existing,
      ...changes,
      updatedAt: Date.now(),
    };

    this.settlements.set(settlementId, updated);
    return updated;
  }

  complete(settlementId: string): BridgeSettlementRecord | null {
    return this.updateSettlement(settlementId, { status: 'completed' });
  }

  fail(settlementId: string): BridgeSettlementRecord | null {
    return this.updateSettlement(settlementId, { status: 'failed' });
  }

  getSettlement(settlementId: string): BridgeSettlementRecord | null {
    return this.settlements.get(settlementId) ?? null;
  }

  listSettlements(): BridgeSettlementRecord[] {
    return [...this.settlements.values()];
  }
}

