/**
 * libs/indexer/src/reorg-detector.ts
 *
 * Chain Re-Org Detector
 * ---------------------
 * Maintains a bounded, in-memory history of indexed block headers (hash + parentHash)
 * for a given chain, and detects two classes of anomalies as new blocks arrive:
 *
 *   1. CONTINUITY BREAK — the incoming block's parentHash does not match the hash
 *      we have on file for the previous height (a gap, skipped block, or the node
 *      handed us an inconsistent view of the chain).
 *
 *   2. HASH MUTATION (re-org) — we already have a block recorded at this height,
 *      and the incoming block's hash differs from what we stored. This means the
 *      canonical chain changed underneath us and everything from the divergence
 *      point forward must be treated as rolled back.
 *
 * On detection, the detector walks back through its buffer to find the last common
 * ancestor (the fork point) and emits a `reorg` event describing exactly which
 * heights/hashes are now invalid, so downstream consumers (event indexers, the
 * finality tracker, relayers, etc.) can roll back unfinalized state safely.
 */

import { EventEmitter } from 'events';

/** Minimal block header shape the detector needs. Extend as required. */
export interface BlockHeader {
  chainId: number;
  height: number;
  hash: string;
  parentHash: string;
  timestamp: number;
}

/** Emitted when a re-org is detected. */
export interface ReorgEvent {
  chainId: number;
  /** Height of the deepest block still common to old and new chains. */
  commonAncestorHeight: number;
  /** Hash of the common ancestor block. */
  commonAncestorHash: string;
  /** Heights that must be rolled back (old, now-invalid chain), highest first. */
  invalidatedHeights: number[];
  /** The blocks that were removed from local history because of the re-org. */
  invalidatedBlocks: BlockHeader[];
  /** The new block that triggered detection. */
  triggeringBlock: BlockHeader;
  detectedAt: number;
}

/** Emitted when an incoming block cannot be reconciled with local history at all. */
export interface ContinuityBreakEvent {
  chainId: number;
  expectedParentHash: string;
  receivedParentHash: string;
  atHeight: number;
  triggeringBlock: BlockHeader;
  detectedAt: number;
}

export interface ReorgDetectorOptions {
  chainId: number;
  /** How many blocks of history to retain. Must exceed your deepest expected re-org. */
  historyDepth: number;
  /**
   * If true, a continuity break (missing parent, unknown parent hash) that cannot
   * be resolved within the buffer is treated as a re-org against the entire buffer
   * rather than throwing. Defaults to false (strict mode throws).
   */
  tolerateUnknownParent?: boolean;
}

/**
 * Fixed-capacity circular buffer keyed by height, backed by a Map for O(1)
 * lookups by height and by hash. Oldest entries are evicted once `capacity`
 * is exceeded.
 */
class BlockHistoryBuffer {
  private readonly capacity: number;
  private readonly byHeight = new Map<number, BlockHeader>();
  private readonly byHash = new Map<string, BlockHeader>();
  /** Insertion order of heights, used to evict the oldest when over capacity. */
  private order: number[] = [];

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new RangeError('historyDepth must be a positive integer');
    }
    this.capacity = capacity;
  }

  get size(): number {
    return this.byHeight.size;
  }

  getByHeight(height: number): BlockHeader | undefined {
    return this.byHeight.get(height);
  }

  getByHash(hash: string): BlockHeader | undefined {
    return this.byHash.get(hash);
  }

  get highestHeight(): number | undefined {
    return this.order.length ? this.order[this.order.length - 1] : undefined;
  }

  /** Insert or overwrite the block recorded at this height. */
  set(block: BlockHeader): void {
    if (!this.byHeight.has(block.height)) {
      this.order.push(block.height);
    } else {
      const existing = this.byHeight.get(block.height);
      if (existing) this.byHash.delete(existing.hash);
    }
    this.byHeight.set(block.height, block);
    this.byHash.set(block.hash, block);
    this.evictIfNeeded();
  }

  /** Remove every recorded block at or above the given height (used on rollback). */
  invalidateFrom(height: number): BlockHeader[] {
    const removed: BlockHeader[] = [];
    for (const h of [...this.byHeight.keys()]) {
      if (h >= height) {
        const block = this.byHeight.get(h);
        if (block) {
          removed.push(block);
          this.byHeight.delete(h);
          this.byHash.delete(block.hash);
        }
      }
    }
    this.order = this.order.filter((h) => h < height);
    return removed.sort((a, b) => b.height - a.height);
  }

  private evictIfNeeded(): void {
    while (this.order.length > this.capacity) {
      const oldest = this.order.shift();
      if (oldest === undefined) break;
      const block = this.byHeight.get(oldest);
      if (block) {
        this.byHeight.delete(oldest);
        this.byHash.delete(block.hash);
      }
    }
  }
}

export class ChainReorgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChainReorgError';
  }
}

/**
 * Typed event names emitted by ReorgDetector.
 *   'reorg'            -> (event: ReorgEvent) => void
 *   'continuityBreak'  -> (event: ContinuityBreakEvent) => void
 *   'block'            -> (block: BlockHeader) => void   // accepted, no anomaly
 */
/**
 * Declaration merging: gives `.on()` / `.once()` / `.emit()` typed event
 * payloads instead of the default EventEmitter signature of
 * `(event: string | symbol, listener: (...args: any[]) => void)`.
 * This is what makes `detector.on('reorg', (event) => ...)` infer
 * `event: ReorgEvent` automatically, with no `any` and no extra casts.
 */
export declare interface ReorgDetector {
  on(event: 'reorg', listener: (payload: ReorgEvent) => void): this;
  on(event: 'continuityBreak', listener: (payload: ContinuityBreakEvent) => void): this;
  on(event: 'block', listener: (payload: BlockHeader) => void): this;
  once(event: 'reorg', listener: (payload: ReorgEvent) => void): this;
  once(event: 'continuityBreak', listener: (payload: ContinuityBreakEvent) => void): this;
  once(event: 'block', listener: (payload: BlockHeader) => void): this;
  emit(event: 'reorg', payload: ReorgEvent): boolean;
  emit(event: 'continuityBreak', payload: ContinuityBreakEvent): boolean;
  emit(event: 'block', payload: BlockHeader): boolean;
}

export class ReorgDetector extends EventEmitter {
  private readonly chainId: number;
  private readonly history: BlockHistoryBuffer;
  private readonly tolerateUnknownParent: boolean;

  constructor(options: ReorgDetectorOptions) {
    super();
    this.chainId = options.chainId;
    this.history = new BlockHistoryBuffer(options.historyDepth);
    this.tolerateUnknownParent = options.tolerateUnknownParent ?? false;
  }

  /** Current number of blocks retained in the local history buffer. */
  get bufferedBlockCount(): number {
    return this.history.size;
  }

  get highestIndexedHeight(): number | undefined {
    return this.history.highestHeight;
  }

  /**
   * Feed a newly observed block into the detector. Call this for every block
   * your indexer processes, in height order, as soon as it's fetched from the
   * source chain (before you commit its logs as final).
   */
  public processBlock(block: BlockHeader): void {
    if (block.chainId !== this.chainId) {
      throw new ChainReorgError(
        `Block chainId ${block.chainId} does not match detector chainId ${this.chainId}`,
      );
    }

    const existingAtHeight = this.history.getByHeight(block.height);

    // Case 1: We already recorded a different block at this height -> re-org.
    if (existingAtHeight && existingAtHeight.hash !== block.hash) {
      this.handleReorg(block);
      return;
    }

    // Case 2: Same block re-delivered (idempotent no-op).
    if (existingAtHeight && existingAtHeight.hash === block.hash) {
      return;
    }

    // Case 3: New height. Verify continuity against our recorded parent.
    const expectedParent = this.history.getByHeight(block.height - 1);

    if (expectedParent) {
      if (expectedParent.hash !== block.parentHash) {
        // The parent we know about doesn't match what this block claims.
        // This is really a re-org rooted at (height - 1) or earlier.
        this.handleReorg(block);
        return;
      }
    } else if (this.history.size > 0) {
      // We have history but not the immediate parent — either a gap (skipped
      // heights) or we're catching up after a restart. Try to locate the
      // parent hash anywhere in the buffer to confirm we're still on a known
      // chain; if we can't, treat it as a continuity break.
      const parentElsewhere = this.history.getByHash(block.parentHash);
      if (!parentElsewhere) {
        this.emitContinuityBreak(block);
        if (!this.tolerateUnknownParent) {
          throw new ChainReorgError(
            `Continuity break at height ${block.height} on chain ${this.chainId}: ` +
              `parentHash ${block.parentHash} not found in local history`,
          );
        }
      }
    }

    this.history.set(block);
    this.emit('block', block);
  }

  /**
   * Walk back from the incoming block to find the last common ancestor still
   * present in our buffer, roll back everything above it, record the new
   * block, and emit a `reorg` event with full rollback details.
   */
  private handleReorg(triggeringBlock: BlockHeader): void {
    let ancestorHeight = triggeringBlock.height - 1;
    let ancestorHash = triggeringBlock.parentHash;

    // Walk down until we find a height where our recorded hash matches the
    // hash the new fork claims as its ancestor, or we run out of buffer.
    while (ancestorHeight >= 0) {
      const candidate = this.history.getByHeight(ancestorHeight);
      if (!candidate) {
        // We've walked past the edge of our retained history — the re-org is
        // deeper than `historyDepth`. We can't safely determine the true fork
        // point; roll back everything we have and surface that fact.
        break;
      }
      if (candidate.hash === ancestorHash) {
        break; // found common ancestor
      }
      // Move further back: the new fork's ancestor at this depth is whatever
      // its own chain claims — but we only have the triggering block itself
      // client-side, so once the immediate parent doesn't match, the safest
      // assumption is to invalidate down to the deepest point we can still
      // verify against stored parent hashes.
      ancestorHeight -= 1;
      const deeper = this.history.getByHeight(ancestorHeight);
      ancestorHash = deeper ? deeper.hash : ancestorHash;
    }

    const rollbackFrom = ancestorHeight + 1;
    const invalidatedBlocks = this.history.invalidateFrom(rollbackFrom);

    if (invalidatedBlocks.length === 0 && triggeringBlock.height <= (this.history.highestHeight ?? -1)) {
      // Defensive fallback: nothing matched invalidateFrom's filter (shouldn't
      // normally happen) — invalidate at minimum the triggering height.
      invalidatedBlocks.push(...this.history.invalidateFrom(triggeringBlock.height));
    }

    const commonAncestor = this.history.getByHeight(ancestorHeight);

    const event: ReorgEvent = {
      chainId: this.chainId,
      commonAncestorHeight: ancestorHeight,
      commonAncestorHash: commonAncestor?.hash ?? ancestorHash,
      invalidatedHeights: invalidatedBlocks.map((b) => b.height),
      invalidatedBlocks,
      triggeringBlock,
      detectedAt: Date.now(),
    };

    // Record the new canonical block now that stale entries are gone.
    this.history.set(triggeringBlock);

    this.emit('reorg', event);
  }

  private emitContinuityBreak(block: BlockHeader): void {
    const expectedParent = this.history.getByHeight(block.height - 1);
    const event: ContinuityBreakEvent = {
      chainId: this.chainId,
      expectedParentHash: expectedParent?.hash ?? '',
      receivedParentHash: block.parentHash,
      atHeight: block.height,
      triggeringBlock: block,
      detectedAt: Date.now(),
    };
    this.emit('continuityBreak', event);
  }

  /** Snapshot of currently buffered blocks, sorted ascending by height. Useful for tests/debugging. */
  public snapshot(): BlockHeader[] {
    const out: BlockHeader[] = [];
    for (let h = this.history.highestHeight ?? -1; h >= 0; h--) {
      const b = this.history.getByHeight(h);
      if (b) out.unshift(b);
    }
    return out;
  }
}