import { createHash } from 'crypto';
import {
  CrossChainMessage,
  DuplicateCheckResult,
  DuplicateDetectorConfig,
  DuplicateDetectorStats,
} from '../types';

export const DEFAULT_DUPLICATE_DETECTOR_CONFIG: DuplicateDetectorConfig = {
  windowMs: 24 * 60 * 60 * 1000,
  maxEntries: 100_000,
};

interface SeenRecord {
  messageId: string;
  fingerprint: string;
  firstSeenAt: number;
  occurrences: number;
}

/**
 * Hex values (tx hashes, EVM addresses, payloads) are case-insensitive, so
 * they are lower-cased. Non-hex values such as Stellar StrKeys are
 * case-sensitive and left untouched.
 */
function normalize(value: string | number | undefined): string {
  if (value === undefined || value === null) return '';
  const str = String(value).trim();
  return /^0x[0-9a-f]*$/i.test(str) ? str.toLowerCase() : str;
}

/**
 * Content fingerprint of a message. It covers the fields that identify the
 * transfer on the source chain and what it asks the destination to do, and
 * ignores relayer-assigned or mutable fields (id, status, retryCount,
 * createdAt, lastError) and sourceBlockNumber, which can change when the
 * source transaction is re-included after a reorg.
 */
export function computeMessageFingerprint(message: CrossChainMessage): string {
  const canonical = JSON.stringify([
    normalize(message.sourceChainId),
    normalize(message.destinationChainId),
    normalize(message.sourceTxHash),
    normalize(message.sourceLogIndex),
    normalize(message.messageType),
    normalize(message.payload),
    normalize(message.sender),
    normalize(message.recipient),
    normalize(message.tokenAddress),
    normalize(message.amount),
  ]);
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Detects cross-chain messages the relayer has already accepted, either by
 * message ID or by content fingerprint (the same source event re-delivered
 * under a new ID, e.g. by an indexer re-scan). Records are kept for a
 * sliding window and bounded in number; state is in process memory only.
 */
export class DuplicateMessageDetector {
  private readonly config: DuplicateDetectorConfig;
  private readonly now: () => number;
  private readonly byFingerprint: Map<string, SeenRecord> = new Map();
  private readonly byMessageId: Map<string, SeenRecord> = new Map();
  private stats: DuplicateDetectorStats = { tracked: 0, checked: 0, duplicates: 0, conflicts: 0, evicted: 0 };

  constructor(config?: Partial<DuplicateDetectorConfig>, now: () => number = Date.now) {
    this.config = { ...DEFAULT_DUPLICATE_DETECTOR_CONFIG, ...config };
    if (!(this.config.windowMs > 0)) throw new Error('windowMs must be greater than 0');
    if (!(this.config.maxEntries > 0)) throw new Error('maxEntries must be greater than 0');
    this.now = now;
  }

  /** Checks a message without recording it. */
  check(message: CrossChainMessage): DuplicateCheckResult {
    this.evictExpired();
    return this.lookup(message, computeMessageFingerprint(message));
  }

  /**
   * Checks a message and records it if it is new. Duplicates are counted
   * against the original record; they never replace it.
   */
  register(message: CrossChainMessage): DuplicateCheckResult {
    this.evictExpired();
    this.stats.checked++;

    const fingerprint = computeMessageFingerprint(message);
    const result = this.lookup(message, fingerprint);

    if (result.duplicate) {
      this.stats.duplicates++;
      if (result.reason === 'message-id-conflict') this.stats.conflicts++;
      const original = this.byMessageId.get(result.originalMessageId as string);
      if (original) {
        original.occurrences++;
        result.occurrences = original.occurrences;
      }
      return result;
    }

    const record: SeenRecord = { messageId: message.id, fingerprint, firstSeenAt: this.now(), occurrences: 1 };
    this.byFingerprint.set(fingerprint, record);
    this.byMessageId.set(message.id, record);
    this.evictOverflow();
    this.stats.tracked = this.byMessageId.size;
    return result;
  }

  /** Forgets a message so it can be accepted again. */
  release(messageId: string): boolean {
    const record = this.byMessageId.get(messageId);
    if (!record) return false;
    this.remove(record);
    this.stats.tracked = this.byMessageId.size;
    return true;
  }

  has(messageId: string): boolean {
    this.evictExpired();
    return this.byMessageId.has(messageId);
  }

  getStats(): DuplicateDetectorStats {
    this.evictExpired();
    return { ...this.stats, tracked: this.byMessageId.size };
  }

  clear(): void {
    this.byFingerprint.clear();
    this.byMessageId.clear();
    this.stats = { tracked: 0, checked: 0, duplicates: 0, conflicts: 0, evicted: 0 };
  }

  private lookup(message: CrossChainMessage, fingerprint: string): DuplicateCheckResult {
    const sameId = this.byMessageId.get(message.id);
    if (sameId) {
      return {
        duplicate: true,
        reason: sameId.fingerprint === fingerprint ? 'message-id' : 'message-id-conflict',
        fingerprint,
        originalMessageId: sameId.messageId,
        firstSeenAt: sameId.firstSeenAt,
        occurrences: sameId.occurrences,
      };
    }

    const sameContent = this.byFingerprint.get(fingerprint);
    if (sameContent) {
      return {
        duplicate: true,
        reason: 'fingerprint',
        fingerprint,
        originalMessageId: sameContent.messageId,
        firstSeenAt: sameContent.firstSeenAt,
        occurrences: sameContent.occurrences,
      };
    }

    return { duplicate: false, fingerprint };
  }

  // Map iteration follows insertion order, which is firstSeenAt order.
  private evictExpired(): void {
    const cutoff = this.now() - this.config.windowMs;
    for (const record of this.byMessageId.values()) {
      if (record.firstSeenAt > cutoff) break;
      this.remove(record);
      this.stats.evicted++;
    }
  }

  private evictOverflow(): void {
    for (const record of this.byMessageId.values()) {
      if (this.byMessageId.size <= this.config.maxEntries) break;
      this.remove(record);
      this.stats.evicted++;
    }
  }

  private remove(record: SeenRecord): void {
    this.byMessageId.delete(record.messageId);
    if (this.byFingerprint.get(record.fingerprint) === record) {
      this.byFingerprint.delete(record.fingerprint);
    }
  }
}
