import {
  TransactionRecoveryQueueService,
  RecoveryOutcome,
} from './transaction-recovery-queue.service';

describe('TransactionRecoveryQueueService', () => {
  let q: TransactionRecoveryQueueService;
  beforeEach(() => {
    q = new TransactionRecoveryQueueService({ maxRetries: 3 });
  });

  it('enqueues transactions idempotently', () => {
    q.enqueue({ id: 'tx1' });
    q.enqueue({ id: 'tx1' });
    expect(q.size()).toBe(1);
    expect(q.has('tx1')).toBe(true);
  });

  it('removes a transaction on successful recovery', () => {
    q.enqueue({ id: 'tx1' });
    expect(q.recordAttempt('tx1', true)).toBe(RecoveryOutcome.RECOVERED);
    expect(q.has('tx1')).toBe(false);
    expect(q.size()).toBe(0);
  });

  it('tracks attempts and schedules retries below the limit', () => {
    q.enqueue({ id: 'tx1' });
    expect(q.recordAttempt('tx1', false, 'timeout')).toBe(RecoveryOutcome.RETRY_SCHEDULED);
    const item = q.pending()[0];
    expect(item.attempts).toBe(1);
    expect(item.lastError).toBe('timeout');
  });

  it('exhausts a transaction into the dead-letter list at the retry limit', () => {
    q.enqueue({ id: 'tx1' });
    expect(q.recordAttempt('tx1', false)).toBe(RecoveryOutcome.RETRY_SCHEDULED);
    expect(q.recordAttempt('tx1', false)).toBe(RecoveryOutcome.RETRY_SCHEDULED);
    expect(q.recordAttempt('tx1', false)).toBe(RecoveryOutcome.EXHAUSTED);
    expect(q.has('tx1')).toBe(false);
    expect(q.getDeadLettered().map((d) => d.id)).toEqual(['tx1']);
  });

  it('throws when recording an attempt for an unknown transaction', () => {
    expect(() => q.recordAttempt('nope', false)).toThrow();
  });
});
