import type { StoredBridgeEvent } from '../../../replay/events/stellar/types';

export interface SorobanEventVerificationContext {
  expectedTransactionHash?: string;
  expectedContractId?: string;
  requireNormalized?: boolean;
}

export interface SorobanEventVerificationResult {
  isValid: boolean;
  reasons: string[];
  verifiedAt: number;
}

export class SorobanEventVerificationService {
  verifyEvent(
    event: StoredBridgeEvent,
    context: SorobanEventVerificationContext = {},
  ): SorobanEventVerificationResult {
    const reasons: string[] = [];

    if (context.requireNormalized && !('normalized' in event && event.normalized === true)) {
      reasons.push('event is not normalized');
    }

    if (context.expectedTransactionHash && event.transactionHash !== context.expectedTransactionHash) {
      reasons.push('transaction hash mismatch');
    }

    if (context.expectedContractId && event.contractId !== context.expectedContractId) {
      reasons.push('contract id mismatch');
    }

    if ('payload' in event && Object.keys(event.payload ?? {}).length === 0) {
      reasons.push('empty payload');
    }

    return {
      isValid: reasons.length === 0,
      reasons,
      verifiedAt: Date.now(),
    };
  }
}

