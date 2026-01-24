import { BridgeAdapter } from './adapters/base';
import { HopAdapter } from './adapters/hop';
import { LayerZeroAdapter } from './adapters/layerzero';
import { StellarAdapter } from './adapters/stellar';
import { RouteRequest, AggregatedRoutes, BridgeRoute, NormalizedRoute, BridgeError } from './types';
import { BridgeValidator, BridgeExecutionRequest, ValidationResult } from './validator';

/**
 * Configuration for the bridge aggregator
 */
export interface AggregatorConfig {
  /** Enable/disable specific bridge providers */
  providers?: {
    hop?: boolean;
    layerzero?: boolean;
    stellar?: boolean;
  };
  /** LayerZero API key (optional, but recommended for better quotes) */
  layerZeroApiKey?: string;
  /** Custom adapter instances (optional) */
  adapters?: BridgeAdapter[];
  /** Request timeout in milliseconds (default: 15000) */
  timeout?: number;
}

/**
 * Central aggregator for collecting and unifying bridge routes from multiple providers
 */
export class BridgeAggregator {
  private adapters: BridgeAdapter[];
  private readonly timeout: number;
  private readonly validator: BridgeValidator;
  
  constructor(config: AggregatorConfig = {}) {
    this.timeout = config.timeout || 15000;
    this.adapters = config.adapters || [];
    this.validator = new BridgeValidator();
    
    // Initialize default adapters if not provided
    if (this.adapters.length === 0) {
      const providers = config.providers || {};
      
      if (providers.hop !== false) {
        this.adapters.push(new HopAdapter());
      }
      
      if (providers.layerzero !== false) {
        this.adapters.push(new LayerZeroAdapter(
          undefined,
          undefined,
          config.layerZeroApiKey
        ));
      }
      
      if (providers.stellar !== false) {
        this.adapters.push(new StellarAdapter());
      }
    }
  }
  
  /**
   * Fetch and aggregate routes from all bridge providers
   * @param request Route request parameters
   * @returns Aggregated routes from all providers
   */
  async getRoutes(request: RouteRequest): Promise<AggregatedRoutes> {
    const startTime = Date.now();
    
    // Filter adapters that support this chain pair
    const supportedAdapters = this.adapters.filter(adapter =>
      adapter.supportsChainPair(request.sourceChain, request.targetChain)
    );
    
    if (supportedAdapters.length === 0) {
      return {
        routes: [],
        timestamp: Date.now(),
        providersQueried: 0,
        providersResponded: 0,
      };
    }
    
    // Fetch routes from all adapters in parallel for high performance
    const routePromises = supportedAdapters.map(adapter =>
      this.fetchRoutesWithTimeout(adapter, request)
    );
    
    const results = await Promise.allSettled(routePromises);
    
    // Collect successful routes and errors
    const routes: BridgeRoute[] = [];
    const errors: BridgeError[] = [];
    let providersResponded = 0;
    
    results.forEach((result, index) => {
      const adapter = supportedAdapters[index];
      
      if (result.status === 'fulfilled') {
        const adapterRoutes = result.value;
        if (adapterRoutes.length > 0) {
          routes.push(...adapterRoutes);
          providersResponded++;
        }
      } else {
        errors.push({
          provider: adapter.provider,
          error: result.reason?.message || 'Unknown error',
          code: result.reason?.code,
        });
      }
    });
    
    // Normalize and sort routes
    const normalizedRoutes = this.normalizeRoutes(routes);
    const sortedRoutes = this.sortRoutes(normalizedRoutes);
    
    return {
      routes: sortedRoutes,
      timestamp: Date.now(),
      providersQueried: supportedAdapters.length,
      providersResponded,
    };
  }
  
  /**
   * Fetch routes from a single adapter with timeout
   */
  private async fetchRoutesWithTimeout(
    adapter: BridgeAdapter,
    request: RouteRequest
  ): Promise<BridgeRoute[]> {
    return Promise.race([
      adapter.fetchRoutes(request),
      new Promise<BridgeRoute[]>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), this.timeout)
      ),
    ]);
  }
  
  /**
   * Normalize routes to ensure consistent data format
   */
  private normalizeRoutes(routes: BridgeRoute[]): NormalizedRoute[] {
    return routes.map((route, index) => {
      // For single-hop routes, create a hop from the route data
      const hops = route.hops || [{
        sourceChain: route.sourceChain,
        destinationChain: route.targetChain,
        tokenIn: (route.metadata?.tokenIn as string) || 'native', // Default to native if not specified
        tokenOut: (route.metadata?.tokenOut as string) || 'native',
        fee: route.fee,
        estimatedTime: route.estimatedTime,
        adapter: route.provider,
        metadata: route.metadata,
      }];

      // Aggregate total fees and estimated time from hops
      const totalFees = hops.reduce((sum, hop) => {
        try {
          return (BigInt(sum) + BigInt(hop.fee)).toString();
        } catch {
          return sum;
        }
      }, '0');

      const totalEstimatedTime = hops.reduce((sum, hop) => sum + hop.estimatedTime, 0);

      const normalized: NormalizedRoute = {
        id: route.id || `route-${Date.now()}-${index}`,
        sourceChain: route.sourceChain,
        destinationChain: route.targetChain,
        tokenIn: hops[0].tokenIn,
        tokenOut: hops[hops.length - 1].tokenOut,
        totalFees,
        estimatedTime: totalEstimatedTime,
        hops,
        adapter: route.provider,
        metadata: {
          ...route.metadata,
          normalized: true,
        },
      };

      return normalized;
    });
  }
  
  /**
   * Sort routes deterministically: lowest totalFees, fastest ETA, fewest hops
   */
  private sortRoutes(routes: NormalizedRoute[]): NormalizedRoute[] {
    return [...routes].sort((a, b) => {
      // Primary sort: lowest totalFees
      try {
        const feeDiff = BigInt(a.totalFees) - BigInt(b.totalFees);
        if (feeDiff !== 0n) {
          return feeDiff > 0n ? 1 : -1;
        }
      } catch {
        // If fee comparison fails, continue to next criteria
      }

      // Secondary sort: fastest ETA (lowest estimatedTime)
      const timeDiff = a.estimatedTime - b.estimatedTime;
      if (timeDiff !== 0) {
        return timeDiff;
      }

      // Tertiary sort: fewest hops
      const hopDiff = a.hops.length - b.hops.length;
      if (hopDiff !== 0) {
        return hopDiff;
      }

      // Stable sort: by id for deterministic ordering
      return a.id.localeCompare(b.id);
    });
  }
  
  /**
   * Calculate fee percentage
   */
  private calculateFeePercentage(inputAmount: string, outputAmount: string): number {
    try {
      const input = BigInt(inputAmount);
      const output = BigInt(outputAmount);
      
      if (input === 0n) return 0;
      
      const fee = input - output;
      const feePercentage = Number((fee * 10000n) / input) / 100;
      
      return Math.max(0, Math.min(100, feePercentage));
    } catch {
      return 0;
    }
  }
  
  /**
   * Get list of registered adapters
   */
  getAdapters(): BridgeAdapter[] {
    return [...this.adapters];
  }
  
  /**
   * Add a custom adapter
   */
  addAdapter(adapter: BridgeAdapter): void {
    this.adapters.push(adapter);
  }
  
  /**
   * Remove an adapter by provider name
   */
  removeAdapter(provider: string): void {
    this.adapters = this.adapters.filter(adapter => adapter.provider !== provider);
  }

  /**
   * Validate a bridge execution request before fetching routes
   * @param request Bridge execution request with user details
   * @returns Validation result with detailed error messages
   */
  validateRequest(request: BridgeExecutionRequest): ValidationResult {
    return this.validator.validateExecutionRequest(request);
  }

  /**
   * Validate a specific route before execution
   * @param route The route to validate
   * @param request The original execution request
   * @returns Validation result with detailed error messages
   */
  validateRoute(route: NormalizedRoute, request: BridgeExecutionRequest): ValidationResult {
    return this.validator.validateRoute(route, request);
  }

  /**
   * Get compatible target chains for a source chain
   * @param sourceChain The source chain
   * @returns Array of compatible target chains
   */
  getCompatibleChains(sourceChain: string): string[] {
    return this.validator.getCompatibleChains(sourceChain as any) || [];
  }
}
