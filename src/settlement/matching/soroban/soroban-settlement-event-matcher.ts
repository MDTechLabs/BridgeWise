import type { BridgeWiseTransferEvent } from '../../../events/types/soroban-contract-event.types';

export interface TransferReference {
  transferId: string;
  contractId: string;
  asset: string;
  amount: string;
}

export type MatchResult =
  | { matched: true; transferId: string }
  | { matched: false; reason: 'no_match' | 'ambiguous'; candidates: string[] };

export interface SorobanSettlementMatcherConfig {
  validateContract?: boolean;
  validateAsset?: boolean;
  validateAmount?: boolean;
}

export class SorobanSettlementEventMatcher {
  private readonly transfers = new Map<string, TransferReference>();
  private readonly config: Required<SorobanSettlementMatcherConfig> = {
    validateContract: true,
    validateAsset: true,
    validateAmount: true,
  };

  constructor(config: SorobanSettlementMatcherConfig = {}) {
    Object.assign(this.config, config);
  }

  register(reference: TransferReference): void {
    this.transfers.set(reference.transferId, reference);
  }

  match(event: BridgeWiseTransferEvent): MatchResult {
    const candidates: string[] = [];

    for (const [transferId, ref] of this.transfers) {
      if (this.config.validateContract && ref.contractId !== event.contractId) {
        continue;
      }
      if (this.config.validateAsset && ref.asset !== event.asset) {
        continue;
      }
      if (this.config.validateAmount && ref.amount !== event.amount) {
        continue;
      }
      candidates.push(transferId);
    }

    if (candidates.length === 1) {
      return { matched: true, transferId: candidates[0] };
    }

    return {
      matched: false,
      reason: candidates.length > 1 ? 'ambiguous' : 'no_match',
      candidates,
    };
  }
}
