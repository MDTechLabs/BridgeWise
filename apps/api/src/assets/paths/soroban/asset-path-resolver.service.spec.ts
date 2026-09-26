import { AssetPathResolverService } from './asset-path-resolver.service';
import { Asset, PathResolutionCode } from './asset-path.types';

const XLM: Asset = { code: 'XLM' };
const USDC: Asset = { code: 'USDC', issuer: 'GA_USDC' };
const EURC: Asset = { code: 'EURC', issuer: 'GA_EURC' };
const AQUA: Asset = { code: 'AQUA', issuer: 'GA_AQUA' };
const UNKNOWN: Asset = { code: 'FOO', issuer: 'GA_FOO' };

describe('AssetPathResolverService', () => {
  let service: AssetPathResolverService;

  beforeEach(() => {
    service = new AssetPathResolverService({ maxHops: 3, maxPaths: 5 });
    // XLM <-> USDC <-> EURC ; USDC -> AQUA
    service.registerEdge(XLM, USDC);
    service.registerEdge(USDC, XLM);
    service.registerEdge(USDC, EURC);
    service.registerEdge(EURC, USDC);
    service.registerEdge(USDC, AQUA);
  });

  it('resolves a direct path', () => {
    const r = service.resolvePaths(XLM, USDC);
    expect(r.resolved).toBe(true);
    expect(r.paths[0].hops).toBe(1);
    expect(r.paths[0].path.map((a) => a.code)).toEqual(['XLM', 'USDC']);
  });

  it('resolves a multi-hop path through supported intermediaries', () => {
    const r = service.resolvePaths(XLM, EURC);
    expect(r.resolved).toBe(true);
    expect(r.paths[0].path.map((a) => a.code)).toEqual(['XLM', 'USDC', 'EURC']);
    expect(r.paths[0].hops).toBe(2);
  });

  it('returns shortest path first', () => {
    const r = service.resolvePaths(XLM, AQUA);
    expect(r.paths[0].hops).toBe(2); // XLM -> USDC -> AQUA
  });

  it('rejects an unsupported source', () => {
    const r = service.resolvePaths(UNKNOWN, USDC);
    expect(r.resolved).toBe(false);
    expect(r.reason).toBe(PathResolutionCode.UNSUPPORTED_SOURCE);
  });

  it('rejects an unsupported destination', () => {
    const r = service.resolvePaths(XLM, UNKNOWN);
    expect(r.resolved).toBe(false);
    expect(r.reason).toBe(PathResolutionCode.UNSUPPORTED_DESTINATION);
  });

  it('reports NO_PATH when nodes are supported but disconnected', () => {
    service.registerAsset({ code: 'ISOLATED', issuer: 'GA_ISO' });
    const r = service.resolvePaths(XLM, { code: 'ISOLATED', issuer: 'GA_ISO' });
    expect(r.resolved).toBe(false);
    expect(r.reason).toBe(PathResolutionCode.NO_PATH);
  });

  it('does not exceed the configured max hops', () => {
    const limited = new AssetPathResolverService({ maxHops: 1 });
    limited.registerEdge(XLM, USDC);
    limited.registerEdge(USDC, EURC);
    const r = limited.resolvePaths(XLM, EURC);
    expect(r.resolved).toBe(false);
  });
});
