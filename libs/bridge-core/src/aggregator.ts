import { BridgeAdapter } from './adapters/base';
import { HopAdapter } from './adapters/hop';
import { LayerZeroAdapter } from './adapters/layerzero';
import { StellarAdapter } from './adapters/stellar';
import { RouteRequest, AggregatedRoutes, BridgeRoute, BridgeError } from './types';
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
  private normalizeRoutes(routes: BridgeRoute[]): BridgeRoute[] {
    return routes.map((route, index) => {
      // Ensure all required fields are present
      const normalized: BridgeRoute = {
        id: route.id || `route-${Date.now()}-${index}`,
        provider: route.provider,
        sourceChain: route.sourceChain,
        targetChain: route.targetChain,
        inputAmount: route.inputAmount || '0',
        outputAmount: route.outputAmount || '0',
        fee: route.fee || '0',
        feePercentage: route.feePercentage ?? 0,
        estimatedTime: route.estimatedTime ?? 0,
        minAmountOut: route.minAmountOut || route.outputAmount || '0',
        maxAmountOut: route.maxAmountOut || route.outputAmount || '0',
        deadline: route.deadline,
        transactionData: route.transactionData,
        metadata: {
          ...route.metadata,
          normalized: true,
        },
      };
      
      // Recalculate fee percentage if needed
      if (normalized.feePercentage === 0 && normalized.inputAmount !== '0') {
        normalized.feePercentage = this.calculateFeePercentage(
          normalized.inputAmount,
          normalized.outputAmount
        );
      }
      
      return normalized;
    });
  }
  
  /**
   * Sort routes by best option (lowest fee percentage, then fastest time)
   */
  private sortRoutes(routes: BridgeRoute[]): BridgeRoute[] {
    return [...routes].sort((a, b) => {
      // Primary sort: fee percentage (lower is better)
      const feeDiff = a.feePercentage - b.feePercentage;
      if (Math.abs(feeDiff) > 0.01) {
        return feeDiff;
      }
      
      // Secondary sort: estimated time (faster is better)
      const timeDiff = a.estimatedTime - b.estimatedTime;
      if (timeDiff !== 0) {
        return timeDiff;
      }
      
      // Tertiary sort: output amount (higher is better)
      const outputDiff = BigInt(b.outputAmount) - BigInt(a.outputAmount);
      return outputDiff > 0n ? 1 : outputDiff < 0n ? -1 : 0;
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
  validateRoute(route: BridgeRoute, request: BridgeExecutionRequest): ValidationResult {
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
