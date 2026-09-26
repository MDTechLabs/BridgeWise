export interface StellarRoute {
  routeId: string;
  sourceChain: string;
  destinationChain: string;
  bridgeName: string;
  sourceAsset: StellarAsset;
  destinationAsset: string;
  available: boolean;
  minAmount?: string;
  maxAmount?: string;
  estimatedTime?: number;
  fees?: Record<string, string>;
  scannedAt: number;
  metadata?: Record<string, unknown>;
}

export interface StellarAsset {
  code: string;
  issuer?: string;
}

export interface StellarRouteAvailabilityScannerConfig {
  supportedBridges?: string[];
  supportedSourceChains?: string[];
  supportedDestinationChains?: string[];
  scanIntervalMs?: number;
  ttlMs?: number;
  cacheSize?: number;
}

export interface StellarRouteAvailabilityFilter {
  routeId?: string;
  sourceChain?: string;
  destinationChain?: string;
  bridgeName?: string;
  sourceAsset?: string;
  destinationAsset?: string;
  available?: boolean;
  minScannedAt?: number;
  maxScannedAt?: number;
}

export interface StellarRouteAvailabilityQueryOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'scannedAt';
  order?: 'asc' | 'desc';
}

export interface StellarRouteAvailabilityQueryResult {
  total: number;
  items: StellarRoute[];
}

export class StellarRouteAvailabilityScanner {
  private readonly routes = new Map<string, StellarRoute>();
  private readonly insertionOrder: string[] = [];
  private readonly config: Required<StellarRouteAvailabilityScannerConfig>;
  private scanTimer?: ReturnType<typeof setInterval>;

  constructor(config: StellarRouteAvailabilityScannerConfig = {}) {
    this.config = {
      supportedBridges: config.supportedBridges ?? ['stellar', 'soroban'],
      supportedSourceChains: config.supportedSourceChains ?? ['stellar', 'ethereum', 'polygon'],
      supportedDestinationChains: config.supportedDestinationChains ?? ['stellar', 'ethereum', 'polygon'],
      scanIntervalMs: config.scanIntervalMs ?? 30000,
      ttlMs: config.ttlMs ?? 60000,
      cacheSize: config.cacheSize ?? 1000,
    };
  }

  scanRoute(route: Omit<StellarRoute, 'scannedAt'>): StellarRoute {
    const scannedRoute: StellarRoute = {
      ...route,
      scannedAt: Date.now(),
    };

    const exists = this.routes.has(scannedRoute.routeId);
    this.routes.set(scannedRoute.routeId, scannedRoute);

    if (!exists) {
      this.insertionOrder.push(scannedRoute.routeId);
      this.enforceCacheSize();
    }

    return scannedRoute;
  }

  bulkScanRoutes(routes: Omit<StellarRoute, 'scannedAt'>[]): StellarRoute[] {
    return routes.map((route) => this.scanRoute(route));
  }

  getRoute(routeId: string): StellarRoute | null {
    return this.routes.get(routeId) ?? null;
  }

  hasRoute(routeId: string): boolean {
    return this.routes.has(routeId);
  }

  removeRoute(routeId: string): boolean {
    const removed = this.routes.delete(routeId);
    if (removed) {
      const index = this.insertionOrder.indexOf(routeId);
      if (index !== -1) {
        this.insertionOrder.splice(index, 1);
      }
    }
    return removed;
  }

  clear(): void {
    this.routes.clear();
    this.insertionOrder.length = 0;
  }

  queryRoutes(
    filter: StellarRouteAvailabilityFilter = {},
    options: StellarRouteAvailabilityQueryOptions = {},
  ): StellarRouteAvailabilityQueryResult {
    const entries = this.insertionOrder
      .map((routeId) => this.routes.get(routeId))
      .filter((item): item is StellarRoute => Boolean(item));

    const filtered = entries.filter((route) => this.matchesFilter(route, filter));

    const sorted = filtered.slice().sort((a, b) => {
      const order = options.order === 'asc' ? 1 : -1;
      if (options.sortBy === 'scannedAt') {
        return order * (a.scannedAt - b.scannedAt);
      }
      return order * (a.scannedAt - b.scannedAt);
    });

    const offset = Math.max(0, options.offset ?? 0);
    const limit = options.limit != null ? Math.max(0, options.limit) : sorted.length;
    const items = sorted.slice(offset, offset + limit);

    return {
      total: filtered.length,
      items,
    };
  }

  startScanning(scanFn: () => Promise<StellarRoute[]>): void {
    if (this.scanTimer) {
      return;
    }

    const runScan = async () => {
      try {
        const routes = await scanFn();
        this.bulkScanRoutes(routes);
      } catch {
        // Scan errors are silently ignored to avoid breaking the scanner loop
      }
    };

    runScan();
    this.scanTimer = setInterval(runScan, this.config.scanIntervalMs);
    if (typeof (this.scanTimer as { unref?: () => void }).unref === 'function') {
      (this.scanTimer as { unref: () => void }).unref();
    }
  }

  stopScanning(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = undefined;
    }
  }

  private matchesFilter(route: StellarRoute, filter: StellarRouteAvailabilityFilter): boolean {
    if (filter.routeId && route.routeId !== filter.routeId) {
      return false;
    }
    if (filter.sourceChain && route.sourceChain !== filter.sourceChain) {
      return false;
    }
    if (filter.destinationChain && route.destinationChain !== filter.destinationChain) {
      return false;
    }
    if (filter.bridgeName && route.bridgeName !== filter.bridgeName) {
      return false;
    }
    if (filter.sourceAsset && route.sourceAsset.code !== filter.sourceAsset) {
      return false;
    }
    if (filter.destinationAsset && route.destinationAsset !== filter.destinationAsset) {
      return false;
    }
    if (filter.available !== undefined && route.available !== filter.available) {
      return false;
    }
    if (filter.minScannedAt != null && route.scannedAt < filter.minScannedAt) {
      return false;
    }
    if (filter.maxScannedAt != null && route.scannedAt > filter.maxScannedAt) {
      return false;
    }
    return true;
  }

  private enforceCacheSize(): void {
    while (this.routes.size > this.config.cacheSize) {
      const oldestKey = this.insertionOrder.shift();
      if (oldestKey) {
        this.routes.delete(oldestKey);
      } else {
        break;
      }
    }
  }
}

export const stellarRouteAvailabilityScanner = new StellarRouteAvailabilityScanner();