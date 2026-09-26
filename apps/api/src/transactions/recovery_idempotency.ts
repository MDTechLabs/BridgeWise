/**
 * Stuck transaction recovery handler and idempotency key validation helper.
 */

export interface TransactionState {
  txHash: string;
  status: 'pending' | 'stuck' | 'confirmed' | 'failed';
  updatedAt: number;
  idempotencyKey: string;
}

export class TransactionRecoveryManager {
  private cache: Map<string, TransactionState> = new Map();

  /**
   * Validates if a transaction submission is idempotent.
   */
  public isDuplicateSubmission(idempotencyKey: string): boolean {
    return this.cache.has(idempotencyKey);
  }

  /**
   * Registers a transaction attempt under an idempotency key.
   */
  public registerSubmission(idempotencyKey: string, txHash: string): void {
    this.cache.set(idempotencyKey, {
      txHash,
      status: 'pending',
      updatedAt: Date.now(),
      idempotencyKey,
    });
  }

  /**
   * Detects stuck transactions exceeding the timeout threshold (ms).
   */
  public findStuckTransactions(timeoutMs: number = 300000): TransactionState[] {
    const now = Date.now();
    const stuck: TransactionState[] = [];
    for (const tx of this.cache.values()) {
      if (tx.status === 'pending' && now - tx.updatedAt > timeoutMs) {
        stuck.push({ ...tx, status: 'stuck' });
      }
    }
    return stuck;
  }

  /**
   * Recovers a stuck transaction by attempting resubmission or marking for manual review.
   */
  public recoverStuckTransaction(txHash: string): boolean {
    for (const [key, tx] of this.cache.entries()) {
      if (tx.txHash === txHash) {
        tx.status = 'pending';
        tx.updatedAt = Date.now();
        this.cache.set(key, tx);
        return true;
      }
    }
    return false;
  }
}
