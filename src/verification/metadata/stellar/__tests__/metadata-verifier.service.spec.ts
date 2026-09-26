import { MetadataVerifier } from '../metadata-verifier.service';
import type {
  AssetMetadataRecord,
  ProviderMetadataRecord,
} from '../metadata-verifier.types';

describe('MetadataVerifier', () => {
  const validAsset: AssetMetadataRecord = {
    assetCode: 'USDC',
    issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5ZG34M6656Y',
    decimals: 7,
    symbol: 'USDC',
    source: 'horizon',
    retrievedAt: 1000,
  };

  const validProvider: ProviderMetadataRecord = {
    providerId: 'soroswap',
    providerName: 'SoroSwap',
    endpoint: 'https://soroswap.io',
    network: 'mainnet',
    version: '1.0.0',
    supportedAssets: ['XLM', 'USDC'],
    status: 'active',
    createdAt: 100,
    updatedAt: 200,
  };

  let verifier: MetadataVerifier;

  beforeEach(() => {
    verifier = new MetadataVerifier();
  });

  describe('validateAssetMetadata', () => {
    it('passes valid asset metadata', () => {
      const result = verifier.validateAssetMetadata(validAsset);
      expect(result.isValid).toBe(true);
      expect(result.fieldErrors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('fails on missing assetCode', () => {
      const result = verifier.validateAssetMetadata({ ...validAsset, assetCode: '' });
      expect(result.isValid).toBe(false);
      expect(result.fieldErrors[0].field).toBe('assetCode');
    });

    it('fails on invalid assetCode format', () => {
      const result = verifier.validateAssetMetadata({ ...validAsset, assetCode: 'TOO_LONG_ASSET_CODE_123' });
      expect(result.isValid).toBe(false);
      expect(result.fieldErrors[0].type).toBe('invalid_format');
    });

    it('fails on missing issuer', () => {
      const result = verifier.validateAssetMetadata({ ...validAsset, issuer: '' });
      expect(result.isValid).toBe(false);
      expect(result.fieldErrors[0].field).toBe('issuer');
    });

    it('fails on invalid issuer format', () => {
      const result = verifier.validateAssetMetadata({ ...validAsset, issuer: 'not-a-valid-key' });
      expect(result.isValid).toBe(false);
      expect(result.fieldErrors[0].type).toBe('invalid_format');
    });

    it('fails on missing decimals', () => {
      const result = verifier.validateAssetMetadata({ ...validAsset, decimals: undefined as unknown as number });
      expect(result.isValid).toBe(false);
      expect(result.fieldErrors.some((e) => e.field === 'decimals')).toBe(true);
    });

    it('fails on negative decimals', () => {
      const result = verifier.validateAssetMetadata({ ...validAsset, decimals: -1 });
      expect(result.isValid).toBe(false);
      expect(result.fieldErrors[0].field).toBe('decimals');
    });

    it('warns on unusually high decimals', () => {
      const result = verifier.validateAssetMetadata({ ...validAsset, decimals: 18 });
      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].field).toBe('decimals');
    });

    it('fails on missing symbol', () => {
      const result = verifier.validateAssetMetadata({ ...validAsset, symbol: '' });
      expect(result.isValid).toBe(false);
      expect(result.fieldErrors.some((e) => e.field === 'symbol')).toBe(true);
    });

    it('returns all field errors for completely empty asset', () => {
      const result = verifier.validateAssetMetadata({
        assetCode: '',
        issuer: '',
        decimals: undefined as unknown as number,
        symbol: '',
        source: '',
        retrievedAt: 0,
      });
      expect(result.isValid).toBe(false);
      expect(result.fieldErrors.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('validateProviderMetadata', () => {
    it('passes valid provider metadata', () => {
      const result = verifier.validateProviderMetadata(validProvider);
      expect(result.isValid).toBe(true);
      expect(result.fieldErrors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('fails on missing providerId', () => {
      const result = verifier.validateProviderMetadata({ ...validProvider, providerId: '' });
      expect(result.isValid).toBe(false);
      expect(result.fieldErrors.some((e) => e.field === 'providerId')).toBe(true);
    });

    it('fails on missing providerName', () => {
      const result = verifier.validateProviderMetadata({ ...validProvider, providerName: '' });
      expect(result.isValid).toBe(false);
      expect(result.fieldErrors.some((e) => e.field === 'providerName')).toBe(true);
    });

    it('fails on missing endpoint', () => {
      const result = verifier.validateProviderMetadata({ ...validProvider, endpoint: '' });
      expect(result.isValid).toBe(false);
      expect(result.fieldErrors.some((e) => e.field === 'endpoint')).toBe(true);
    });

    it('fails on invalid endpoint URL', () => {
      const result = verifier.validateProviderMetadata({ ...validProvider, endpoint: 'not-a-url' });
      expect(result.isValid).toBe(false);
      expect(result.fieldErrors[0].type).toBe('invalid_format');
    });

    it('fails on invalid network', () => {
      const result = verifier.validateProviderMetadata({ ...validProvider, network: 'unknown' });
      expect(result.isValid).toBe(false);
      expect(result.fieldErrors[0].type).toBe('invalid_network');
    });

    it('warns on non-semver version', () => {
      const result = verifier.validateProviderMetadata({ ...validProvider, version: 'v1.0' });
      expect(result.isValid).toBe(true);
      expect(result.warnings.some((e) => e.type === 'version_mismatch')).toBe(true);
    });

    it('fails on empty supportedAssets', () => {
      const result = verifier.validateProviderMetadata({ ...validProvider, supportedAssets: [] });
      expect(result.isValid).toBe(false);
      expect(result.fieldErrors.some((e) => e.field === 'supportedAssets')).toBe(true);
    });

    it('fails on invalid status', () => {
      const result = verifier.validateProviderMetadata({ ...validProvider, status: 'unknown' as 'active' });
      expect(result.isValid).toBe(false);
      expect(result.fieldErrors[0].type).toBe('invalid_status');
    });

    it('fails when updatedAt is before createdAt', () => {
      const result = verifier.validateProviderMetadata({
        ...validProvider,
        createdAt: 200,
        updatedAt: 100,
      });
      expect(result.isValid).toBe(false);
      expect(result.fieldErrors[0].type).toBe('timestamp_anomaly');
    });
  });

  describe('compareAssetMetadata', () => {
    const target: AssetMetadataRecord = {
      assetCode: 'USDC',
      issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5ZG34M6656Y',
      decimals: 7,
      symbol: 'USDC',
      source: 'provider',
      retrievedAt: 2000,
    };

    it('returns match for identical metadata', () => {
      const result = verifier.compareAssetMetadata(validAsset, { ...target });
      expect(result.matches).toBe(true);
      expect(result.inconsistencies).toHaveLength(0);
    });

    it('detects assetCode mismatch', () => {
      const result = verifier.compareAssetMetadata(validAsset, { ...target, assetCode: 'USDT' });
      expect(result.matches).toBe(false);
      expect(result.inconsistencies[0].type).toBe('asset_code_mismatch');
    });

    it('detects issuer mismatch', () => {
      const result = verifier.compareAssetMetadata(validAsset, {
        ...target,
        issuer: 'GBSTRH4QOTWNSVA6E4HFJRPTD5EPPA6G5CJ3LJ4Z6XJZJ6XJZJ6XJZJ6',
      });
      expect(result.matches).toBe(false);
      expect(result.inconsistencies[0].type).toBe('issuer_mismatch');
    });

    it('detects decimals mismatch', () => {
      const result = verifier.compareAssetMetadata(validAsset, { ...target, decimals: 6 });
      expect(result.matches).toBe(false);
      expect(result.inconsistencies[0].type).toBe('decimals_mismatch');
    });

    it('detects symbol mismatch', () => {
      const result = verifier.compareAssetMetadata(validAsset, { ...target, symbol: 'USD Coin' });
      expect(result.matches).toBe(false);
      expect(result.inconsistencies[0].type).toBe('symbol_mismatch');
    });

    it('reports all mismatches when nothing matches', () => {
      const result = verifier.compareAssetMetadata(validAsset, {
        ...target,
        assetCode: 'BTC',
        issuer: 'GABC',
        decimals: 8,
        symbol: 'BITCOIN',
      });
      expect(result.matches).toBe(false);
      expect(result.inconsistencies).toHaveLength(4);
    });
  });

  describe('generateReport', () => {
    it('generates a correct report with valid results', () => {
      const assetResult = verifier.validateAssetMetadata(validAsset);
      const providerResult = verifier.validateProviderMetadata(validProvider);
      const comparison = verifier.compareAssetMetadata(validAsset, validAsset);

      const report = verifier.generateReport(
        [assetResult],
        [providerResult],
        [comparison],
      );

      expect(report.totalVerified).toBe(3);
      expect(report.totalValid).toBe(3);
      expect(report.totalInvalid).toBe(0);
      expect(report.totalWarnings).toBe(0);
      expect(report.totalInconsistencies).toBe(0);
    });

    it('generates a correct report with invalid results', () => {
      const badAsset = verifier.validateAssetMetadata({ ...validAsset, assetCode: '' });
      const badProvider = verifier.validateProviderMetadata({ ...validProvider, network: 'bad' });
      const badComparison = verifier.compareAssetMetadata(
        validAsset,
        { ...validAsset, assetCode: 'DIFF' },
      );

      const report = verifier.generateReport(
        [badAsset],
        [badProvider],
        [badComparison],
      );

      expect(report.totalVerified).toBe(3);
      expect(report.totalValid).toBe(0);
      expect(report.totalInvalid).toBe(3);
      expect(report.totalWarnings).toBe(0);
      expect(report.totalInconsistencies).toBe(1);
    });

    it('sets verifiedAt timestamp', () => {
      const report = verifier.generateReport([], [], []);
      expect(report.verifiedAt).toBeGreaterThan(0);
    });
  });

  describe('constructor', () => {
    it('accepts custom config', () => {
      const custom = new MetadataVerifier({
        allowedNetworks: ['customnet'],
        maxAssetCodeLength: 4,
      });
      const result = custom.validateProviderMetadata({
        ...validProvider,
        network: 'customnet',
        supportedAssets: ['ABCDE'],
      });
      expect(result.isValid).toBe(true);
    });
  });
});
