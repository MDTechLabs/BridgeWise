import { EventEmitter } from 'events';

export interface IndexedLedgerRecord {
  id: string;
  ledger: number;
  [key: string]: unknown;
}

export interface LedgerObservation {
  sequence: number;
  hash?: string;
  parentHash?: string;
}

export interface LedgerReorganization {
  previous: LedgerObservation;
  observed: LedgerObservation;
  affectedRecords: IndexedLedgerRecord[];
  recoveryLedger: number;
  reason: 'gap' | 'rollback' | 'parent-mismatch';
  detectedAt: Date;
}

export interface LedgerReorgDetectorOptions {
  initialLedger?: number;
  records?: () => IndexedLedgerRecord[];
  recover?: (ledger: number, event: LedgerReorganization) => void | Promise<void>;
}

/** Detects discontinuities in the ledger chain before they poison index state. */
export class StellarLedgerReorgDetector extends EventEmitter {
  private previous?: LedgerObservation;
  private readonly records: () => IndexedLedgerRecord[];
  private readonly recover?: LedgerReorgDetectorOptions['recover'];

  constructor(options: LedgerReorgDetectorOptions = {}) {
    super();
    this.previous = options.initialLedger === undefined ? undefined : { sequence: options.initialLedger };
    this.records = options.records ?? (() => []);
    this.recover = options.recover;
  }

  get lastLedger(): number | undefined { return this.previous?.sequence; }

  observe(ledger: LedgerObservation): LedgerReorganization | undefined {
    if (!Number.isInteger(ledger.sequence) || ledger.sequence < 0) {
      throw new Error(`Ledger sequence must be a non-negative integer, got ${ledger.sequence}.`);
    }
    if (!this.previous) { this.previous = ledger; return undefined; }
    const expected = this.previous.sequence + 1;
    const reason = ledger.sequence < expected ? 'rollback' : ledger.sequence > expected ? 'gap' :
      this.previous.hash && ledger.parentHash && this.previous.hash !== ledger.parentHash ? 'parent-mismatch' : undefined;
    if (!reason) { this.previous = ledger; return undefined; }
    const event: LedgerReorganization = {
      previous: this.previous,
      observed: ledger,
      affectedRecords: this.records().filter((record) => record.ledger >= ledger.sequence),
      recoveryLedger: Math.max(0, Math.min(this.previous.sequence, ledger.sequence - 1)),
      reason,
      detectedAt: new Date(),
    };
    this.emit('reorganization', event);
    this.emit('reorg', event);
    void this.recover?.(event.recoveryLedger, event);
    this.previous = ledger;
    return event;
  }

  track(sequence: number, hash?: string, parentHash?: string): LedgerReorganization | undefined {
    return this.observe({ sequence, hash, parentHash });
  }
}