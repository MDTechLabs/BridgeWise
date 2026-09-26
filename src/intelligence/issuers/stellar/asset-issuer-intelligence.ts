export interface IssuerMetadata {
  issuerId: string;
  name: string;
  domain: string;
  firstSeen: Date;
  totalAssets: number;
  totalVolume: number;
  trustLevel: 'high' | 'medium' | 'low' | 'unknown';
}

export interface IssuerProfile {
  metadata: IssuerMetadata;
  assetCodes: string[];
  recentActivity: string[];
  riskFlags: string[];
}

const issuers: Map<string, IssuerProfile> = new Map();

export function registerIssuer(metadata: IssuerMetadata, assetCodes: string[]): IssuerProfile {
  const profile: IssuerProfile = {
    metadata,
    assetCodes,
    recentActivity: [],
    riskFlags: [],
  };
  issuers.set(metadata.issuerId, profile);
  return profile;
}

export function getIssuerProfile(issuerId: string): IssuerProfile | null {
  return issuers.get(issuerId) ?? null;
}

export function addRiskFlag(issuerId: string, flag: string): void {
  const profile = issuers.get(issuerId);
  if (profile && !profile.riskFlags.includes(flag)) {
    profile.riskFlags.push(flag);
  }
}

export function getIssuersByTrust(level: IssuerMetadata['trustLevel']): IssuerProfile[] {
  return [...issuers.values()].filter(p => p.metadata.trustLevel === level);
}

export function getAllIssuers(): IssuerProfile[] {
  return [...issuers.values()];
}
