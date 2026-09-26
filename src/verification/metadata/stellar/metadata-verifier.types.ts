export interface AssetMetadataRecord {
  assetCode: string;
  issuer: string;
  decimals: number;
  symbol: string;
  name?: string;
  logoURI?: string;
  homeDomain?: string;
  source: string;
  retrievedAt: number;
}

export interface ProviderMetadataRecord {
  providerId: string;
  providerName: string;
  endpoint: string;
  network: string;
  version: string;
  supportedAssets: string[];
  status: 'active' | 'inactive' | 'deprecated';
  createdAt: number;
  updatedAt: number;
}

export enum MetadataInconsistencyType {
  MISSING_REQUIRED_FIELD = 'missing_required_field',
  INVALID_FORMAT = 'invalid_format',
  ASSET_CODE_MISMATCH = 'asset_code_mismatch',
  ISSUER_MISMATCH = 'issuer_mismatch',
  DECIMALS_MISMATCH = 'decimals_mismatch',
  SYMBOL_MISMATCH = 'symbol_mismatch',
  INVALID_NETWORK = 'invalid_network',
  INVALID_STATUS = 'invalid_status',
  TIMESTAMP_ANOMALY = 'timestamp_anomaly',
  UNSUPPORTED_ASSET = 'unsupported_asset',
  VERSION_MISMATCH = 'version_mismatch',
  ASSET_NOT_FOUND_ON_CHAIN = 'asset_not_found_on_chain',
}

export interface MetadataInconsistency {
  type: MetadataInconsistencyType;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  field?: string;
  expectedValue?: unknown;
  actualValue?: unknown;
}

export interface AssetMetadataVerificationResult {
  asset: AssetMetadataRecord;
  isValid: boolean;
  fieldErrors: MetadataInconsistency[];
  warnings: MetadataInconsistency[];
}

export interface ProviderMetadataVerificationResult {
  provider: ProviderMetadataRecord;
  isValid: boolean;
  fieldErrors: MetadataInconsistency[];
  warnings: MetadataInconsistency[];
}

export interface MetadataComparisonResult {
  source: AssetMetadataRecord;
  target: AssetMetadataRecord;
  matches: boolean;
  inconsistencies: MetadataInconsistency[];
}

export interface MetadataVerifierConfig {
  allowedNetworks: string[];
  maxAssetCodeLength: number;
  minAssetCodeLength: number;
  allowedStatuses: readonly string[];
}

export interface MetadataVerificationReport {
  assetResults: AssetMetadataVerificationResult[];
  providerResults: ProviderMetadataVerificationResult[];
  comparisons: MetadataComparisonResult[];
  totalVerified: number;
  totalValid: number;
  totalInvalid: number;
  totalWarnings: number;
  totalInconsistencies: number;
  verifiedAt: number;
}
