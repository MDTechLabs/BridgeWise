import { decideFinality, type FinalityObservation, type FinalityPolicy } from './rpc-finality-quorum';

const policy: FinalityPolicy = { chainId: 1, minConfirmations: 12, minProviders: 2, minAgreement: 2, requireFinalizedTag: true };
const base = (p: string, overrides: Partial<FinalityObservation> = {}): FinalityObservation => ({
  provider: p, chainId: 1, blockNumber: 100, blockHash: '0xabc', txHash: '0xtx', txStatus: 'success', confirmations: 20, finalized: true, ...overrides,
});

describe('rpc finality quorum', () => {
  it('confirms when providers agree', () => {
    const d = decideFinality([base('a'), base('b')], policy);
    expect(d.status).toBe('confirmed');
    expect(d.reason).toBe('quorum_agreement');
  });

  it('fails closed on disagreement', () => {
    const d = decideFinality([base('a'), base('b', { blockHash: '0xdef' })], policy);
    expect(d.status).toBe('unknown');
    expect(d.reason).toBe('provider_disagreement');
  });

  it('fails closed on insufficient providers', () => {
    const d = decideFinality([base('a')], policy);
    expect(d.status).toBe('unknown');
    expect(d.reason).toBe('insufficient_providers');
  });

  it('rejects non-finalized when policy requires it', () => {
    const d = decideFinality([base('a', { finalized: false }), base('b', { finalized: false })], policy);
    expect(d.status).toBe('unknown');
  });

  it('rejects pending tx status', () => {
    const d = decideFinality([base('a', { txStatus: 'pending' }), base('b', { txStatus: 'pending' })], policy);
    expect(d.status).toBe('unknown');
  });
});
