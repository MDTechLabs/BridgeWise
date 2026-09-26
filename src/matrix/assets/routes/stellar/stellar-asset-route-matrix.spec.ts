import { StellarAssetRouteMatrix } from './stellar-asset-route-matrix';
import { BridgeRoute } from './types';

const makeRoute = (overrides: Partial<BridgeRoute> = {}): BridgeRoute => ({
  id: 'stellar-ethereum-allbridge-USDC',
  fromChain: 'stellar',
  toChain: 'ethereum',
  bridgeProtocol: 'Allbridge',
  provider: 'provider-a',
  supportedAssets: ['USDC'],
  estimatedTimeMinutes: 15,
  status: 'active',
  available: true,
  ...overrides,
});

describe('StellarAssetRouteMatrix', () => {
  let matrix: StellarAssetRouteMatrix;

  beforeEach(() => {
    matrix = new StellarAssetRouteMatrix();
  });

  // ─── Registration ──────────────────────────────────────────────────────

  it('registers a route and indexes it by asset', () => {
    const route = makeRoute();
    matrix.registerRoute(route);

    expect(matrix.routeCount).toBe(1);
    expect(matrix.assetCount).toBe(1);
    expect(matrix.hasRoutes('USDC')).toBe(true);
  });

  it('registers a route supporting multiple assets', () => {
    matrix.registerRoute(makeRoute({ supportedAssets: ['USDC', 'USDT', 'XLM'] }));
    expect(matrix.assetCount).toBe(3);
    expect(matrix.assets).toEqual(['USDC', 'USDT', 'XLM']);
  });

  it('registers multiple routes at once', () => {
    matrix.registerRoutes([
      makeRoute({ id: 'r1' }),
      makeRoute({ id: 'r2', fromChain: 'ethereum', toChain: 'polygon' }),
    ]);
    expect(matrix.routeCount).toBe(2);
  });

  it('overwrites an existing route on re-registration', () => {
    matrix.registerRoute(makeRoute({ id: 'r1', provider: 'old-provider' }));
    matrix.registerRoute(makeRoute({ id: 'r1', provider: 'new-provider' }));
    expect(matrix.getRoute('r1')?.provider).toBe('new-provider');
  });

  // ─── Query ─────────────────────────────────────────────────────────────

  it('returns routes for a specific asset', () => {
    matrix.registerRoute(makeRoute({ id: 'r1', supportedAssets: ['USDC'] }));
    matrix.registerRoute(makeRoute({ id: 'r2', supportedAssets: ['USDC'], bridgeProtocol: 'StellarX' }));
    matrix.registerRoute(makeRoute({ id: 'r3', supportedAssets: ['XLM'] }));

    const usdcRoutes = matrix.getRoutesForAsset('USDC');
    expect(usdcRoutes).toHaveLength(2);
  });

  it('returns empty array for unknown asset', () => {
    expect(matrix.getRoutesForAsset('UNKNOWN')).toEqual([]);
  });

  it('gets asset route entry with counts', () => {
    matrix.registerRoute(makeRoute({ id: 'r1', supportedAssets: ['USDC'], available: true }));
    matrix.registerRoute(makeRoute({ id: 'r2', supportedAssets: ['USDC'], available: false }));

    const entry = matrix.getAssetRouteEntry('USDC');
    expect(entry).not.toBeNull();
    expect(entry!.availableCount).toBe(1);
    expect(entry!.totalCount).toBe(2);
  });

  it('returns null for asset with no routes', () => {
    expect(matrix.getAssetRouteEntry('UNKNOWN')).toBeNull();
  });

  it('returns routes between specific chains', () => {
    matrix.registerRoute(makeRoute({ id: 'r1', fromChain: 'stellar', toChain: 'ethereum' }));
    matrix.registerRoute(makeRoute({ id: 'r2', fromChain: 'stellar', toChain: 'polygon' }));
    matrix.registerRoute(makeRoute({ id: 'r3', fromChain: 'ethereum', toChain: 'polygon' }));

    const routes = matrix.getRoutesBetweenChains('stellar', 'ethereum');
    expect(routes).toHaveLength(1);
    expect(routes[0].id).toBe('r1');
  });

  it('queries routes with filters', () => {
    matrix.registerRoute(makeRoute({ id: 'r1', bridgeProtocol: 'Allbridge', status: 'active', provider: 'p1' }));
    matrix.registerRoute(makeRoute({ id: 'r2', bridgeProtocol: 'StellarX', status: 'active', provider: 'p2' }));
    matrix.registerRoute(makeRoute({ id: 'r3', bridgeProtocol: 'Allbridge', status: 'inactive', provider: 'p1' }));

    const results = matrix.queryRoutes({
      bridgeProtocol: 'Allbridge',
      availableOnly: true,
    });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('r1');
  });

  // ─── Removal ───────────────────────────────────────────────────────────

  it('removes a route and cleans up the asset index', () => {
    matrix.registerRoute(makeRoute({ id: 'r1', supportedAssets: ['USDC'] }));
    expect(matrix.removeRoute('r1')).toBe(true);
    expect(matrix.routeCount).toBe(0);
    expect(matrix.assetCount).toBe(0);
  });

  it('returns false when removing unknown route', () => {
    expect(matrix.removeRoute('ghost')).toBe(false);
  });

  // ─── Matrix Export ─────────────────────────────────────────────────────

  it('generates the full route matrix', () => {
    matrix.registerRoute(makeRoute({
      id: 'r1',
      supportedAssets: ['USDC'],
      bridgeProtocol: 'Allbridge',
      provider: 'p1',
      fromChain: 'stellar',
      toChain: 'ethereum',
    }));
    matrix.registerRoute(makeRoute({
      id: 'r2',
      supportedAssets: ['XLM'],
      bridgeProtocol: 'StellarX',
      provider: 'p2',
      fromChain: 'stellar',
      toChain: 'polygon',
    }));

    const routeMatrix = matrix.getMatrix();
    expect(routeMatrix.totalAssets).toBe(2);
    expect(routeMatrix.totalRoutes).toBe(2);
    expect(routeMatrix.bridgeProtocols).toContain('Allbridge');
    expect(routeMatrix.bridgeProtocols).toContain('StellarX');
    expect(routeMatrix.providers).toContain('p1');
    expect(routeMatrix.providers).toContain('p2');
    expect(routeMatrix.chains).toContain('stellar');
  });

  it('exports the matrix as versioned JSON', () => {
    matrix.registerRoute(makeRoute());
    const exported = matrix.exportMatrix();
    expect(exported.version).toBe('1.0.0');
    expect(exported.metadata.totalAssets).toBe(1);
    expect(exported.matrix).toBeDefined();
  });

  // ─── Stats ─────────────────────────────────────────────────────────────

  it('reports stats correctly', () => {
    matrix.registerRoute(makeRoute({ id: 'r1', supportedAssets: ['USDC'], available: true }));
    matrix.registerRoute(makeRoute({
      id: 'r2',
      supportedAssets: ['USDC'],
      available: false,
      fromChain: 'ethereum',
      toChain: 'arbitrum',
    }));

    const stats = matrix.stats();
    expect(stats.totalAssets).toBe(1);
    expect(stats.totalRoutes).toBe(2);
    expect(stats.activeRoutes).toBe(1);
    expect(stats.inactiveRoutes).toBe(1);
    expect(stats.chainPairs).toBe(2);
    expect(stats.assetWithMostRoutes?.asset).toBe('USDC');
  });

  // ─── Edge cases ────────────────────────────────────────────────────────

  it('returns empty stats for empty matrix', () => {
    const stats = matrix.stats();
    expect(stats.totalAssets).toBe(0);
    expect(stats.totalRoutes).toBe(0);
    expect(stats.assetWithMostRoutes).toBeNull();
  });

  it('case-insensitive asset lookups', () => {
    matrix.registerRoute(makeRoute({ supportedAssets: ['USDC'] }));
    expect(matrix.hasRoutes('usdc')).toBe(true);
    expect(matrix.getRoutesForAsset('UsDc')).toHaveLength(1);
  });
});
