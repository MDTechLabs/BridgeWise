/**
 * libs/indexer/src/finality-tracker.ts
 *
 * Finality Confirmation Engine
 * -----------------------------
 * Quarantines cross-chain transfer messages observed on a source chain and
 * withholds them from relay until their source block has accumulated enough
 * confirmations (per-chain finality depth) to be considered safe against
 * re-orgs.
 *
 * Designed to be driven by:
 *   - `ReorgDetector` ('block' events advance finality; 'reorg' events purge
 *     or requeue quarantined messages whose source block was invalidated).
 *   - Your own head-tracking loop (calling `advanceHead` with the latest
 *     confirmed chain height on each poll/subscription tick).
 *
 * Data structures:
 *   - `quarantine`: Map<messageId, QuarantinedMessage> — O(1) lookup/removal.
 *   - `byBlock`: Map<blockHeight, Set<messageId>> — index so that a single
 *     `advanceHead` or `handleReorg` call can efficiently find all messages
 *     anchored to affected heights without scanning the whole quarantine.
 */

import { EventEmitter } from 'events';
import type { ReorgEvent } from './reorg-detector';

/** Identifies a chain and the finality depth (in blocks) required for it. */
export interface FinalityConfig {
  chainId: number;
  /** Number of confirmations required before a message is considered final. */
  requiredConfirmations: number;
  /** Human-readable label for logs/metrics, e.g. "Ethereum", "Polygon". */
  label?: string;
}

/** A cross-chain transfer message awaiting finality on its source chain. */
export interface CrossChainMessage {
  messageId: string;
  sourceChainId: number;
  sourceBlockHeight: number;
  sourceBlockHash: string;
  /** Arbitrary payload — token transfer details, destination chain, etc. */
  payload: unknown;
}

export type QuarantineStatus = 'pending' | 'released' | 'rolled_back';

export interface QuarantinedMessage {
  message: CrossChainMessage;
  status: QuarantineStatus;
  quarantinedAt: number;
  releasedAt?: number;
  rolledBackAt?: number;
  /** Confirmations observed as of the last `advanceHead` call. */
  confirmations: number;
}

export interface ReleaseEvent {
  message: CrossChainMessage;
  confirmations: number;
  releasedAt: number;
}

export interface RollbackEvent {
  message: CrossChainMessage;
  reason: 'reorg' | 'manual';
  rolledBackAt: number;
}

export class FinalityConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FinalityConfigError';
  }
}

/**
 * Typed events emitted by FinalityTracker:
 *   'quarantined' -> (msg: QuarantinedMessage) => void
 *   'released'    -> (event: ReleaseEvent) => void
 *   'rolledBack'  -> (event: RollbackEvent) => void
 */
/** Warning payload emitted when advanceHead sees an out-of-order head height. */
export interface FinalityWarning {
  chainId: number;
  message: string;
}

/**
 * Declaration merging: gives `.on()` / `.once()` / `.emit()` typed event
 * payloads. See the matching pattern on `ReorgDetector` in ./reorg-detector.ts
 * for why this is necessary.
 */
export declare interface FinalityTracker {
  on(event: 'quarantined', listener: (payload: QuarantinedMessage) => void): this;
  on(event: 'released', listener: (payload: ReleaseEvent) => void): this;
  on(event: 'rolledBack', listener: (payload: RollbackEvent) => void): this;
  on(event: 'warning', listener: (payload: FinalityWarning) => void): this;
  once(event: 'quarantined', listener: (payload: QuarantinedMessage) => void): this;
  once(event: 'released', listener: (payload: ReleaseEvent) => void): this;
  once(event: 'rolledBack', listener: (payload: RollbackEvent) => void): this;
  once(event: 'warning', listener: (payload: FinalityWarning) => void): this;
  emit(event: 'quarantined', payload: QuarantinedMessage): boolean;
  emit(event: 'released', payload: ReleaseEvent): boolean;
  emit(event: 'rolledBack', payload: RollbackEvent): boolean;
  emit(event: 'warning', payload: FinalityWarning): boolean;
}

export class FinalityTracker extends EventEmitter {
  private readonly configs = new Map<number, FinalityConfig>();
  private readonly quarantine = new Map<string, QuarantinedMessage>();
  /** Index: source height -> set of message ids anchored there. Per chain. */
  private readonly byChainAndBlock = new Map<number, Map<number, Set<string>>>();
  /** Latest confirmed head height we've observed per chain. */
  private readonly heads = new Map<number, number>();

  constructor(configs: FinalityConfig[]) {
    super();
    for (const cfg of configs) {
      if (cfg.requiredConfirmations <= 0) {
        throw new FinalityConfigError(
          `requiredConfirmations for chain ${cfg.chainId} must be a positive integer`,
        );
      }
      this.configs.set(cfg.chainId, cfg);
    }
  }

  /** Register or update finality requirements for a chain at runtime. */
  public setChainConfig(config: FinalityConfig): void {
    if (config.requiredConfirmations <= 0) {
      throw new FinalityConfigError(
        `requiredConfirmations for chain ${config.chainId} must be a positive integer`,
      );
    }
    this.configs.set(config.chainId, config);
  }

  /**
   * Add an incoming cross-chain message to quarantine. It will not be
   * released until `advanceHead` reports enough confirmations for its
   * source chain/block.
   */
  public quarantineMessage(message: CrossChainMessage): QuarantinedMessage {
    if (!this.configs.has(message.sourceChainId)) {
      throw new FinalityConfigError(
        `No finality config registered for chainId ${message.sourceChainId}`,
      );
    }
    if (this.quarantine.has(message.messageId)) {
      // Idempotent: return the existing entry rather than duplicating state.
      return this.quarantine.get(message.messageId)!;
    }

    const currentHead = this.heads.get(message.sourceChainId);
    const confirmations =
      currentHead !== undefined
        ? Math.max(0, currentHead - message.sourceBlockHeight + 1)
        : 0;

    const entry: QuarantinedMessage = {
      message,
      status: 'pending',
      quarantinedAt: Date.now(),
      confirmations,
    };

    this.quarantine.set(message.messageId, entry);
    this.indexMessage(message);
    this.emit('quarantined', entry);

    // In case the message arrived already-final (e.g. backfill scenarios),
    // check immediately.
    this.tryRelease(entry);

    return entry;
  }

  /**
   * Report the latest confirmed chain head for a given chain. Recomputes
   * confirmation depth for all pending messages on that chain and releases
   * any that have crossed the required threshold.
   */
  public advanceHead(chainId: number, headHeight: number): void {
    const cfg = this.configs.get(chainId);
    if (!cfg) {
      throw new FinalityConfigError(`No finality config registered for chainId ${chainId}`);
    }

    const previousHead = this.heads.get(chainId) ?? -1;
    if (headHeight < previousHead) {
      // Head moving backwards without a reorg event is unexpected — ignore
      // rather than corrupt confirmation counts, but surface it for visibility.
      this.emit('warning', {
        chainId,
        message: `advanceHead received headHeight ${headHeight} lower than previous ${previousHead}; ignoring`,
      });
      return;
    }
    this.heads.set(chainId, headHeight);

    const blockIndex = this.byChainAndBlock.get(chainId);
    if (!blockIndex) return;

    for (const [height, ids] of blockIndex) {
      const confirmations = headHeight - height + 1;
      for (const id of ids) {
        const entry = this.quarantine.get(id);
        if (!entry || entry.status !== 'pending') continue;
        entry.confirmations = confirmations;
        if (confirmations >= cfg.requiredConfirmations) {
          this.release(entry);
        }
      }
    }
  }

  /**
   * Wire this up to `ReorgDetector`'s 'reorg' event. Any quarantined message
   * anchored to an invalidated height is rolled back (never released) and
   * removed from quarantine so it can be safely re-observed if/when the
   * message reappears on the new canonical chain.
   */
  public handleReorg(event: ReorgEvent): void {
    const blockIndex = this.byChainAndBlock.get(event.chainId);
    if (!blockIndex) return;

    for (const height of event.invalidatedHeights) {
      const ids = blockIndex.get(height);
      if (!ids) continue;
      for (const id of [...ids]) {
        const entry = this.quarantine.get(id);
        if (!entry) continue;
        this.rollback(entry, 'reorg');
      }
      blockIndex.delete(height);
    }
  }

  /** Look up the current quarantine record for a message, if any. */
  public getStatus(messageId: string): QuarantinedMessage | undefined {
    return this.quarantine.get(messageId);
  }

  /** All messages currently awaiting finality (not yet released or rolled back). */
  public getPendingMessages(chainId?: number): QuarantinedMessage[] {
    const out: QuarantinedMessage[] = [];
    for (const entry of this.quarantine.values()) {
      if (entry.status !== 'pending') continue;
      if (chainId !== undefined && entry.message.sourceChainId !== chainId) continue;
      out.push(entry);
    }
    return out;
  }

  /** Number of messages currently held in quarantine (any status), useful for metrics. */
  public get size(): number {
    return this.quarantine.size;
  }

  // ---- internal helpers -------------------------------------------------

  private indexMessage(message: CrossChainMessage): void {
    let blockIndex = this.byChainAndBlock.get(message.sourceChainId);
    if (!blockIndex) {
      blockIndex = new Map();
      this.byChainAndBlock.set(message.sourceChainId, blockIndex);
    }
    let ids = blockIndex.get(message.sourceBlockHeight);
    if (!ids) {
      ids = new Set();
      blockIndex.set(message.sourceBlockHeight, ids);
    }
    ids.add(message.messageId);
  }

  private deindexMessage(message: CrossChainMessage): void {
    const blockIndex = this.byChainAndBlock.get(message.sourceChainId);
    const ids = blockIndex?.get(message.sourceBlockHeight);
    ids?.delete(message.messageId);
    if (ids && ids.size === 0) {
      blockIndex!.delete(message.sourceBlockHeight);
    }
  }

  private tryRelease(entry: QuarantinedMessage): void {
    const cfg = this.configs.get(entry.message.sourceChainId);
    if (!cfg) return;
    if (entry.status === 'pending' && entry.confirmations >= cfg.requiredConfirmations) {
      this.release(entry);
    }
  }

  private release(entry: QuarantinedMessage): void {
    entry.status = 'released';
    entry.releasedAt = Date.now();
    this.quarantine.delete(entry.message.messageId);
    this.deindexMessage(entry.message);

    const event: ReleaseEvent = {
      message: entry.message,
      confirmations: entry.confirmations,
      releasedAt: entry.releasedAt,
    };
    this.emit('released', event);
  }

  private rollback(entry: QuarantinedMessage, reason: 'reorg' | 'manual'): void {
    entry.status = 'rolled_back';
    entry.rolledBackAt = Date.now();
    this.quarantine.delete(entry.message.messageId);
    this.deindexMessage(entry.message);

    const event: RollbackEvent = {
      message: entry.message,
      reason,
      rolledBackAt: entry.rolledBackAt,
    };
    this.emit('rolledBack', event);
  }
}

/** Convenience factory for the common chains referenced in the issue. */
export function defaultFinalityConfigs(): FinalityConfig[] {
  return [
    { chainId: 1, requiredConfirmations: 64, label: 'Ethereum' },
    { chainId: 137, requiredConfirmations: 32, label: 'Polygon' },
  ];
}