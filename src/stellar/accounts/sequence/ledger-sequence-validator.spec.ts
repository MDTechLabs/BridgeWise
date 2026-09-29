import { StellarLedgerSequenceValidator } from './ledger-sequence-validator';

function ledger(sequence: number, hash = `hash-${sequence}`) {
  return { sequence, hash };
}

describe('StellarLedgerSequenceValidator', () => {
  const validator = new StellarLedgerSequenceValidator();

  it('accepts a strictly increasing sequence', () => {
    const result = validator.validate([ledger(1), ledger(2), ledger(3)]);

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.lastSequence).toBe(3);
    expect(result.nextExpected).toBe(4);
  });

  it('returns an empty result for no input', () => {
    const result = validator.validate([]);

    expect(result.valid).toBe(true);
    expect(result.lastSequence).toBeNull();
    expect(result.nextExpected).toBeNull();
  });

  it('detects a duplicate ledger', () => {
    const result = validator.validate([ledger(5), ledger(5)]);

    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain('DUPLICATE_SEQUENCE');
  });

  it('detects a ledger that arrives out of order', () => {
    const result = validator.validate([ledger(10), ledger(9)]);

    expect(result.issues.map((i) => i.code)).toContain('OUT_OF_ORDER');
  });

  it('detects a hash mismatch for a previously seen ledger', () => {
    const result = validator.validate([ledger(7, 'aaa'), ledger(7, 'bbb')]);

    expect(result.issues.map((i) => i.code)).toContain('HASH_MISMATCH');
  });

  it('treats a small gap as a warning and a large gap as an error', () => {
    const small = validator.validate([ledger(1), ledger(3)]);
    expect(small.issues.find((i) => i.code === 'SEQUENCE_GAP')?.severity).toBe(
      'warning',
    );
    expect(small.valid).toBe(true);

    const large = validator.validate([ledger(1), ledger(9)]);
    expect(large.issues.find((i) => i.code === 'SEQUENCE_GAP')?.severity).toBe(
      'error',
    );
    expect(large.valid).toBe(false);
  });

  it('honours a custom allowed gap', () => {
    const tolerant = new StellarLedgerSequenceValidator({ maxAllowedGap: 5 });
    const result = tolerant.validate([ledger(1), ledger(6)]);

    expect(result.valid).toBe(true);
  });

  it('rejects a non-positive sequence', () => {
    const result = validator.validate([ledger(0)]);

    expect(result.issues.map((i) => i.code)).toContain('NON_POSITIVE_SEQUENCE');
  });
});
