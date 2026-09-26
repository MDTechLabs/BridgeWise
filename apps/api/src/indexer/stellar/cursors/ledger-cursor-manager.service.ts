import { Injectable, Logger } from '@nestjs/common';

export interface LedgerCursor {
  name: string;
  lastLedger: number;
  updatedAt: string;
}

/** Pluggable persistence for cursors (defaults to in-memory). */
export interface CursorStore {
  get(name: string): LedgerCursor | undefined;
  set(cursor: LedgerCursor): void;
}

class InMemoryCursorStore implements CursorStore {
  private readonly map = new Map<string, LedgerCursor>();
  get(name: string): LedgerCursor | undefined {
    return this.map.get(name);
  }
  set(cursor: LedgerCursor): void {
    this.map.set(cursor.name, cursor);
  }
}

export class CursorProgressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CursorProgressionError';
  }
}

/**
 * Tracks ledger synchronization cursors so indexing can resume after
 * interruptions. Enforces forward-only progression and supports explicit
 * recovery (rewinding to a known-good ledger).
 */
@Injectable()
export class LedgerCursorManagerService {
  private readonly logger = new Logger(LedgerCursorManagerService.name);

  constructor(private readonly store: CursorStore = new InMemoryCursorStore()) {}

  getCursor(name: string): LedgerCursor | undefined {
    return this.store.get(name);
  }

  /** Ledger to resume from (exclusive of the stored ledger). Defaults to `from`. */
  resumeLedger(name: string, from = 0): number {
    const cursor = this.store.get(name);
    return cursor ? cursor.lastLedger + 1 : from;
  }

  /**
   * Advance the cursor to `ledger`. Rejects non-increasing progression to guard
   * against replaying or skipping ledgers.
   */
  advance(name: string, ledger: number): LedgerCursor {
    if (!Number.isInteger(ledger) || ledger < 0) {
      throw new CursorProgressionError(`Ledger must be a non-negative integer, got ${ledger}.`);
    }
    const current = this.store.get(name);
    if (current && ledger <= current.lastLedger) {
      throw new CursorProgressionError(
        `Cursor "${name}" cannot move backward: ${current.lastLedger} -> ${ledger}.`,
      );
    }
    const cursor: LedgerCursor = { name, lastLedger: ledger, updatedAt: new Date().toISOString() };
    this.store.set(cursor);
    return cursor;
  }

  /** Force the cursor to a specific ledger (used for recovery/rewind). */
  recover(name: string, ledger: number): LedgerCursor {
    if (!Number.isInteger(ledger) || ledger < 0) {
      throw new CursorProgressionError(`Recovery ledger must be a non-negative integer, got ${ledger}.`);
    }
    const cursor: LedgerCursor = { name, lastLedger: ledger, updatedAt: new Date().toISOString() };
    this.store.set(cursor);
    this.logger.warn(`Cursor "${name}" recovered to ledger ${ledger}.`);
    return cursor;
  }
}
