/**
 * Stellar Asset Eligibility Validator (Issue #447)
 *
 * Validates whether a Stellar asset is eligible for bridging:
 *  - the identifier is a well-formed Stellar asset,
 *  - the asset is supported (native XLM or in the supported list), and
 *  - the asset is not restricted (by code or issuer).
 *
 * Parsing/validation rules mirror the asset compatibility scanner but are
 * inlined so this validator has no runtime dependency on the Stellar SDK.
 */

import {
  AssetEligibilityConfig,
  AssetEligibilityResult,
  EligibilityIssue,
  EligibilityStatus,
  StellarAsset,
} from './types';

// Self-contained Stellar asset parsing/validation. These mirror the rules in
// the asset compatibility scanner but are inlined so the eligibility validator
// has no runtime dependency on the Stellar SDK (keeping it portable and
// independently testable).
function isNativeAsset(code: string): boolean {
  return code === 'XLM' || code === 'native';
}

function isValidAssetCode(code: string): boolean {
  const trimmed = code.trim();
  return trimmed.length >= 1 && trimmed.length <= 12 && /^[a-zA-Z0-9]+$/.test(trimmed);
}

/** Stellar account/issuer keys are 56-char strkeys starting with `G` (base32). */
function isValidIssuer(issuer: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(issuer.trim());
}

function parseAsset(assetString: string): StellarAsset | null {
  if (!assetString || !assetString.trim()) return null;
  const value = assetString.trim();
  if (isNativeAsset(value)) return { code: 'XLM' };

  const parts = value.split(':');
  if (parts.length === 2) {
    const [code, issuer] = parts;
    if (!isValidAssetCode(code) || !isValidIssuer(issuer.trim())) return null;
    return { code: code.trim(), issuer: issuer.trim() };
  }
  if (isValidAssetCode(value)) return { code: value };
  return null;
}

const DEFAULT_CONFIG: AssetEligibilityConfig = {
  supportedAssetCodes: ['USDC', 'USDT', 'EURC'],
  restrictedAssetCodes: [],
  restrictedIssuers: [],
  allowNative: true,
  allowUnlistedAssets: false,
  requireIssuerForNonNative: true,
};

export class StellarAssetEligibilityValidator {
  private readonly config: AssetEligibilityConfig;

  constructor(config: Partial<AssetEligibilityConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Validate a single asset identifier (e.g. "XLM", "USDC:GA5Z...""). */
  validate(assetIdentifier: string): AssetEligibilityResult {
    const checkedAt = Date.now();
    const asset = parseAsset(assetIdentifier);

    const build = (
      eligible: boolean,
      status: EligibilityStatus,
      issues: EligibilityIssue[],
    ): AssetEligibilityResult => ({
      eligible,
      status,
      assetIdentifier,
      asset,
      issues,
      checkedAt,
    });

    // 1. Format: must parse and have a valid code.
    if (!asset || !isValidAssetCode(asset.code)) {
      return build(false, 'invalid', [
        {
          severity: 'error',
          code: 'INVALID_ASSET_FORMAT',
          message: `Failed to parse asset "${assetIdentifier}". Expected "CODE" or "CODE:ISSUER".`,
        },
      ]);
    }

    const native = isNativeAsset(asset.code);

    // Issuer well-formedness for non-native assets.
    if (!native) {
      if (asset.issuer && !isValidIssuer(asset.issuer)) {
        return build(false, 'invalid', [
          {
            severity: 'error',
            code: 'INVALID_ISSUER',
            message: `Asset "${assetIdentifier}" has an invalid issuer address.`,
          },
        ]);
      }
      if (!asset.issuer && this.config.requireIssuerForNonNative) {
        return build(false, 'invalid', [
          {
            severity: 'error',
            code: 'MISSING_ISSUER',
            message: `Non-native asset "${asset.code}" must declare an issuer address.`,
          },
        ]);
      }
    }

    // 2. Restrictions take precedence over support: an explicitly restricted
    //    asset or issuer is never eligible.
    const restrictionIssues = this.collectRestrictionIssues(asset, native);
    if (restrictionIssues.length > 0) {
      return build(false, 'restricted', restrictionIssues);
    }

    // 3. Support.
    if (native) {
      if (!this.config.allowNative) {
        return build(false, 'unsupported', [
          {
            severity: 'error',
            code: 'NATIVE_NOT_ELIGIBLE',
            message: 'The native asset (XLM) is not eligible for bridging in this configuration.',
          },
        ]);
      }
      return build(true, 'eligible', []);
    }

    const supported =
      this.config.supportedAssetCodes.includes(asset.code) || this.config.allowUnlistedAssets;
    if (!supported) {
      return build(false, 'unsupported', [
        {
          severity: 'error',
          code: 'ASSET_UNSUPPORTED',
          message: `Asset "${asset.code}" is not in the list of supported bridge assets.`,
        },
      ]);
    }

    return build(true, 'eligible', []);
  }

  /** Convenience boolean check. */
  isEligible(assetIdentifier: string): boolean {
    return this.validate(assetIdentifier).eligible;
  }

  /** Validate many identifiers at once. */
  validateMany(assetIdentifiers: string[]): AssetEligibilityResult[] {
    return assetIdentifiers.map((id) => this.validate(id));
  }

  /**
   * Filter a list of asset identifiers down to the eligible ones — intended as
   * a pre-filter so unsupported/restricted assets never enter route search.
   */
  filterEligible(assetIdentifiers: string[]): string[] {
    return assetIdentifiers.filter((id) => this.isEligible(id));
  }

  private collectRestrictionIssues(asset: StellarAsset, native: boolean): EligibilityIssue[] {
    const issues: EligibilityIssue[] = [];
    if (this.config.restrictedAssetCodes.includes(asset.code)) {
      issues.push({
        severity: 'error',
        code: 'ASSET_RESTRICTED',
        message: `Asset "${asset.code}" is restricted from bridging.`,
      });
    }
    if (!native && asset.issuer && this.config.restrictedIssuers.includes(asset.issuer)) {
      issues.push({
        severity: 'error',
        code: 'ISSUER_RESTRICTED',
        message: `Issuer "${asset.issuer}" is restricted from bridging.`,
      });
    }
    return issues;
  }
}
