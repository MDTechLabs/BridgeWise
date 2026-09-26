export interface StellarAsset {
  code: string;
  issuer: string;
}

export type TrustFlag = 'unverified_issuer' | 'low_liquidity' | 'blacklisted' | 'new_asset';

export interface AssetTrustScore {
  asset: StellarAsset;
  score: number; // 0-100
  flags: TrustFlag[];
  suspicious: boolean;
  evaluatedAt: Date;
}

export interface IssuerReputation {
  issuer: string;
  verified: boolean;
  blacklisted: boolean;
  liquidityUsd: number;
  agedays: number;
}
