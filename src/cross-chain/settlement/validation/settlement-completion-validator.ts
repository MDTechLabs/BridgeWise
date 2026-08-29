export interface SettlementChainState {
  confirmed: boolean;
  asset?: string;
  amount?: string;
}

export interface SettlementCompletionRequest {
  settlementId: string;
  sourceTransaction: string;
  destinationTransaction: string;
  expectedAsset: string;
  expectedAmount: string;
}

export interface SettlementCompletionResult {
  settlementId: string;
  complete: boolean;
  sourceConfirmed: boolean;
  destinationConfirmed: boolean;
  assetValid: boolean;
  amountValid: boolean;
  reasons: string[];
  checkedAt: number;
}

export type SettlementStateReader = (transaction: string) => Promise<SettlementChainState | null>;

/** Final gate for a bridge settlement; incomplete or mismatched states stay unresolved. */
export class SettlementCompletionValidator {
  constructor(private readonly readState: SettlementStateReader) {}

  async validate(request: SettlementCompletionRequest): Promise<SettlementCompletionResult> {
    const [source, destination] = await Promise.all([
      this.readState(request.sourceTransaction),
      this.readState(request.destinationTransaction),
    ]);
    const reasons: string[] = [];
    if (!source) reasons.push('Source transaction was not found.');
    if (!destination) reasons.push('Destination transaction was not found.');
    if (source && !source.confirmed) reasons.push('Source transaction is not confirmed.');
    if (destination && !destination.confirmed) reasons.push('Destination transaction is not confirmed.');
    const assetValid = destination?.asset === request.expectedAsset;
    const amountValid = destination?.amount === request.expectedAmount;
    if (destination && !assetValid) reasons.push('Destination asset does not match the expected asset.');
    if (destination && !amountValid) reasons.push('Destination amount does not match the expected amount.');
    return {
      settlementId: request.settlementId,
      complete: reasons.length === 0,
      sourceConfirmed: source?.confirmed === true,
      destinationConfirmed: destination?.confirmed === true,
      assetValid,
      amountValid,
      reasons,
      checkedAt: Date.now(),
    };
  }
}