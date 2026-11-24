export type FinalityObservation = {
  provider: string;
  chainId: number;
  blockNumber: number;
  blockHash: string;
  txHash?: string;
  txStatus?: 'success' | 'reverted' | 'pending' | 'unknown';
  confirmations: number;
  finalized: boolean;
};

export type FinalityPolicy = {
  chainId: number;
  minConfirmations: number;
  minProviders: number;
  minAgreement: number;
  requireFinalizedTag: boolean;
};

export type FinalityDecision = {
  status: 'confirmed' | 'unknown';
  reason: string;
  agreeingProviders: string[];
  disagreeingProviders: string[];
};

function key(o: FinalityObservation): string {
  return [o.chainId, o.blockNumber, o.blockHash.toLowerCase(), o.txHash?.toLowerCase() ?? '', o.txStatus ?? '', o.finalized ? '1' : '0'].join('|');
}

export function decideFinality(observations: FinalityObservation[], policy: FinalityPolicy): FinalityDecision {
  if (observations.length < policy.minProviders) {
    return { status: 'unknown', reason: 'insufficient_providers', agreeingProviders: [], disagreeingProviders: observations.map(o => o.provider) };
  }
  const valid = observations.filter(o =>
    o.chainId === policy.chainId &&
    o.confirmations >= policy.minConfirmations &&
    (!policy.requireFinalizedTag || o.finalized) &&
    o.txStatus !== 'pending' && o.txStatus !== 'unknown'
  );
  if (valid.length < policy.minProviders) {
    return { status: 'unknown', reason: 'insufficient_valid_observations', agreeingProviders: valid.map(o => o.provider), disagreeingProviders: observations.map(o => o.provider).filter(p => !valid.some(v => v.provider === p)) };
  }
  const groups = new Map<string, FinalityObservation[]>();
  for (const o of valid) {
    const k = key(o);
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  let best: FinalityObservation[] = [];
  for (const g of groups.values()) if (g.length > best.length) best = g;
  const agreeing = best.map(o => o.provider);
  const disagreeing = observations.map(o => o.provider).filter(p => !agreeing.includes(p));
  if (best.length >= policy.minAgreement) {
    return { status: 'confirmed', reason: 'quorum_agreement', agreeingProviders: agreeing, disagreeingProviders: disagreeing };
  }
  return { status: 'unknown', reason: 'provider_disagreement', agreeingProviders: agreeing, disagreeingProviders: disagreeing };
}
