import { AssetTrustScore, IssuerReputation, StellarAsset, TrustFlag } from './asset-trust-score.types';

const SUSPICIOUS_THRESHOLD = 40;
const MIN_LIQUIDITY_USD = 10_000;
const MIN_ASSET_AGE_DAYS = 30;

export function calculateTrustScore(
  asset: StellarAsset,
  reputation: IssuerReputation,
): AssetTrustScore {
  let score = 100;
  const flags: TrustFlag[] = [];

  if (reputation.blacklisted) {
    score = 0;
    flags.push('blacklisted');
    return { asset, score, flags, suspicious: true, evaluatedAt: new Date() };
  }

  if (!reputation.verified) {
    score -= 30;
    flags.push('unverified_issuer');
  }

  if (reputation.liquidityUsd < MIN_LIQUIDITY_USD) {
    score -= 25;
    flags.push('low_liquidity');
  }

  if (reputation.agedays < MIN_ASSET_AGE_DAYS) {
    score -= 20;
    flags.push('new_asset');
  }

  score = Math.max(0, score);

  return {
    asset,
    score,
    flags,
    suspicious: score < SUSPICIOUS_THRESHOLD,
    evaluatedAt: new Date(),
  };
}

export function scoreAssets(
  assets: StellarAsset[],
  reputations: Map<string, IssuerReputation>,
): AssetTrustScore[] {
  return assets.map(asset => {
    const reputation = reputations.get(asset.issuer) ?? {
      issuer: asset.issuer,
      verified: false,
      blacklisted: false,
      liquidityUsd: 0,
      agedays: 0,
    };
    return calculateTrustScore(asset, reputation);
  });
}
