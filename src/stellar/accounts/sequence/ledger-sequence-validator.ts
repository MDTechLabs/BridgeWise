/**
 * Stellar ledger sequence handling.
 *
 * Ledger sequences are the ordering primitive for everything built on top of
 * Horizon and Soroban RPC. A gap, a duplicate, or a sequence that moves
 * backwards all mean the same thing to a consumer: the stream can no longer be
 * trusted until the affected range is re-read. This validator walks a batch of
 * ledgers and reports each ordering problem with the ledger it concerns.
 */

export interface LedgerRecord {
  sequence: number;
  hash: string;
  ledgerCloseTime?: number;
}

export type LedgerSequenceIssueCode =
  | 'NON_POSITIVE_SEQUENCE'
  | 'HASH_MISMATCH'
  | 'DUPLICATE_SEQUENCE'
  | 'OUT_OF_ORDER'
  | 'SEQUENCE_GAP';

export interface LedgerSequenceIssue {
  code: LedgerSequenceIssueCode;
  severity: 'error' | 'warning';
  message: string;
  sequence: number;
}

export interface LedgerSequenceValidationResult {
  valid: boolean;
  issues: LedgerSequenceIssue[];
  lastSequence: number | null;
  nextExpected: number | null;
}

export interface LedgerSequenceValidatorConfig {
  /** A gap larger than this is an error; smaller gaps are warnings. Default 1. */
  maxAllowedGap?: number;
}

export class StellarLedgerSequenceValidator {
  private readonly maxAllowedGap: number;

  constructor(config: LedgerSequenceValidatorConfig = {}) {
    this.maxAllowedGap = config.maxAllowedGap ?? 1;
  }

  validate(records: LedgerRecord[]): LedgerSequenceValidationResult {
    const issues: LedgerSequenceIssue[] = [];
    const hashes = new Map<number, string>();
    let lastSequence: number | null = null;

    for (const record of records) {
      if (!Number.isInteger(record.sequence) || record.sequence <= 0) {
        issues.push({
          code: 'NON_POSITIVE_SEQUENCE',
          severity: 'error',
          message: `Ledger sequence ${record.sequence} is not a positive integer`,
          sequence: record.sequence,
        });
        continue;
      }

      const knownHash = hashes.get(record.sequence);
      if (knownHash !== undefined && knownHash !== record.hash) {
        issues.push({
          code: 'HASH_MISMATCH',
          severity: 'error',
          message: `Ledger ${record.sequence} was seen with hash ${knownHash} and again with ${record.hash}`,
          sequence: record.sequence,
        });
        continue;
      }

      if (lastSequence !== null && record.sequence === lastSequence) {
        issues.push({
          code: 'DUPLICATE_SEQUENCE',
          severity: 'error',
          message: `Ledger ${record.sequence} was received more than once`,
          sequence: record.sequence,
        });
        continue;
      }

      if (lastSequence !== null && record.sequence < lastSequence) {
        issues.push({
          code: 'OUT_OF_ORDER',
          severity: 'error',
          message: `Ledger ${record.sequence} arrived after ledger ${lastSequence}`,
          sequence: record.sequence,
        });
        continue;
      }

      if (lastSequence !== null && record.sequence - lastSequence > 1) {
        const gap = record.sequence - lastSequence - 1;
        issues.push({
          code: 'SEQUENCE_GAP',
          severity: gap > this.maxAllowedGap ? 'error' : 'warning',
          message: `Gap of ${gap} ledger(s) between ${lastSequence} and ${record.sequence}`,
          sequence: record.sequence,
        });
      }

      hashes.set(record.sequence, record.hash);
      lastSequence = record.sequence;
    }

    return {
      valid: issues.every((issue) => issue.severity !== 'error'),
      issues,
      lastSequence,
      nextExpected: lastSequence === null ? null : lastSequence + 1,
    };
  }
}
