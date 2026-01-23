import { BridgeAdapter } from './adapters/base';
import { HopAdapter } from './adapters/hop';
import { LayerZeroAdapter } from './adapters/layerzero';
import { StellarAdapter } from './adapters/stellar';
import { RouteRequest, AggregatedRoutes, BridgeRoute, BridgeError } from './types';
import { BridgeValidator, BridgeExecutionRequest, ValidationResult } from './validator';
import { RouteRanker, RankingWeights, DEFAULT_RANKING_WEIGHTS } from './ranker';

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
  /** Route ranking weights (default: balanced) */
  rankingWeights?: RankingWeights;
}

/**
 * Central aggregator for collecting and unifying bridge routes from multiple providers
 */
export class BridgeAggregator {
  private adapters: BridgeAdapter[];
  private readonly timeout: number;
  private readonly validator: BridgeValidator;
  private readonly ranker: RouteRanker;
  
  constructor(config: AggregatorConfig = {}) {
    this.timeout = config.timeout || 15000;
    this.adapters = config.adapters || [];
    this.validator = new BridgeValidator();
    this.ranker = new RouteRanker(config.rankingWeights);
    
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
    const sortedRoutes = this.ranker.rankRoutes(normalizedRoutes);
    
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
        reliability: route.reliability ?? this.calculateReliability(route),
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
   * Calculate reliability score based on provider and metadata
   */
  private calculateReliability(route: BridgeRoute): number {
    // Base reliability by provider (can be adjusted based on real data)
    const providerReliability: Record<string, number> = {
      stellar: 0.95,  // High reliability for established protocol
      layerzero: 0.90, // Good reliability
      hop: 0.85,      // Slightly lower due to optimism-specific
    };
    
    let reliability = providerReliability[route.provider] || 0.8;
    
    // Adjust based on risk level if available
    if (route.metadata?.riskLevel) {
      // Risk level 1-5, where 1 is safest
      // Convert to reliability: risk 1 = 0.95, risk 5 = 0.75
      const riskAdjustment = (6 - route.metadata.riskLevel) * 0.05;
      reliability = Math.min(reliability, riskAdjustment);
    }
    
    return Math.max(0, Math.min(1, reliability));
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
   * Update ranking weights for route prioritization
   */
  updateRankingWeights(weights: Partial<RankingWeights>): void {
    this.ranker.updateWeights(weights);
  }

  /**
   * Get current ranking weights
   */
  getRankingWeights(): RankingWeights {
    return this.ranker.getWeights();
  }
}
