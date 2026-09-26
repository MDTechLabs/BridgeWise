/**
 * src/recovery/history/stellar/stellar-recovery-history.service.ts
 *
 * Stellar-network specific wrapper around RecoveryHistoryService. Fixes
 * the network label to "stellar" and accepts Stellar-flavored metadata
 * (ledger sequence, transaction hash, Horizon error codes) so callers in
 * the Stellar recovery pipeline don't have to shape generic input by hand.
 */

import { RecoveryHistoryService } from '../history/recovery-history.service';
import { RecoveryHistoryRecord, RecoveryStatus } from '../history/types';

const STELLAR_NETWORK = 'stellar';

export interface StellarRecoveryMetadata {
  /** Stellar transaction hash associated with this attempt, if any. */
  transactionHash?: string;
  /** Ledger sequence number the attempt was submitted/observed at. */
  ledgerSequence?: number;
  /** Horizon/soroban error code, e.g. "tx_bad_seq", "op_underfunded". */
  errorCode?: string;
  [key: string]: unknown;
}

export interface RecordStellarAttemptInput {
  transferId: string;
  success: boolean;
  reason?: string;
  metadata?: StellarRecoveryMetadata;
  maxAttempts?: number;
}

export class StellarRecoveryHistoryService {
  constructor(private readonly historyService: RecoveryHistoryService) {}

  recordAttempt(input: RecordStellarAttemptInput): RecoveryHistoryRecord {
    return this.historyService.recordAttempt({
      transferId: input.transferId,
      network: STELLAR_NETWORK,
      success: input.success,
      reason: input.reason,
      metadata: input.metadata,
      maxAttempts: input.maxAttempts,
    });
  }

  getHistory(transferId: string): RecoveryHistoryRecord | undefined {
    return this.historyService.getHistory(transferId);
  }

  getAttemptCount(transferId: string): number {
    return this.historyService.getAttemptCount(transferId);
  }

  getStatus(transferId: string): RecoveryStatus {
    return this.historyService.getStatus(transferId);
  }

  isMaxAttemptsReached(transferId: string): boolean {
    return this.historyService.isMaxAttemptsReached(transferId);
  }
}
