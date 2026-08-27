export type CanonicalSettlementStatus =
  'initiated' | 'pending' | 'settled' | 'failed' | 'unknown';

export type ProviderStatus = {
  provider: 'stellar' | 'evm';
  rawStatus: string;
};

export interface NormalizedStatus {
  canonical: CanonicalSettlementStatus;
  provider: 'stellar' | 'evm';
  rawStatus: string;
}

const STELLAR_MAP: Record<string, CanonicalSettlementStatus> = {
  initiated: 'initiated',
  pending: 'pending',
  in_progress: 'pending',
  success: 'settled',
  completed: 'settled',
  failed: 'failed',
  error: 'failed',
};

const EVM_MAP: Record<string, CanonicalSettlementStatus> = {
  pending: 'pending',
  submitted: 'pending',
  mined: 'settled',
  confirmed: 'settled',
  success: 'settled',
  reverted: 'failed',
  failed: 'failed',
};

export class StellarEvmSettlementStatusAdapter {
  normalize(status: ProviderStatus): NormalizedStatus {
    const map = status.provider === 'stellar' ? STELLAR_MAP : EVM_MAP;
    const canonical = map[status.rawStatus.toLowerCase()] ?? 'unknown';
    return {
      canonical,
      provider: status.provider,
      rawStatus: status.rawStatus,
    };
  }
}
