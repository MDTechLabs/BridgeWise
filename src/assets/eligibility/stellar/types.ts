/**
 * Stellar Asset Eligibility Validator — Types (Issue #447)
 *
 * Determines whether a Stellar asset is eligible to be bridged at all — i.e.
 * the asset itself is well-formed, supported, and not restricted — independent
 * of any specific source/target chain pair (that is the bridgeability
 * checker's job). Used to keep unsupported/restricted assets out of route
 * searches.
 */

import { StellarAsset } from '../../../scanning/assets/compatibility/stellar/asset-compatibility-scanner.types';

export type { StellarAsset };

/** Outcome category for an eligibility check. */
export type EligibilityStatus = 'eligible' | 'unsupported' | 'restricted' | 'invalid';

/** A problem found while validating eligibility. */
export interface EligibilityIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

/** Result of validating a single asset's eligibility. */
export interface AssetEligibilityResult {
  /** True only when the asset is well-formed, supported, and not restricted. */
  eligible: boolean;
  status: EligibilityStatus;
  /** The original identifier that was validated. */
  assetIdentifier: string;
  /** Parsed asset (null when the identifier could not be parsed). */
  asset: StellarAsset | null;
  issues: EligibilityIssue[];
  checkedAt: number;
}

/** Configuration for {@link AssetEligibilityConfig}-driven validation. */
export interface AssetEligibilityConfig {
  /** Asset codes explicitly supported for bridging (in addition to native XLM). */
  supportedAssetCodes: string[];
  /** Asset codes that are restricted/disallowed even if otherwise supported. */
  restrictedAssetCodes: string[];
  /** Issuer addresses that are restricted/blocked. */
  restrictedIssuers: string[];
  /** Whether the native asset (XLM) is eligible. Default: true. */
  allowNative: boolean;
  /**
   * Whether assets not present in `supportedAssetCodes` are allowed.
   * Default: false — unknown assets are rejected as unsupported.
   */
  allowUnlistedAssets: boolean;
  /** Require non-native assets to declare an issuer. Default: true. */
  requireIssuerForNonNative: boolean;
}
