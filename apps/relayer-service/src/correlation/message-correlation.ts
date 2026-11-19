import { createHash } from 'crypto';
import { CrossChainMessage } from '../types';

/**
 * Deterministic correlation ID linking a source-chain event to its
 * destination-chain delivery. It is derived only from immutable source-event
 * fields (chains, source tx hash, log index), never from relayer-assigned
 * IDs, so every component derives the same ID independently and a re-scan or
 * retry cannot fork the trail.
 */
export function computeCorrelationId(
  message: Pick<CrossChainMessage, 'sourceChainId' | 'destinationChainId' | 'sourceTxHash' | 'sourceLogIndex'>,
): string {
  const canonical = JSON.stringify([
    String(message.sourceChainId).trim(),
    String(message.destinationChainId).trim(),
    String(message.sourceTxHash).trim().toLowerCase(),
    String(message.sourceLogIndex ?? ''),
  ]);
  return 'corr_' + createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

export interface CorrelationRecord {
  correlationId: string;
  sourceMessageId: string;
  destinationTxHash?: string;
}

/**
 * In-memory index tying a source message to its destination delivery.
 * Linking a destination is idempotent for the same tx hash and rejects a
 * different one, so a correlated message cannot be delivered twice.
 */
export class MessageCorrelationIndex {
  private readonly records = new Map<string, CorrelationRecord>();

  linkSource(message: CrossChainMessage): CorrelationRecord {
    const correlationId = computeCorrelationId(message);
    const existing = this.records.get(correlationId);
    if (existing) return existing;
    const record: CorrelationRecord = { correlationId, sourceMessageId: message.id };
    this.records.set(correlationId, record);
    return record;
  }

  linkDestination(correlationId: string, destinationTxHash: string): CorrelationRecord {
    const record = this.records.get(correlationId);
    if (!record) throw new Error(`Unknown correlation id: ${correlationId}`);
    const hash = destinationTxHash.trim().toLowerCase();
    if (!hash) throw new Error('destinationTxHash is required');
    if (record.destinationTxHash && record.destinationTxHash !== hash) {
      throw new Error(`Correlation ${correlationId} already delivered by ${record.destinationTxHash}`);
    }
    record.destinationTxHash = hash;
    return record;
  }

  get(correlationId: string): CorrelationRecord | undefined {
    return this.records.get(correlationId);
  }
}
