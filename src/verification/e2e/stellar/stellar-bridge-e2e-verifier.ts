export interface StellarExecutionSnapshot {
  routeSnapshotValid: boolean;
  submitted: boolean;
  sorobanSucceeded: boolean;
  contractEventsValid: boolean;
  settlementComplete: boolean;
  asset: string;
  amount: string;
}

export interface StellarE2EVerificationRequest {
  transferId: string;
  expectedAsset: string;
  expectedAmount: string;
}

export interface StellarE2EVerificationResult {
  transferId: string;
  valid: boolean;
  checks: {
    route: boolean;
    submittedTransaction: boolean;
    sorobanExecution: boolean;
    contractEvents: boolean;
    settlement: boolean;
    finalAsset: boolean;
    finalAmount: boolean;
  };
  failures: string[];
  verifiedAt: number;
}

export type StellarExecutionReader = (transferId: string) => Promise<StellarExecutionSnapshot | null>;

/** Consolidates every source, execution, event, settlement, and final-value check. */
export class StellarBridgeE2EVerifier {
  constructor(private readonly readExecution: StellarExecutionReader) {}

  async verify(request: StellarE2EVerificationRequest): Promise<StellarE2EVerificationResult> {
    const snapshot = await this.readExecution(request.transferId);
    const checks = {
      route: snapshot?.routeSnapshotValid === true,
      submittedTransaction: snapshot?.submitted === true,
      sorobanExecution: snapshot?.sorobanSucceeded === true,
      contractEvents: snapshot?.contractEventsValid === true,
      settlement: snapshot?.settlementComplete === true,
      finalAsset: snapshot?.asset === request.expectedAsset,
      finalAmount: snapshot?.amount === request.expectedAmount,
    };
    const failures = Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([check]) => `${check} verification failed.`);
    return {
      transferId: request.transferId,
      valid: failures.length === 0,
      checks,
      failures,
      verifiedAt: Date.now(),
    };
  }
}