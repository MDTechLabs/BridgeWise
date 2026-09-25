import { StellarAssetMetadataResolver } from './asset-metadata-resolver';

describe('StellarAssetMetadataResolver', () => {
  it('normalizes identifiers and caches metadata', () => {
    const resolver = new StellarAssetMetadataResolver();
    const resolved = resolver.resolve(
      'usdc',
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      'testnet',
    );

    expect(resolved.assetCode).toBe('USDC');
    expect(resolved.network).toBe('testnet');
    expect(
      resolver.getCached(
        'usdc',
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        'testnet',
      ),
    ).toEqual(resolved);
  });

  it('rejects invalid issuer metadata', () => {
    const resolver = new StellarAssetMetadataResolver();

    expect(() => resolver.resolve('USDC', 'invalid-issuer', 'public')).toThrow(
      'Invalid issuer information',
    );
  });
});
