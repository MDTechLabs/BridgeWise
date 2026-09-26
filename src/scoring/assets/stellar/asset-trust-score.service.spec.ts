import { calculateTrustScore, scoreAssets } from './asset-trust-score.service';
import { IssuerReputation, StellarAsset } from './asset-trust-score.types';

const asset: StellarAsset = { code: 'USDC', issuer: 'GISSUER1' };

const goodReputation: IssuerReputation = {
  issuer: 'GISSUER1',
  verified: true,
  blacklisted: false,
  liquidityUsd: 1_000_000,
  agedays: 365,
};

describe('calculateTrustScore', () => {
  it('returns score of 100 for fully trusted asset', () => {
    const result = calculateTrustScore(asset, goodReputation);
    expect(result.score).toBe(100);
    expect(result.flags).toHaveLength(0);
    expect(result.suspicious).toBe(false);
  });

  it('returns score 0 and suspicious=true for blacklisted issuer', () => {
    const result = calculateTrustScore(asset, { ...goodReputation, blacklisted: true });
    expect(result.score).toBe(0);
    expect(result.flags).toContain('blacklisted');
    expect(result.suspicious).toBe(true);
  });

  it('deducts 30 points for unverified issuer', () => {
    const result = calculateTrustScore(asset, { ...goodReputation, verified: false });
    expect(result.score).toBe(70);
    expect(result.flags).toContain('unverified_issuer');
  });

  it('deducts 25 points for low liquidity', () => {
    const result = calculateTrustScore(asset, { ...goodReputation, liquidityUsd: 5_000 });
    expect(result.score).toBe(75);
    expect(result.flags).toContain('low_liquidity');
  });

  it('deducts 20 points for new asset', () => {
    const result = calculateTrustScore(asset, { ...goodReputation, agedays: 10 });
    expect(result.score).toBe(80);
    expect(result.flags).toContain('new_asset');
  });

  it('marks suspicious when score below 40', () => {
    const result = calculateTrustScore(asset, { ...goodReputation, verified: false, liquidityUsd: 0, agedays: 0 });
    expect(result.score).toBeLessThan(40);
    expect(result.suspicious).toBe(true);
  });

  it('score does not go below 0', () => {
    const result = calculateTrustScore(asset, { ...goodReputation, verified: false, blacklisted: false, liquidityUsd: 0, agedays: 0 });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

describe('scoreAssets', () => {
  it('scores multiple assets using reputation map', () => {
    const assets: StellarAsset[] = [
      { code: 'USDC', issuer: 'GISSUER1' },
      { code: 'XYZ', issuer: 'GUNKNOWN' },
    ];
    const reputations = new Map<string, IssuerReputation>([['GISSUER1', goodReputation]]);

    const results = scoreAssets(assets, reputations);
    expect(results).toHaveLength(2);
    expect(results[0].score).toBe(100);
    // Unknown issuer falls back to defaults: unverified, 0 liquidity, 0 age
    expect(results[1].score).toBeLessThan(40);
    expect(results[1].suspicious).toBe(true);
  });
});
