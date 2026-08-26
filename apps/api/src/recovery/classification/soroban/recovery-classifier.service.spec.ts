import { RecoveryClassifierService, FailureCategory } from './recovery-classifier.service';

describe('RecoveryClassifierService', () => {
  let svc: RecoveryClassifierService;
  beforeEach(() => {
    svc = new RecoveryClassifierService();
  });

  it('classifies known retryable codes', () => {
    const r = svc.classify({ code: 'txBadSeq' });
    expect(r.category).toBe(FailureCategory.RETRYABLE);
    expect(r.retryable).toBe(true);
  });

  it('classifies known permanent codes', () => {
    const r = svc.classify({ code: 'txMalformed' });
    expect(r.category).toBe(FailureCategory.PERMANENT);
    expect(r.retryable).toBe(false);
  });

  it('classifies known user-action codes', () => {
    const r = svc.classify({ code: 'txInsufficientBalance' });
    expect(r.category).toBe(FailureCategory.USER_ACTION);
    expect(r.retryable).toBe(false);
  });

  it('falls back to message heuristics — retryable', () => {
    expect(svc.classify({ message: 'RPC request timeout' }).category).toBe(FailureCategory.RETRYABLE);
  });

  it('falls back to message heuristics — user action', () => {
    expect(svc.classify({ message: 'insufficient balance for fee' }).category).toBe(
      FailureCategory.USER_ACTION,
    );
  });

  it('returns UNKNOWN for unrecognized failures', () => {
    const r = svc.classify({ message: 'something weird happened' });
    expect(r.category).toBe(FailureCategory.UNKNOWN);
    expect(r.recommendation).toMatch(/manual review/i);
  });
});
