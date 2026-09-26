/**
 * Types for Soroban Asset Verification Service
 * @see Issue #509 — Implement Soroban Asset Verification Service
 */

export interface SorobanAssetMetadata {
  /** Asset code (e.g. "USDC") */
  code: string;
  /** Human-readable name */
  name?: string;
  /** Decimal precision */
  decimals?: number;
  /** Optional homepage / domain */
  domain?: string;
  /** Arbitrary extra fields */
  [key: string]: unknown;
}

export interface SorobanAsset {
  /** Unique on-chain asset identifier (contract address or classic asset string) */
  id: string;
  /** Issuer Stellar account ID (G…) */
  issuerId: string;
  metadata: SorobanAssetMetadata;
}

export type VerificationStatus = 'verified' | 'unverified' | 'invalid';

export interface AssetVerificationResult {
  assetId: string;
  status: VerificationStatus;
  isVerified: boolean;
  issuerValid: boolean;
  metadataValid: boolean;
  reason?: string;
  verifiedAt: number;
}

export interface AssetVerifierConfig {
  /** Minimum issuer account ID length check. Default 56 (standard Stellar). */
  minIssuerLength?: number;
  /** Injected clock for deterministic testing. Defaults to Date.now. */
  now?: () => number;
}
