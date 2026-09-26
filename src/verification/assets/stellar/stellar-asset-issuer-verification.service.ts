import { getIssuerProfile } from '../../../intelligence/issuers/stellar/asset-issuer-intelligence';

export interface StellarAssetIssuerVerificationResult {
  issuerId: string;
  isValid: boolean;
  trustLevel: 'high' | 'medium' | 'low' | 'unknown';
  riskFlags: string[];
  verifiedAt: number;
  reason?: string;
}

const STELLAR_ISSUER_REGEX = /^G[A-Z2-7]{55}$/;

export class StellarAssetIssuerVerificationService {
  verifyIssuer(issuerId: string): StellarAssetIssuerVerificationResult {
    const profile = getIssuerProfile(issuerId);
    const isFormatted = STELLAR_ISSUER_REGEX.test(issuerId);
    const riskFlags = profile?.riskFlags ?? [];

    return {
      issuerId,
      isValid: isFormatted && riskFlags.length === 0,
      trustLevel: profile?.metadata.trustLevel ?? 'unknown',
      riskFlags,
      verifiedAt: Date.now(),
      reason: isFormatted ? undefined : 'invalid issuer id',
    };
  }
}

