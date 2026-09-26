import {
  BridgeRoute,
  AssetRouteEntry,
  RouteMatrix,
  RouteMatrixStats,
  RouteQuery,
  RouteMatrixExport,
  AssetChain,
} from './types';

/**
 * Maps available routes for every supported asset.
 *
 * The route matrix provides a two-dimensional view: assets on one axis,
 * available bridge routes on the other. It supports querying by asset,
 * chain pair, protocol, and provider, and can export the full matrix
 * as a JSON structure for external consumption.
 *
 * Usage:
 *   const matrix = new StellarAssetRouteMatrix();
 *   matrix.registerRoute(usdcRoute);
 *   const routes = matrix.getRoutesForAsset('USDC');
 *   const exportData = matrix.exportMatrix();
 */
export class StellarAssetRouteMatrix {
  private readonly routes: Map<string, BridgeRoute> = new Map();
  private readonly assetIndex: Map<string, Set<string>> = new Map();

  // ─── Registration ──────────────────────────────────────────────────────

  /**
   * Register a bridge route. If a route with the same id already exists,
   * it is overwritten with the new data.
   *
   * The route is automatically indexed by each of its supported assets.
   */
  registerRoute(route: BridgeRoute): void {
    this.routes.set(route.id, { ...route });

    // Index by supported assets
    for (const asset of route.supportedAssets) {
      const upper = asset.toUpperCase();
      let routeIds = this.assetIndex.get(upper);
      if (!routeIds) {
        routeIds = new Set();
        this.assetIndex.set(upper, routeIds);
      }
      routeIds.add(route.id);
    }
  }

  /**
   * Register multiple routes at once.
   */
  registerRoutes(routes: BridgeRoute[]): void {
    for (const route of routes) {
      this.registerRoute(route);
    }
  }

  /**
   * Remove a route by id. Returns true if the route existed.
   */
  removeRoute(routeId: string): boolean {
    const route = this.routes.get(routeId);
    if (!route) return false;

    // Remove from asset index
    for (const asset of route.supportedAssets) {
      const upper = asset.toUpperCase();
      const routeIds = this.assetIndex.get(upper);
      if (routeIds) {
        routeIds.delete(routeId);
        if (routeIds.size === 0) {
          this.assetIndex.delete(upper);
        }
      }
    }

    return this.routes.delete(routeId);
  }

  // ─── Query ─────────────────────────────────────────────────────────────

  /**
   * Get all available routes for a specific asset.
   */
  getRoutesForAsset(asset: string): BridgeRoute[] {
    const routeIds = this.assetIndex.get(asset.toUpperCase());
    if (!routeIds) return [];

    return Array.from(routeIds)
      .map((id) => this.routes.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get an asset's route entry with availability counts.
   */
  getAssetRouteEntry(asset: string): AssetRouteEntry | null {
    const routes = this.getRoutesForAsset(asset);
    if (routes.length === 0) return null;

    const available = routes.filter((r) => r.available);

    return {
      asset: asset.toUpperCase(),
      routes,
      availableCount: available.length,
      totalCount: routes.length,
    };
  }

  /**
   * Get routes between two specific chains.
   */
  getRoutesBetweenChains(fromChain: AssetChain, toChain: AssetChain): BridgeRoute[] {
    return Array.from(this.routes.values()).filter(
      (r) => r.fromChain === fromChain && r.toChain === toChain,
    );
  }

  /**
   * Query routes with flexible filters.
   */
  queryRoutes(query: RouteQuery = {}): BridgeRoute[] {
    let results = Array.from(this.routes.values());

    if (query.fromChain) {
      results = results.filter((r) => r.fromChain === query.fromChain);
    }
    if (query.toChain) {
      results = results.filter((r) => r.toChain === query.toChain);
    }
    if (query.bridgeProtocol) {
      results = results.filter((r) => r.bridgeProtocol === query.bridgeProtocol);
    }
    if (query.provider) {
      results = results.filter((r) => r.provider === query.provider);
    }
    if (query.status) {
      results = results.filter((r) => r.status === query.status);
    }
    if (query.availableOnly) {
      results = results.filter((r) => r.available && r.status === 'active');
    }

    return results;
  }

  /**
   * Get a single route by id.
   */
  getRoute(routeId: string): BridgeRoute | undefined {
    return this.routes.get(routeId);
  }

  /**
   * Check if an asset has any available (active) routes.
   */
  hasRoutes(asset: string): boolean {
    const routes = this.getRoutesForAsset(asset);
    return routes.some((r) => r.available && r.status === 'active');
  }

  // ─── Matrix Export ─────────────────────────────────────────────────────

  /**
   * Generate the full route matrix.
   */
  getMatrix(): RouteMatrix {
    const assets: Record<string, AssetRouteEntry> = {};
    const bridgeProtocols = new Set<string>();
    const providers = new Set<string>();
    const chains = new Set<AssetChain>();
    let totalRoutes = 0;

    for (const [asset] of this.assetIndex) {
      const entry = this.getAssetRouteEntry(asset);
      if (entry) {
        assets[asset] = entry;
        totalRoutes += entry.totalCount;

        for (const route of entry.routes) {
          bridgeProtocols.add(route.bridgeProtocol);
          providers.add(route.provider);
          chains.add(route.fromChain);
          chains.add(route.toChain);
        }
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      assets,
      totalAssets: Object.keys(assets).length,
      totalRoutes,
      bridgeProtocols: Array.from(bridgeProtocols).sort(),
      providers: Array.from(providers).sort(),
      chains: Array.from(chains).sort(),
    };
  }

  /**
   * Export the route matrix as a versioned JSON structure.
   */
  exportMatrix(): RouteMatrixExport {
    const matrix = this.getMatrix();

    return {
      version: '1.0.0',
      matrix,
      metadata: {
        exportedAt: new Date().toISOString(),
        totalAssets: matrix.totalAssets,
        totalRoutes: matrix.totalRoutes,
      },
    };
  }

  // ─── Introspection ─────────────────────────────────────────────────────

  /**
   * Get summary statistics about the route matrix.
   */
  stats(): RouteMatrixStats {
    const matrix = this.getMatrix();

    const activeRoutes = this.queryRoutes({ availableOnly: true }).length;
    const inactiveRoutes = matrix.totalRoutes - activeRoutes;
    const chainPairs = new Set<string>();

    for (const route of this.routes.values()) {
      chainPairs.add(`${route.fromChain}→${route.toChain}`);
    }

    let assetWithMostRoutes: RouteMatrixStats['assetWithMostRoutes'] = null;
    let assetWithFewestRoutes: RouteMatrixStats['assetWithFewestRoutes'] = null;

    for (const [asset, entry] of Object.entries(matrix.assets)) {
      if (
        !assetWithMostRoutes ||
        entry.totalCount > assetWithMostRoutes.count
      ) {
        assetWithMostRoutes = { asset, count: entry.totalCount };
      }
      if (
        !assetWithFewestRoutes ||
        entry.totalCount < assetWithFewestRoutes.count
      ) {
        assetWithFewestRoutes = { asset, count: entry.totalCount };
      }
    }

    return {
      totalAssets: matrix.totalAssets,
      totalRoutes: matrix.totalRoutes,
      activeRoutes,
      inactiveRoutes,
      totalProviders: matrix.providers.length,
      totalProtocols: matrix.bridgeProtocols.length,
      chainPairs: chainPairs.size,
      assetWithMostRoutes,
      assetWithFewestRoutes,
    };
  }

  /** Total number of registered routes. */
  get routeCount(): number {
    return this.routes.size;
  }

  /** Total number of unique assets with registered routes. */
  get assetCount(): number {
    return this.assetIndex.size;
  }

  /** All unique supported assets. */
  get assets(): string[] {
    return Array.from(this.assetIndex.keys()).sort();
  }

  /** All registered routes. */
  getAllRoutes(): BridgeRoute[] {
    return Array.from(this.routes.values());
  }
}
