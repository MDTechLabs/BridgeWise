import {
  AssetCompatibilityResult,
  StellarAsset,
  AssetCompatibilityScannerConfig,
} from './asset-compatibility-scanner.types';
import {
  StellarAssetCompatibilityScanner,
  DEFAULT_SOURCE_ASSETS,
  DEFAULT_DESTINATION_ASSETS,
  parseStellarAsset,
  isNativeStellarAsset,
  isSameStellarAsset,
  validateStellarAssetCode,
  validateStellarIssuer,
} from './asset-compatibility-scanner';

describe('StellarAssetCompatibilityScanner', () => {
  const scanner = new StellarAssetCompatibilityScanner();
  const baseConfig: AssetCompatibilityScannerConfig = {
    supportedSourceAssets: [
      { code: 'USDC', issuer: 'GA_USDC_ISSUER' },
      { code: 'EURC', issuer: 'GA_EURC_ISSUER' },
      { code: 'XLM' },
      { code: 'USDT', issuer: 'GA_USDT_ISSUER' },
    ],
    supportedDestinationAssets: ['USDC', 'EURC', 'XLM', 'USDT'],
  };

  // ─── route without asset ────────────────────────────────────────────────────

  it('marks a route without an asset as compatible with warnings', () => {
    const results = scanner.scan([
      { routeId: 'route-1' },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].compatible).toBe(true);
    expect(results[0].sourceAsset).toBeNull();
    expect(results[0].sourceAssetValid).toBe(false);
    expect(results[0].destinationAsset).toBeNull();
    expect(results[0].destinationAssetValid).toBe(false);
  });

  // ─── source asset validation ───────────────────────────────────────────────

  it('accepts native XLM as a valid source asset', () => {
    const results = scanner.scan([
      { routeId: 'route-1', asset: 'XLM' },
    ]);

    expect(results[0].compatible).toBe(true);
    expect(results[0].sourceAssetValid).toBe(true);
    expect(results[0].sourceAsset?.code).toBe('XLM');
    expect(results[0].destinationAssetValid).toBe(true);
  });

  it('accepts a supported non-native source asset', () => {
    const customScanner = new StellarAssetCompatibilityScanner({
      supportedSourceAssets: [
        { code: 'USDC', issuer: 'GA_USDC_ISSUER' },
      ],
      supportedDestinationAssets: ['USDC'],
    });

    const results = customScanner.scan([
      { routeId: 'route-1', asset: 'USDC:GA_USDC_ISSUER' },
    ]);

    expect(results[0].compatible).toBe(true);
    expect(results[0].sourceAssetValid).toBe(true);
    expect(results[0].sourceAsset?.code).toBe('USDC');
    expect(results[0].sourceAsset?.issuer).toBe('GA_USDC_ISSUER');
  });

  it('rejects an unsupported source asset', () => {
    const results = scanner.scan([
      { routeId: 'route-1', asset: 'XYZ:GA_UNKNOWN' },
    ]);

    expect(results[0].compatible).toBe(false);
    expect(results[0].sourceAssetValid).toBe(false);
    expect(results[0].issues.length).toBeGreaterThan(0);
  });

  it('rejects an asset with an invalid code', () => {
    const results = scanner.scan([
      { routeId: 'route-1', asset: 'ABCDEFGHIJKLM:GA_ISSUER' },
    ]);

    expect(results[0].compatible).toBe(false);
    expect(results[0].issues.some((i) => i.includes('Invalid asset code'))).toBe(true);
  });

  it('rejects an asset with an invalid issuer format', () => {
    const results = scanner.scan([
      { routeId: 'route-1', asset: 'USDC:INVALID_ISSUER' },
    ]);

    expect(results[0].compatible).toBe(false);
    expect(results[0].issues.some((i) => i.includes('Invalid issuer'))).toBe(true);
  });

  // ─── destination asset validation ──────────────────────────────────────────

  it('accepts a destination asset present in supported list', () => {
    const customScanner = new StellarAssetCompatibilityScanner({
      supportedSourceAssets: [],
      supportedDestinationAssets: ['USDC', 'ETH'],
    });

    const results = customScanner.scan([
      { routeId: 'route-1', asset: 'USDC:GA_USDC_ISSUER' },
    ]);

    expect(results[0].destinationAssetValid).toBe(true);
    expect(results[0].compatible).toBe(true);
  });

  it('rejects a destination asset not in supported list', () => {
    const customScanner = new StellarAssetCompatibilityScanner({
      supportedSourceAssets: [],
      supportedDestinationAssets: ['XLM'],
    });

    const results = customScanner.scan([
      { routeId: 'route-1', asset: 'USDC:GA_USDC_ISSUER' },
    ]);

    expect(results[0].destinationAssetValid).toBe(false);
    expect(results[0].compatible).toBe(false);
  });

  // ─── filterIncompatibleRoutes ───────────────────────────────────────────────

  it('filters out routes with incompatible assets', () => {
    const routes = [
      { routeId: 'ok-1', asset: 'XLM' },
      { routeId: 'bad-1', asset: 'XYZ:GA_UNKNOWN' },
      { routeId: 'ok-2', asset: 'USDC:GA_USDC_ISSUER' },
    ];

    const customScanner = new StellarAssetCompatibilityScanner({
      supportedSourceAssets: [
        { code: 'USDC', issuer: 'GA_USDC_ISSUER' },
      ],
      supportedDestinationAssets: ['XLM', 'USDC'],
    });

    const filtered = customScanner.filterIncompatibleRoutes(routes);
    const ids = filtered.map((r) => r.routeId);

    expect(ids).not.toContain('bad-1');
    expect(ids).toContain('ok-1');
    expect(ids).toContain('ok-2');
  });

  it('leaves an empty array unchanged', () => {
    expect(scanner.filterIncompatibleRoutes([])).toEqual([]);
  });

  // ─── utility functions ─────────────────────────────────────────────────────

  it('isNativeStellarAsset detects XLM', () => {
    expect(isNativeStellarAsset('XLM')).toBe(true);
    expect(isNativeStellarAsset({ code: 'XLM' })).toBe(true);
    expect(isNativeStellarAsset('USDC')).toBe(false);
    expect(isNativeStellarAsset({ code: 'USDC', issuer: 'GABC' })).toBe(false);
  });

  it('isSameStellarAsset compares code and issuer', () => {
    expect(isSameStellarAsset({ code: 'USDC', issuer: 'GA1' }, { code: 'USDC', issuer: 'GA1' })).toBe(true);
    expect(isSameStellarAsset({ code: 'USDC', issuer: 'GA1' }, { code: 'USDC', issuer: 'GA2' })).toBe(false);
    expect(isSameStellarAsset({ code: 'XLM' }, { code: 'XLM' })).toBe(true);
  });

  it('validateStellarAssetCode accepts valid codes', () => {
    expect(validateStellarAssetCode('USDC')).toBe(true);
    expect(validateStellarAssetCode('A')).toBe(true);
    expect(validateStellarAssetCode('ABCD1234')).toBe(true);
    expect(validateStellarAssetCode('')).toBe(false);
    expect(validateStellarAssetCode('ABCDEFGHIJKLM')).toBe(false);
    expect(validateStellarAssetCode('USDC!')).toBe(false);
  });

  it('validateStellarIssuer accepts G-prefixed 56-char keys', () => {
    expect(validateStellarIssuer('')).toBe(true);
    expect(validateStellarIssuer('GA'.padEnd(56, 'X'))).toBe(true);
    expect(validateStellarIssuer('GABC')).toBe(false);
    expect(validateStellarIssuer('GA'.padEnd(55, 'X'))).toBe(false);
  });

  it('parseStellarAsset parses native, code-only, and code:issuer forms', () => {
    expect(parseStellarAsset('XLM')).toEqual({ code: 'XLM' });
    expect(parseStellarAsset('  USDC  ')).toEqual({ code: 'USDC' });
    expect(parseStellarAsset('USDC:GA_USDC_ISSUER')).toEqual({ code: 'USDC', issuer: 'GA_USDC_ISSUER' });
    expect(parseStellarAsset('')).toBeNull();
    expect(parseStellarAsset('  ')).toBeNull();
  });

  // ─── custom configuration ──────────────────────────────────────────────────

  it('uses custom supported assets when provided', () => {
    const customScanner = new StellarAssetCompatibilityScanner({
      supportedSourceAssets: [{ code: 'CUSTOM', issuer: 'GA_CUSTOM' }],
      supportedDestinationAssets: ['CUSTOM'],
    });

    const results = customScanner.scan([
      { routeId: 'route-1', asset: 'CUSTOM:GA_CUSTOM' },
    ]);

    expect(results[0].compatible).toBe(true);
  });
});
