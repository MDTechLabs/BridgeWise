import { CrossChainAssetRelationshipEngine } from './asset-relationship-engine';
import { NativeAsset, WrappedAsset } from './types';

const USDC_NATIVE: NativeAsset = {
  chain: 'stellar',
  code: 'USDC',
  issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  decimals: 7,
};

const USDC_ETH: WrappedAsset = {
  chain: 'ethereum',
  code: 'USDC',
  contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  decimals: 6,
  bridgeProtocol: 'Allbridge',
};

const USDC_POLYGON: WrappedAsset = {
  chain: 'polygon',
  code: 'USDC',
  contractAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  decimals: 6,
  bridgeProtocol: 'Allbridge',
};

describe('CrossChainAssetRelationshipEngine', () => {
  let engine: CrossChainAssetRelationshipEngine;

  beforeEach(() => {
    engine = new CrossChainAssetRelationshipEngine();
  });

  it('registers an asset relationship', () => {
    const rel = engine.register(USDC_NATIVE, [USDC_ETH], 'USDC');
    expect(rel.canonicalSymbol).toBe('USDC');
    expect(rel.native.code).toBe('USDC');
    expect(rel.wrapped).toHaveLength(1);
  });

  it('looks up by native asset', () => {
    engine.register(USDC_NATIVE, [USDC_ETH], 'USDC');
    const result = engine.lookupByNative('stellar', 'USDC', USDC_NATIVE.issuer);
    expect(result.found).toBe(true);
    expect(result.matchedOn).toBe('native');
  });

  it('looks up by wrapped asset', () => {
    engine.register(USDC_NATIVE, [USDC_ETH], 'USDC');
    const result = engine.lookupByWrapped('ethereum', USDC_ETH.contractAddress);
    expect(result.found).toBe(true);
    expect(result.matchedOn).toBe('wrapped');
  });

  it('looks up by symbol', () => {
    engine.register(USDC_NATIVE, [USDC_ETH], 'USDC');
    const results = engine.lookupBySymbol('usdc');
    expect(results).toHaveLength(1);
  });

  it('merges wrapped assets on re-registration', () => {
    engine.register(USDC_NATIVE, [USDC_ETH], 'USDC');
    engine.register(USDC_NATIVE, [USDC_POLYGON], 'USDC');
    const result = engine.lookupByNative('stellar', 'USDC', USDC_NATIVE.issuer);
    expect(result.relationship?.wrapped).toHaveLength(2);
  });

  it('returns not found for unknown asset', () => {
    const result = engine.lookupByNative('stellar', 'EURC');
    expect(result.found).toBe(false);
    expect(result.matchedOn).toBeNull();
  });

  it('reports stats correctly', () => {
    engine.register(USDC_NATIVE, [USDC_ETH, USDC_POLYGON], 'USDC');
    const stats = engine.stats();
    expect(stats.totalRelationships).toBe(1);
    expect(stats.wrappedAssetCount).toBe(2);
    expect(stats.chainCoverage).toContain('stellar');
  });

  it('removes a relationship', () => {
    const rel = engine.register(USDC_NATIVE, [USDC_ETH], 'USDC');
    expect(engine.remove(rel.id)).toBe(true);
    expect(engine.getAll()).toHaveLength(0);
  });
});
