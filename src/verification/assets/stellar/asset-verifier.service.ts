/**
 * Soroban Asset Verification Service
 *
 * Verifies the authenticity of supported Soroban assets by validating issuer
 * information and asset metadata. Returns a structured verification status so
 * callers can decide whether to allow a user interaction with the asset.
 *
 * @see Issue #509 — Implement Soroban Asset Verification Service
 */

import type {
  SorobanAsset,
  AssetVerificationResult,
  AssetVerifierConfig,
  VerificationStatus,
} from './asset-verifier.types';

// Stellar account IDs are 56-character base32 strings starting with 'G'
const STELLAR_ACCOUNT_ID_LENGTH = 56;

export class SorobanAssetVerifierService {
  private readonly minIssuerLength: number;
  private readonly now: () => number;

  constructor(config: AssetVerifierConfig = {}) {
    this.minIssuerLength =
      config.minIssuerLength ?? STELLAR_ACCOUNT_ID_LENGTH;
    this.now = config.now ?? (() => Date.now());
  }

  /**
   * Verify a single Soroban asset.
   *
   * Validates:
   * - Issuer account ID format (non-empty, meets minimum length, starts with 'G')
   * - Metadata completeness (must contain a non-empty `code` field)
   */
  verifyAsset(asset: SorobanAsset): AssetVerificationResult {
    const issuerValid = this.validateIssuer(asset.issuerId);
    const metadataValid = this.validateMetadata(asset);

    const isVerified = issuerValid && metadataValid;
    const status: VerificationStatus = isVerified ? 'verified' : 'invalid';

    const reason = isVerified
      ? undefined
      : this.buildReason(issuerValid, metadataValid);

    return {
      assetId: asset.id,
      status,
      isVerified,
      issuerValid,
      metadataValid,
      reason,
      verifiedAt: this.now(),
    };
  }

  /**
   * Verify multiple assets at once.
   * Results are returned in the same order as the input array.
   */
  verifyAssets(assets: SorobanAsset[]): AssetVerificationResult[] {
    return assets.map((a) => this.verifyAsset(a));
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private validateIssuer(issuerId: string): boolean {
    return (
      typeof issuerId === 'string' &&
      issuerId.length >= this.minIssuerLength &&
      issuerId.startsWith('G')
    );
  }

  private validateMetadata(asset: SorobanAsset): boolean {
    const { metadata } = asset;
    return (
      !!metadata &&
      typeof metadata.code === 'string' &&
      metadata.code.trim().length > 0
    );
  }

  private buildReason(issuerValid: boolean, metadataValid: boolean): string {
    const issues: string[] = [];
    if (!issuerValid) issues.push('invalid issuer');
    if (!metadataValid) issues.push('invalid metadata');
    return `Verification failed: ${issues.join(', ')}`;
  }
}
