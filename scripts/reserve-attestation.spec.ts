import { evaluateReserveAttestation } from './reserve-attestation';

describe('reserve attestation comparison', () => {
  const policy = { maxAgeSeconds: 3600, minCoverageBps: 10000, nowSeconds: 1_000_000 };

  it('accepts fresh sufficient attestation', () => {
    const d = evaluateReserveAttestation({
      asset: 'USDC', chain: 'ethereum', onchainLiability: 100n, attestedReserve: 110n, attestationTimestamp: 999_900, blockNumber: 1,
    }, policy);
    expect(d.status).toBe('ok');
  });

  it('fails closed on stale attestation', () => {
    const d = evaluateReserveAttestation({
      asset: 'USDC', chain: 'ethereum', onchainLiability: 100n, attestedReserve: 110n, attestationTimestamp: 990_000, blockNumber: 1,
    }, policy);
    expect(d.status).toBe('unknown');
    expect(d.reason).toBe('stale_attestation');
  });

  it('flags undercollateralization', () => {
    const d = evaluateReserveAttestation({
      asset: 'USDC', chain: 'ethereum', onchainLiability: 100n, attestedReserve: 99n, attestationTimestamp: 999_900, blockNumber: 1,
    }, policy);
    expect(d.status).toBe('undercollateralized');
  });
});
