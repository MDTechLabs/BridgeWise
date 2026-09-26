import {
  SorobanSettlementVerifier,
} from '../../verification/settlements/stellar/settlement-verifier.service';
import type { VerifySettlementRequest, SettlementVerificationResult } from '../../verification/settlements/stellar/settlement-verifier.types';

export interface SettlementReconciliationResult {
  settlementId: string;
  inSync: boolean;
  discrepancies: string[];
  verifiedAt: number;
  verification: SettlementVerificationResult;
}

export class StellarBridgeSettlementReconciliationService {
  private readonly verifier = new SorobanSettlementVerifier();

  async reconcile(
    request: VerifySettlementRequest,
  ): Promise<SettlementReconciliationResult> {
    const verification = await this.verifier.verifySettlement(request);
    return {
      settlementId: request.settlementId,
      inSync: verification.isValid,
      discrepancies: verification.inconsistencies.map((item) => item.description),
      verifiedAt: Date.now(),
      verification,
    };
  }
}

