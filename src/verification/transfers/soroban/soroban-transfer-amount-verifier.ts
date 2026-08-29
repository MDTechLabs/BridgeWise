export interface SorobanTransferAmountVerificationRequest {
  expectedAmount: string;
  actualAmount: string;
  toleranceBps?: number;
}

export interface SorobanTransferAmountVerificationResult {
  isValid: boolean;
  expectedAmount: string;
  actualAmount: string;
  difference: string;
  verifiedAt: number;
  reason?: string;
}

export class SorobanTransferAmountVerifier {
  verify(
    request: SorobanTransferAmountVerificationRequest,
  ): SorobanTransferAmountVerificationResult {
    const expected = Number(request.expectedAmount);
    const actual = Number(request.actualAmount);
    const toleranceBps = request.toleranceBps ?? 0;
    const difference = actual - expected;
    const allowedDelta = Math.abs(expected) * (toleranceBps / 10_000);
    const isValid = Number.isFinite(expected) && Number.isFinite(actual) && Math.abs(difference) <= allowedDelta;

    return {
      isValid,
      expectedAmount: request.expectedAmount,
      actualAmount: request.actualAmount,
      difference: String(difference),
      verifiedAt: Date.now(),
      reason: isValid ? undefined : 'amount outside allowed tolerance',
    };
  }
}

