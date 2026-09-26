import {
  AssetMetadataRecord,
  ProviderMetadataRecord,
  AssetMetadataVerificationResult,
  ProviderMetadataVerificationResult,
  MetadataComparisonResult,
  MetadataInconsistency,
  MetadataInconsistencyType,
  MetadataVerifierConfig,
  MetadataVerificationReport,
} from './metadata-verifier.types';

const STELLAR_ISSUER_REGEX = /^G[A-Z2-7]{55}$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;
const STELLAR_ASSET_CODE_REGEX = /^[A-Za-z0-9]{1,12}$/;
const URL_REGEX = /^https?:\/\/.+/;

const DEFAULT_CONFIG: MetadataVerifierConfig = {
  allowedNetworks: ['mainnet', 'testnet'],
  maxAssetCodeLength: 12,
  minAssetCodeLength: 1,
  allowedStatuses: ['active', 'inactive', 'deprecated'] as const,
};

export class MetadataVerifier {
  private readonly config: MetadataVerifierConfig;

  constructor(config: Partial<MetadataVerifierConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  validateAssetMetadata(
    asset: AssetMetadataRecord,
  ): AssetMetadataVerificationResult {
    const fieldErrors: MetadataInconsistency[] = [];
    const warnings: MetadataInconsistency[] = [];

    if (!asset.assetCode) {
      fieldErrors.push(
        this.makeError(
          MetadataInconsistencyType.MISSING_REQUIRED_FIELD,
          'critical',
          'Asset code is required',
          'assetCode',
        ),
      );
    } else if (!STELLAR_ASSET_CODE_REGEX.test(asset.assetCode)) {
      fieldErrors.push(
        this.makeError(
          MetadataInconsistencyType.INVALID_FORMAT,
          'critical',
          `Asset code "${asset.assetCode}" is invalid. Must be 1-12 alphanumeric characters`,
          'assetCode',
          '1-12 alphanumeric string',
          asset.assetCode,
        ),
      );
    }

    if (!asset.issuer) {
      fieldErrors.push(
        this.makeError(
          MetadataInconsistencyType.MISSING_REQUIRED_FIELD,
          'critical',
          'Issuer is required',
          'issuer',
        ),
      );
    } else if (!STELLAR_ISSUER_REGEX.test(asset.issuer)) {
      fieldErrors.push(
        this.makeError(
          MetadataInconsistencyType.INVALID_FORMAT,
          'critical',
          `Issuer "${asset.issuer}" is not a valid Stellar public key`,
          'issuer',
          'G followed by 55 alphanumeric characters',
          asset.issuer,
        ),
      );
    }

    if (asset.decimals === undefined || asset.decimals === null) {
      fieldErrors.push(
        this.makeError(
          MetadataInconsistencyType.MISSING_REQUIRED_FIELD,
          'critical',
          'Decimals field is required',
          'decimals',
        ),
      );
    } else if (!Number.isInteger(asset.decimals) || asset.decimals < 0) {
      fieldErrors.push(
        this.makeError(
          MetadataInconsistencyType.INVALID_FORMAT,
          'critical',
          `Decimals must be a non-negative integer, got ${asset.decimals}`,
          'decimals',
          'non-negative integer',
          asset.decimals,
        ),
      );
    } else if (asset.decimals > 7) {
      warnings.push(
        this.makeError(
          MetadataInconsistencyType.INVALID_FORMAT,
          'warning',
          `Decimals ${asset.decimals} is unusually high for a Stellar asset (max 7)`,
          'decimals',
          '0-7',
          asset.decimals,
        ),
      );
    }

    if (!asset.symbol) {
      fieldErrors.push(
        this.makeError(
          MetadataInconsistencyType.MISSING_REQUIRED_FIELD,
          'critical',
          'Symbol is required',
          'symbol',
        ),
      );
    }

    if (asset.retrievedAt && asset.retrievedAt <= 0) {
      warnings.push(
        this.makeError(
          MetadataInconsistencyType.INVALID_FORMAT,
          'warning',
          'retrievedAt timestamp is not positive',
          'retrievedAt',
          'positive number',
          asset.retrievedAt,
        ),
      );
    }

    return {
      asset,
      isValid: fieldErrors.length === 0,
      fieldErrors,
      warnings,
    };
  }

  validateProviderMetadata(
    provider: ProviderMetadataRecord,
  ): ProviderMetadataVerificationResult {
    const fieldErrors: MetadataInconsistency[] = [];
    const warnings: MetadataInconsistency[] = [];

    if (!provider.providerId) {
      fieldErrors.push(
        this.makeError(
          MetadataInconsistencyType.MISSING_REQUIRED_FIELD,
          'critical',
          'Provider ID is required',
          'providerId',
        ),
      );
    }

    if (!provider.providerName) {
      fieldErrors.push(
        this.makeError(
          MetadataInconsistencyType.MISSING_REQUIRED_FIELD,
          'critical',
          'Provider name is required',
          'providerName',
        ),
      );
    }

    if (!provider.endpoint) {
      fieldErrors.push(
        this.makeError(
          MetadataInconsistencyType.MISSING_REQUIRED_FIELD,
          'critical',
          'Endpoint URL is required',
          'endpoint',
        ),
      );
    } else if (!URL_REGEX.test(provider.endpoint)) {
      fieldErrors.push(
        this.makeError(
          MetadataInconsistencyType.INVALID_FORMAT,
          'critical',
          `Endpoint "${provider.endpoint}" is not a valid URL`,
          'endpoint',
          'valid http(s) URL',
          provider.endpoint,
        ),
      );
    }

    if (!provider.network) {
      fieldErrors.push(
        this.makeError(
          MetadataInconsistencyType.MISSING_REQUIRED_FIELD,
          'critical',
          'Network is required',
          'network',
        ),
      );
    } else if (!this.config.allowedNetworks.includes(provider.network)) {
      fieldErrors.push(
        this.makeError(
          MetadataInconsistencyType.INVALID_NETWORK,
          'critical',
          `Network "${provider.network}" is not allowed. Allowed: ${this.config.allowedNetworks.join(', ')}`,
          'network',
          this.config.allowedNetworks.join(' | '),
          provider.network,
        ),
      );
    }

    if (!provider.version) {
      fieldErrors.push(
        this.makeError(
          MetadataInconsistencyType.MISSING_REQUIRED_FIELD,
          'critical',
          'Version is required',
          'version',
        ),
      );
    } else if (!SEMVER_REGEX.test(provider.version)) {
      warnings.push(
        this.makeError(
          MetadataInconsistencyType.VERSION_MISMATCH,
          'warning',
          `Version "${provider.version}" does not follow semver (x.y.z)`,
          'version',
          'semver x.y.z',
          provider.version,
        ),
      );
    }

    if (!provider.supportedAssets || provider.supportedAssets.length === 0) {
      fieldErrors.push(
        this.makeError(
          MetadataInconsistencyType.MISSING_REQUIRED_FIELD,
          'critical',
          'At least one supported asset is required',
          'supportedAssets',
        ),
      );
    } else {
      for (const asset of provider.supportedAssets) {
        if (!STELLAR_ASSET_CODE_REGEX.test(asset)) {
          warnings.push(
            this.makeError(
              MetadataInconsistencyType.INVALID_FORMAT,
              'warning',
              `Supported asset "${asset}" is not a valid Stellar asset code`,
              'supportedAssets',
              '1-12 alphanumeric characters',
              asset,
            ),
          );
        }
      }
    }

    if (!this.config.allowedStatuses.includes(provider.status)) {
      fieldErrors.push(
        this.makeError(
          MetadataInconsistencyType.INVALID_STATUS,
          'critical',
          `Status "${provider.status}" is not valid`,
          'status',
          this.config.allowedStatuses.join(' | '),
          provider.status,
        ),
      );
    }

    if (provider.createdAt && provider.createdAt <= 0) {
      fieldErrors.push(
        this.makeError(
          MetadataInconsistencyType.INVALID_FORMAT,
          'critical',
          'createdAt must be a positive timestamp',
          'createdAt',
          'positive number',
          provider.createdAt,
        ),
      );
    }

    if (provider.updatedAt && provider.updatedAt <= 0) {
      fieldErrors.push(
        this.makeError(
          MetadataInconsistencyType.INVALID_FORMAT,
          'critical',
          'updatedAt must be a positive timestamp',
          'updatedAt',
          'positive number',
          provider.updatedAt,
        ),
      );
    }

    if (
      provider.createdAt &&
      provider.updatedAt &&
      provider.updatedAt < provider.createdAt
    ) {
      fieldErrors.push(
        this.makeError(
          MetadataInconsistencyType.TIMESTAMP_ANOMALY,
          'critical',
          'updatedAt is before createdAt',
          'updatedAt',
          provider.createdAt,
          provider.updatedAt,
        ),
      );
    }

    return {
      provider,
      isValid: fieldErrors.length === 0,
      fieldErrors,
      warnings,
    };
  }

  compareAssetMetadata(
    source: AssetMetadataRecord,
    target: AssetMetadataRecord,
  ): MetadataComparisonResult {
    const inconsistencies: MetadataInconsistency[] = [];

    if (source.assetCode !== target.assetCode) {
      inconsistencies.push(
        this.makeError(
          MetadataInconsistencyType.ASSET_CODE_MISMATCH,
          'critical',
          `Asset code mismatch: "${source.assetCode}" vs "${target.assetCode}"`,
          'assetCode',
          source.assetCode,
          target.assetCode,
        ),
      );
    }

    if (source.issuer !== target.issuer) {
      inconsistencies.push(
        this.makeError(
          MetadataInconsistencyType.ISSUER_MISMATCH,
          'critical',
          `Issuer mismatch: "${source.issuer}" vs "${target.issuer}"`,
          'issuer',
          source.issuer,
          target.issuer,
        ),
      );
    }

    if (source.decimals !== target.decimals) {
      inconsistencies.push(
        this.makeError(
          MetadataInconsistencyType.DECIMALS_MISMATCH,
          'warning',
          `Decimals mismatch: ${source.decimals} vs ${target.decimals}`,
          'decimals',
          source.decimals,
          target.decimals,
        ),
      );
    }

    if (source.symbol !== target.symbol) {
      inconsistencies.push(
        this.makeError(
          MetadataInconsistencyType.SYMBOL_MISMATCH,
          'info',
          `Symbol mismatch: "${source.symbol}" vs "${target.symbol}"`,
          'symbol',
          source.symbol,
          target.symbol,
        ),
      );
    }

    return {
      source,
      target,
      matches: inconsistencies.length === 0,
      inconsistencies,
    };
  }

  generateReport(
    assetResults: AssetMetadataVerificationResult[],
    providerResults: ProviderMetadataVerificationResult[],
    comparisons: MetadataComparisonResult[],
  ): MetadataVerificationReport {
    const allWarnings = [
      ...assetResults.flatMap((r) => r.warnings),
      ...providerResults.flatMap((r) => r.warnings),
    ];

    const allInconsistencies = comparisons.flatMap((c) => c.inconsistencies);

    const totalVerified =
      assetResults.length + providerResults.length + comparisons.length;

    const totalValid =
      assetResults.filter((r) => r.isValid).length +
      providerResults.filter((r) => r.isValid).length +
      comparisons.filter((c) => c.matches).length;

    const totalInvalid = totalVerified - totalValid;

    return {
      assetResults,
      providerResults,
      comparisons,
      totalVerified,
      totalValid,
      totalInvalid,
      totalWarnings: allWarnings.length,
      totalInconsistencies: allInconsistencies.length,
      verifiedAt: Date.now(),
    };
  }

  private makeError(
    type: MetadataInconsistencyType,
    severity: MetadataInconsistency['severity'],
    description: string,
    field?: string,
    expectedValue?: unknown,
    actualValue?: unknown,
  ): MetadataInconsistency {
    return { type, severity, description, field, expectedValue, actualValue };
  }
}
