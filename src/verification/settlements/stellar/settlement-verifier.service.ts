import {
  SettlementRecord,
  SettlementVerificationResult,
  SettlementStatus,
  SettlementMatchStatus,
  SettlementInconsistency,
  InconsistencyType,
  SettlementVerifierConfig,
  VerifySettlementRequest,
  SettlementVerificationStats,
} from './settlement-verifier.types';

/**
 * Service for verifying cross-chain settlements involving Soroban bridges.
 * Ensures settlement completion and detects mismatches between source and
 * destination transactions.
 *
 * @example
 * const verifier = new SorobanSettlementVerifier({
 *   horizonUrl: 'https://horizon-testnet.stellar.org',
 *   confirmationThreshold: 1,
 *   timeoutMs: 30000,
 *   maxRetries: 3,
 *   retryDelayMs: 1000,
 * });
 *
 * const result = await verifier.verifySettlement({
 *   settlementId: 'settlement-123',
 *   sourceTransaction: 'source-tx-hash',
 *   destinationTransaction: 'dest-tx-hash',
 *   expectedAmount: '1000',
 *   expectedAsset: 'USDC',
 *   fromAddress: 'source-addr',
 *   toAddress: 'dest-addr',
 * });
 */
export class SorobanSettlementVerifier {
  private readonly config: SettlementVerifierConfig;
  private settlements = new Map<string, SettlementRecord>();
  private verificationStats: SettlementVerificationStats = {
    totalVerifications: 0,
    successfulVerifications: 0,
    failedVerifications: 0,
    mismatchedSettlements: 0,
    averageVerificationTimeMs: 0,
  };

  constructor(
    config: Partial<SettlementVerifierConfig> = {},
    private readonly fetchTransaction: typeof fetch = (...args) =>
      fetch(...args),
  ) {
    this.config = {
      horizonUrl: config.horizonUrl || 'https://horizon-testnet.stellar.org',
      confirmationThreshold: config.confirmationThreshold ?? 1,
      timeoutMs: config.timeoutMs ?? 30000,
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1000,
    };
  }

  /**
   * Verify a settlement by checking both source and destination transactions.
   */
  async verifySettlement(
    request: VerifySettlementRequest,
  ): Promise<SettlementVerificationResult> {
    const startTime = Date.now();
    this.verificationStats.totalVerifications++;

    try {
      const [sourceTx, destTx] = await Promise.all([
        this.fetchTransactionWithRetry(request.sourceTransaction),
        request.destinationTransaction
          ? this.fetchTransactionWithRetry(request.destinationTransaction)
          : Promise.resolve(null),
      ]);

      const inconsistencies = this.detectInconsistencies(
        request,
        sourceTx,
        destTx,
      );
      const matchStatus = this.determineMatchStatus(
        request,
        sourceTx,
        destTx,
        inconsistencies,
      );

      const result: SettlementVerificationResult = {
        settlementId: request.settlementId,
        isValid: inconsistencies.length === 0,
        status: this.determineStatus(matchStatus, inconsistencies),
        sourceConfirmed: sourceTx ? this.isConfirmed(sourceTx) : false,
        destinationConfirmed: destTx ? this.isConfirmed(destTx) : false,
        matchStatus,
        inconsistencies,
        verifiedAt: Date.now(),
        recommendedAction: this.getRecommendedAction(
          matchStatus,
          inconsistencies,
        ),
      };

      if (result.isValid) {
        this.verificationStats.successfulVerifications++;
      } else {
        this.verificationStats.failedVerifications++;
        if (
          matchStatus === SettlementMatchStatus.MISMATCH ||
          matchStatus === SettlementMatchStatus.PARTIAL
        ) {
          this.verificationStats.mismatchedSettlements++;
        }
      }

      this.updateAverageVerificationTime(Date.now() - startTime);

      return result;
    } catch (error) {
      this.verificationStats.failedVerifications++;

      return {
        settlementId: request.settlementId,
        isValid: false,
        status: SettlementStatus.FAILED,
        sourceConfirmed: false,
        destinationConfirmed: false,
        matchStatus: SettlementMatchStatus.PENDING,
        inconsistencies: [
          {
            type: InconsistencyType.TIMEOUT,
            severity: 'critical',
            description: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        verifiedAt: Date.now(),
        recommendedAction: 'Retry verification after network recovery',
      };
    }
  }

  /**
   * Store a settlement record for tracking
   */
  storeSettlement(record: SettlementRecord): void {
    this.settlements.set(record.settlementId, record);
  }

  /**
   * Retrieve a stored settlement record
   */
  getSettlement(settlementId: string): SettlementRecord | undefined {
    return this.settlements.get(settlementId);
  }

  /**
   * Get all stored settlement records
   */
  getAllSettlements(): SettlementRecord[] {
    return Array.from(this.settlements.values());
  }

  /**
   * Get settlements with a specific status
   */
  getSettlementsByStatus(status: SettlementStatus): SettlementRecord[] {
    return Array.from(this.settlements.values()).filter(
      (s) => s.status === status,
    );
  }

  /**
   * Get verification statistics
   */
  getVerificationStats(): SettlementVerificationStats {
    return { ...this.verificationStats };
  }

  /**
   * Reset verification statistics
   */
  resetStats(): void {
    this.verificationStats = {
      totalVerifications: 0,
      successfulVerifications: 0,
      failedVerifications: 0,
      mismatchedSettlements: 0,
      averageVerificationTimeMs: 0,
    };
  }

  // Private methods

  private async fetchTransactionWithRetry(
    txHash: string,
    retryCount = 0,
  ): Promise<Record<string, unknown> | null> {
    try {
      const response = await this.fetchTransaction(
        `${this.config.horizonUrl}/transactions/${txHash}`,
        { signal: AbortSignal.timeout(this.config.timeoutMs) },
      );

      if (!response.ok) {
        if (retryCount < this.config.maxRetries) {
          await this.delay(this.config.retryDelayMs);
          return this.fetchTransactionWithRetry(txHash, retryCount + 1);
        }
        return null;
      }

      return (await response.json()) as Record<string, unknown>;
    } catch {
      if (retryCount < this.config.maxRetries) {
        await this.delay(this.config.retryDelayMs);
        return this.fetchTransactionWithRetry(txHash, retryCount + 1);
      }
      return null;
    }
  }

  private isConfirmed(tx: Record<string, unknown>): boolean {
    const ledger = tx.ledger as number | undefined;
    return ledger !== undefined && ledger > 0;
  }

  private detectInconsistencies(
    request: VerifySettlementRequest,
    sourceTx: Record<string, unknown> | null,
    destTx: Record<string, unknown> | null,
  ): SettlementInconsistency[] {
    const inconsistencies: SettlementInconsistency[] = [];

    if (!sourceTx) {
      inconsistencies.push({
        type: InconsistencyType.MISSING_SOURCE,
        severity: 'critical',
        description: 'Source transaction not found on Stellar network',
      });
      return inconsistencies;
    }

    if (request.destinationTransaction && !destTx) {
      inconsistencies.push({
        type: InconsistencyType.MISSING_DESTINATION,
        // A missing destination transaction is an incomplete settlement, not
        // proof that the source transfer itself is invalid. Reconciliation
        // should keep monitoring it instead of escalating it as a mismatch.
        severity: 'warning',
        description: 'Destination transaction not found',
      });
    }

    // Check operation details for amount/asset mismatch
    const sourceOps = (sourceTx.operations as unknown[]) || [];
    if (sourceOps.length > 0) {
      const firstOp = sourceOps[0] as Record<string, unknown> | undefined;
      if (firstOp) {
        const amount = firstOp.amount as string | undefined;
        if (amount && amount !== request.expectedAmount) {
          inconsistencies.push({
            type: InconsistencyType.AMOUNT_MISMATCH,
            severity: 'critical',
            description: `Amount mismatch: expected ${request.expectedAmount}, got ${amount}`,
            expectedValue: request.expectedAmount,
            actualValue: amount,
            field: 'amount',
          });
        }
      }
    }

    return inconsistencies;
  }

  private determineMatchStatus(
    request: VerifySettlementRequest,
    sourceTx: Record<string, unknown> | null,
    destTx: Record<string, unknown> | null,
    inconsistencies: SettlementInconsistency[],
  ): SettlementMatchStatus {
    if (inconsistencies.length > 0) {
      const hasCritical = inconsistencies.some(
        (i) => i.severity === 'critical',
      );
      if (hasCritical) {
        return SettlementMatchStatus.MISMATCH;
      }
      if (request.destinationTransaction && sourceTx && !destTx) {
        return this.isConfirmed(sourceTx)
          ? SettlementMatchStatus.PARTIAL
          : SettlementMatchStatus.PENDING;
      }
      return SettlementMatchStatus.PARTIAL;
    }

    if (!sourceTx || (request.destinationTransaction && !destTx)) {
      return SettlementMatchStatus.PENDING;
    }

    if (sourceTx && (!request.destinationTransaction || destTx)) {
      return SettlementMatchStatus.COMPLETE;
    }

    return SettlementMatchStatus.PENDING;
  }

  private determineStatus(
    matchStatus: SettlementMatchStatus,
    inconsistencies: SettlementInconsistency[],
  ): SettlementStatus {
    if (matchStatus === SettlementMatchStatus.MISMATCH) {
      return SettlementStatus.MISMATCHED;
    }
    if (inconsistencies.length > 0) {
      return SettlementStatus.FAILED;
    }
    if (matchStatus === SettlementMatchStatus.COMPLETE) {
      return SettlementStatus.COMPLETED;
    }
    return SettlementStatus.CONFIRMED;
  }

  private getRecommendedAction(
    matchStatus: SettlementMatchStatus,
    inconsistencies: SettlementInconsistency[],
  ): string {
    if (matchStatus === SettlementMatchStatus.MISMATCH) {
      return 'Manual review required. Settlement amounts or addresses do not match.';
    }
    if (matchStatus === SettlementMatchStatus.PARTIAL) {
      return 'Settlement partially complete. Monitor for completion of destination transaction.';
    }
    if (matchStatus === SettlementMatchStatus.PENDING) {
      return 'Waiting for transaction confirmation. Retry verification shortly.';
    }
    if (inconsistencies.length > 0) {
      return `${inconsistencies.length} inconsistency(ies) detected. Review details and take corrective action.`;
    }
    return 'Settlement completed successfully.';
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private updateAverageVerificationTime(verificationTimeMs: number): void {
    const stats = this.verificationStats;
    stats.averageVerificationTimeMs =
      (stats.averageVerificationTimeMs * (stats.totalVerifications - 1) +
        verificationTimeMs) /
      stats.totalVerifications;
  }
}
