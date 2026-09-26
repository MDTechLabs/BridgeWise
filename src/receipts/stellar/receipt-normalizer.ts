import { xdr, scValToVal } from 'stellar-sdk';

export interface CanonicalEvent {
  contractId?: string;
  topics: string[];
  data: string;
}

export interface CanonicalTransfer {
  from: string;
  to: string;
  amount: string;
  asset: string; // Asset code or contract ID
}

export interface CanonicalReceipt {
  transactionHash: string;
  ledger: number;
  success: boolean;
  feePaid: string;
  sourceAccount: string;
  events: CanonicalEvent[];
  transfers: CanonicalTransfer[];
  rawMetadata?: any;
}

export class SorobanReceiptNormalizer {
  /**
   * Normalizes classic Stellar transaction/operations into a CanonicalReceipt.
   */
  normalizeHorizonTransaction(tx: any, operations: any[]): CanonicalReceipt {
    const transfers: CanonicalTransfer[] = [];

    for (const op of operations) {
      if (op.type === 'payment') {
        transfers.push({
          from: op.from || tx.source_account,
          to: op.to,
          amount: op.amount,
          asset: op.asset_type === 'native' ? 'XLM' : op.asset_code,
        });
      } else if (op.type === 'path_payment_strict_receive' || op.type === 'path_payment_strict_send') {
        transfers.push({
          from: op.from || tx.source_account,
          to: op.to,
          amount: op.amount,
          asset: op.asset_type === 'native' ? 'XLM' : op.asset_code,
        });
      }
    }

    return {
      transactionHash: tx.hash || tx.id,
      ledger: parseInt(tx.ledger || tx.ledger_sequence || '0', 10),
      success: tx.successful !== undefined ? tx.successful : true,
      feePaid: tx.fee_charged || tx.fee || '0',
      sourceAccount: tx.source_account || tx.account || '',
      events: [],
      transfers,
      rawMetadata: { tx, operations },
    };
  }

  /**
   * Normalizes a Soroban transaction (usually returned via getTransaction RPC method) into a CanonicalReceipt.
   */
  normalizeSorobanTransaction(txResult: any): CanonicalReceipt {
    const events: CanonicalEvent[] = [];
    const transfers: CanonicalTransfer[] = [];

    // Parse XDR metadata events if present
    if (txResult.resultMetaXdr) {
      try {
        const meta = xdr.TransactionMeta.fromXDR(txResult.resultMetaXdr, 'base64');
        let xdrEvents: xdr.ContractEvent[] = [];

        if (meta.switch().value === 3) {
          xdrEvents = meta.v3().sorobanMeta()?.events() || [];
        } else if (meta.switch().value === 2) {
          xdrEvents = meta.v2().sorobanMeta()?.events() || [];
        }

        for (const e of xdrEvents) {
          const contractId = e.contractId()?.toString('hex');
          const topicsSc = e.body().v0().topics();
          const dataSc = e.body().v0().data();

          const topics = topicsSc.map((t) => {
            try {
              const val = scValToVal(t);
              return typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val);
            } catch {
              return t.toXDR('base64');
            }
          });

          let dataStr = '';
          try {
            const val = scValToVal(dataSc);
            dataStr = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val);
          } catch {
            dataStr = dataSc.toXDR('base64');
          }

          events.push({ contractId, topics, data: dataStr });

          // Map standard Transfer event signature
          // Topic 0: "transfer"
          // Topic 1: From Address
          // Topic 2: To Address
          // Data: Amount
          if (topics[0] === 'transfer' && topics.length >= 3) {
            transfers.push({
              from: topics[1],
              to: topics[2],
              amount: dataStr,
              asset: contractId || 'unknown',
            });
          }
        }
      } catch (xdrError) {
        // Log XDR decode failure and fallback to JSON event structures
        this.fallbackJsonEvents(txResult, events, transfers);
      }
    } else {
      this.fallbackJsonEvents(txResult, events, transfers);
    }

    return {
      transactionHash: txResult.hash || txResult.txHash || '',
      ledger: parseInt(txResult.ledger || txResult.ledgerSequence || '0', 10),
      success: txResult.status === 'SUCCESS' || txResult.successful === true,
      feePaid: txResult.fee || txResult.feeCharged || '0',
      sourceAccount: txResult.sourceAccount || '',
      events,
      transfers,
      rawMetadata: txResult,
    };
  }

  private fallbackJsonEvents(txResult: any, events: CanonicalEvent[], transfers: CanonicalTransfer[]): void {
    if (txResult.events && Array.isArray(txResult.events)) {
      for (const e of txResult.events) {
        const topics = Array.isArray(e.topics) ? e.topics : [];
        const data = String(e.data || e.value || '');
        const contractId = e.contractId || '';

        events.push({
          contractId,
          topics,
          data,
        });

        if (topics[0] === 'transfer' && topics.length >= 3) {
          transfers.push({
            from: topics[1],
            to: topics[2],
            amount: data,
            asset: contractId || 'unknown',
          });
        }
      }
    }
  }
}
