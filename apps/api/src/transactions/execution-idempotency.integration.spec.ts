import { Test, TestingModule } from '@nestjs/testing';
import { TransactionRecoveryManager } from './recovery_idempotency';
import { TransactionRecoveryQueueService, RecoveryOutcome } from '../recovery/queue/stellar/transaction-recovery-queue.service';

describe('Execution Idempotency — Integration', () => {
  let recoveryManager: TransactionRecoveryManager;
  let recoveryQueue: TransactionRecoveryQueueService;

  beforeAll(async () => {
    recoveryManager = new TransactionRecoveryManager();
    recoveryQueue = new TransactionRecoveryQueueService({ maxRetries: 3 });
  });

  afterEach(() => {
    // Clean up state between tests
    (recoveryManager as any).cache.clear();
    (recoveryQueue as any).queue.clear();
    (recoveryQueue as any).deadLetter.clear();
  });

  describe('Transaction Submission Idempotency', () => {
    it('prevents duplicate submissions with same idempotency key', () => {
      const idempotencyKey = 'key-123';
      const txHash = '0xabc123';

      // First submission should succeed
      recoveryManager.registerSubmission(idempotencyKey, txHash);
      expect(recoveryManager.isDuplicateSubmission(idempotencyKey)).toBe(true);

      // Second submission with same key should be detected as duplicate
      expect(recoveryManager.isDuplicateSubmission(idempotencyKey)).toBe(true);
    });

    it('allows different submissions with different idempotency keys', () => {
      const key1 = 'key-123';
      const key2 = 'key-456';
      const txHash1 = '0xabc123';
      const txHash2 = '0xdef456';

      recoveryManager.registerSubmission(key1, txHash1);
      recoveryManager.registerSubmission(key2, txHash2);

      expect(recoveryManager.isDuplicateSubmission(key1)).toBe(true);
      expect(recoveryManager.isDuplicateSubmission(key2)).toBe(true);
      expect(recoveryManager.isDuplicateSubmission('key-789')).toBe(false);
    });

    it('handles concurrent submissions safely', () => {
      const idempotencyKey = 'concurrent-key';
      const txHash = '0xconcurrent';

      // Simulate concurrent submissions
      recoveryManager.registerSubmission(idempotencyKey, txHash);
      recoveryManager.registerSubmission(idempotencyKey, txHash);

      // Should only have one entry
      expect((recoveryManager as any).cache.size).toBe(1);
      expect(recoveryManager.isDuplicateSubmission(idempotencyKey)).toBe(true);
    });
  });

  describe('Recovery Queue Idempotency', () => {
    it('enqueues transactions idempotently by ID', () => {
      const tx = { id: 'tx-1', payload: { amount: 100 } };

      const result1 = recoveryQueue.enqueue(tx);
      const result2 = recoveryQueue.enqueue(tx);

      expect(result1).toEqual(result2);
      expect(recoveryQueue.size()).toBe(1);
      expect(recoveryQueue.has('tx-1')).toBe(true);
    });

    it('maintains idempotency across recovery attempts', () => {
      const tx = { id: 'tx-2', payload: { amount: 200 } };

      recoveryQueue.enqueue(tx);

      // First attempt fails
      const outcome1 = recoveryQueue.recordAttempt('tx-2', false, 'timeout');
      expect(outcome1).toBe(RecoveryOutcome.RETRY_SCHEDULED);

      // Second attempt succeeds
      const outcome2 = recoveryQueue.recordAttempt('tx-2', true);
      expect(outcome2).toBe(RecoveryOutcome.RECOVERED);

      // Transaction should be removed
      expect(recoveryQueue.has('tx-2')).toBe(false);

      // Re-enqueue should be idempotent
      const result = recoveryQueue.enqueue(tx);
      expect(result.attempts).toBe(0);
    });
  });

  describe('End-to-End Execution Idempotency', () => {
    it('maintains idempotency from submission through recovery', () => {
      const idempotencyKey = 'e2e-key-1';
      const txHash = '0xe2e123';
      const txId = 'tx-e2e-1';

      // Step 1: Register submission
      recoveryManager.registerSubmission(idempotencyKey, txHash);
      expect(recoveryManager.isDuplicateSubmission(idempotencyKey)).toBe(true);

      // Step 2: Enqueue for recovery
      const queued = recoveryQueue.enqueue({ id: txId, payload: { idempotencyKey } });
      expect(queued.id).toBe(txId);

      // Step 3: Simulate recovery attempt failure
      recoveryQueue.recordAttempt(txId, false, 'network error');

      // Step 4: Simulate recovery success
      recoveryQueue.recordAttempt(txId, true);

      // Step 5: Verify state
      expect(recoveryQueue.has(txId)).toBe(false);
      expect(recoveryManager.isDuplicateSubmission(idempotencyKey)).toBe(true);
    });

    it('handles multiple transactions with independent idempotency', () => {
      const transactions = [
        { idempotencyKey: 'multi-1', txHash: '0x1', txId: 'tx-a' },
        { idempotencyKey: 'multi-2', txHash: '0x2', txId: 'tx-b' },
        { idempotencyKey: 'multi-3', txHash: '0x3', txId: 'tx-c' },
      ];

      // Register all submissions
      transactions.forEach((tx) => {
        recoveryManager.registerSubmission(tx.idempotencyKey, tx.txHash);
        recoveryQueue.enqueue({ id: tx.txId, payload: { idempotencyKey: tx.idempotencyKey } });
      });

      // Verify all are tracked independently
      expect(recoveryQueue.size()).toBe(3);
      transactions.forEach((tx) => {
        expect(recoveryManager.isDuplicateSubmission(tx.idempotencyKey)).toBe(true);
        expect(recoveryQueue.has(tx.txId)).toBe(true);
      });

      // Recover first transaction
      recoveryQueue.recordAttempt('tx-a', true);
      expect(recoveryQueue.has('tx-a')).toBe(false);
      expect(recoveryQueue.size()).toBe(2);

      // Other transactions should remain unaffected
      expect(recoveryQueue.has('tx-b')).toBe(true);
      expect(recoveryQueue.has('tx-c')).toBe(true);
    });
  });

  describe('Stuck Transaction Detection and Recovery', () => {
    it('detects stuck transactions after timeout', () => {
      const idempotencyKey = 'stuck-key';
      const txHash = '0xstuck123';

      recoveryManager.registerSubmission(idempotencyKey, txHash);

      // Find stuck transactions with 1ms timeout
      const stuck = recoveryManager.findStuckTransactions(1);
      expect(stuck.length).toBe(1);
      expect(stuck[0].txHash).toBe(txHash);
      expect(stuck[0].status).toBe('stuck');
    });

    it('only detects pending transactions as stuck', () => {
      const pendingKey = 'pending-key';
      const confirmedKey = 'confirmed-key';

      recoveryManager.registerSubmission(pendingKey, '0xpending');
      recoveryManager.registerSubmission(confirmedKey, '0xconfirmed');

      // Mark one as confirmed
      const confirmed = (recoveryManager as any).cache.get(confirmedKey);
      if (confirmed) {
        confirmed.status = 'confirmed';
      }

      // Only pending should be detected as stuck
      const stuck = recoveryManager.findStuckTransactions(1);
      expect(stuck.length).toBe(1);
      expect(stuck[0].idempotencyKey).toBe(pendingKey);
    });
  });

  describe('Idempotency Under Error Conditions', () => {
    it('maintains idempotency after recovery exhaustion', () => {
      const txId = 'exhausted-tx';
      recoveryQueue.enqueue({ id: txId });

      // Exhaust retries
      recoveryQueue.recordAttempt(txId, false);
      recoveryQueue.recordAttempt(txId, false);
      recoveryQueue.recordAttempt(txId, false);

      expect(recoveryQueue.recordAttempt(txId, false)).toBe(RecoveryOutcome.EXHAUSTED);
      expect(recoveryQueue.has(txId)).toBe(false);
      expect(recoveryQueue.getDeadLettered().length).toBe(1);

      // Re-enqueue should start fresh
      const result = recoveryQueue.enqueue({ id: txId });
      expect(result.attempts).toBe(0);
      expect(recoveryQueue.has(txId)).toBe(true);
    });

    it('handles recovery queue errors without breaking idempotency', () => {
      const txId = 'error-tx';
      recoveryQueue.enqueue({ id: txId });

      // Attempt to record for non-existent transaction should throw
      expect(() => recoveryQueue.recordAttempt('non-existent', false)).toThrow();

      // Original transaction should remain unaffected
      expect(recoveryQueue.has(txId)).toBe(true);
      expect(recoveryQueue.size()).toBe(1);
    });
  });
});
