import { canAcceptExposure } from './exposure-caps';

describe('exposure caps', () => {
  const cfg = { globalCap: 1000n, chainCap: 400n, inflightCap: 200n };
  it('rejects chain cap breach', () => {
    const r = canAcceptExposure({ global: 100n, chain: 390n, inflight: 10n }, cfg, 20n);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('chain_cap');
  });
  it('accepts within caps', () => {
    const r = canAcceptExposure({ global: 100n, chain: 100n, inflight: 10n }, cfg, 20n);
    expect(r.ok).toBe(true);
  });
});
