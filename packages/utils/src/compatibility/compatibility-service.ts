/**
 * Token Pair Compatibility Service
 *
 * Main service that integrates the compatibility engine with the bridge aggregation layer.
 * Validates routes before fetching quotes and filters unsupported combinations.
 */

import {
  ChainId,
  BridgeProvider,
  RouteRequest,
  AggregatedRoutes,
} from '../types';
import {
  TokenPair,
  TokenPairValidationResult,
  RouteCompatibilityRequest,
  CompatibleRoute,
  TokenPairErrorCode,
} from './types';
import {
  RouteValidationEngine,
  ValidationEngineConfig,
} from './validation-engine';
import { TokenMappingRegistry } from './token-mapping-registry';
import { BridgeAggregator } from '../aggregator';

/**
 * Configuration for the compatibility service
 */
export interface CompatibilityServiceConfig {
  /** Validation engine configuration */
  validationConfig?: ValidationEngineConfig;
  /** Whether to filter invalid routes before aggregation */
  filterBeforeAggregation?: boolean;
  /** Whether to include validation metadata in responses */
  includeMetadata?: boolean;
  /** Default bridge providers to check */
  defaultProviders?: BridgeProvider[];
}

/**
 * Quote request with compatibility pre-check
 */
export interface CompatibilityQuoteRequest extends RouteRequest {
  /** Destination token address/symbol (optional, defaults to source token) */
  destinationTokenAddress?: string;
  /** Whether to allow wrapped token alternatives */
  allowWrappedTokens?: boolean;
  /** Preferred bridge providers */
  preferredBridges?: BridgeProvider[];
}

/**
 * Quote result with compatibility information
 */
export interface CompatibilityQuoteResult extends AggregatedRoutes {
  /** Validation results for each route */
  validationResults?: Map<string, TokenPairValidationResult>;
  /** Routes that were filtered out due to incompatibility */
  filteredRoutes?: Array<{
    bridge: BridgeProvider;
    reason: string;
    code: TokenPairErrorCode;
  }>;
  /** Alternative suggestions for invalid routes */
  alternatives?: CompatibleRoute[];
}

/**
 * Token Pair Compatibility Service
 *
 * Provides high-level API for:
 * - Pre-validating routes before quote fetching
 * - Filtering unsupported bridges from comparison
 * - Dynamic UI updates when routes change
 * - Integration with the aggregation layer
 */
export class TokenPairCompatibilityService {
  private tokenRegistry: TokenMappingRegistry;
  private validationEngine: RouteValidationEngine;
  private config: Required<CompatibilityServiceConfig>;

  constructor(config: CompatibilityServiceConfig = {}) {
    this.config = {
      validationConfig: {},
      filterBeforeAggregation: true,
      includeMetadata: true,
      defaultProviders: ['hop', 'layerzero', 'stellar'],
      ...config,
    };

    this.tokenRegistry = new TokenMappingRegistry();
    this.validationEngine = new RouteValidationEngine(
      this.tokenRegistry,
      this.config.validationConfig,
    );

    this.initializeDefaultChainPairs();
  }

  /**
   * Initialize default supported chain pairs for each bridge
   */
  private initializeDefaultChainPairs(): void {
    // Hop Protocol supported pairs
    this.validationEngine.registerSupportedChainPairs('hop', [
      ['ethereum', 'polygon'],
      ['ethereum', 'arbitrum'],
      ['ethereum', 'optimism'],
      ['ethereum', 'base'],
      ['ethereum', 'gnosis'],
      ['polygon', 'ethereum'],
      ['polygon', 'arbitrum'],
      ['polygon', 'optimism'],
      ['polygon', 'base'],
      ['arbitrum', 'ethereum'],
      ['arbitrum', 'polygon'],
      ['arbitrum', 'optimism'],
      ['arbitrum', 'base'],
      ['optimism', 'ethereum'],
      ['optimism', 'polygon'],
      ['optimism', 'arbitrum'],
      ['optimism', 'base'],
      ['base', 'ethereum'],
      ['base', 'polygon'],
      ['base', 'arbitrum'],
      ['base', 'optimism'],
    ]);

    // LayerZero supported pairs (broader EVM support)
    this.validationEngine.registerSupportedChainPairs('layerzero', [
      ['ethereum', 'polygon'],
      ['ethereum', 'arbitrum'],
      ['ethereum', 'optimism'],
      ['ethereum', 'base'],
      ['ethereum', 'bsc'],
      ['ethereum', 'avalanche'],
      ['polygon', 'ethereum'],
      ['polygon', 'arbitrum'],
      ['polygon', 'optimism'],
      ['polygon', 'base'],
      ['polygon', 'bsc'],
      ['polygon', 'avalanche'],
      ['arbitrum', 'ethereum'],
      ['arbitrum', 'polygon'],
      ['arbitrum', 'optimism'],
      ['arbitrum', 'base'],
      ['arbitrum', 'bsc'],
      ['arbitrum', 'avalanche'],
      ['optimism', 'ethereum'],
      ['optimism', 'polygon'],
      ['optimism', 'arbitrum'],
      ['optimism', 'base'],
      ['optimism', 'bsc'],
      ['optimism', 'avalanche'],
      ['base', 'ethereum'],
      ['base', 'polygon'],
      ['base', 'arbitrum'],
      ['base', 'optimism'],
      ['base', 'bsc'],
      ['base', 'avalanche'],
      ['bsc', 'ethereum'],
      ['bsc', 'polygon'],
      ['bsc', 'arbitrum'],
      ['bsc', 'optimism'],
      ['bsc', 'base'],
      ['bsc', 'avalanche'],
      ['avalanche', 'ethereum'],
      ['avalanche', 'polygon'],
      ['avalanche', 'arbitrum'],
      ['avalanche', 'optimism'],
      ['avalanche', 'base'],
      ['avalanche', 'bsc'],
    ]);

    // Stellar supported pairs (limited to Stellar-native bridges)
    this.validationEngine.registerSupportedChainPairs('stellar', [
      ['stellar', 'ethereum'],
      ['ethereum', 'stellar'],
    ]);
  }

  /**
   * Get the token registry for direct access
   */
  getTokenRegistry(): TokenMappingRegistry {
    return this.tokenRegistry;
  }

  /**
   * Get the validation engine for direct access
   */
  getValidationEngine(): RouteValidationEngine {
    return this.validationEngine;
  }

  /**
   * Pre-validate a route request before fetching quotes
   */
  async preValidateRoute(
    request: RouteCompatibilityRequest,
  ): Promise<TokenPairValidationResult> {
    return this.validationEngine.preValidateRequest(request);
  }

  /**
   * Validate a specific token pair
   */
  async validateTokenPair(
    tokenPair: TokenPair,
  ): Promise<TokenPairValidationResult> {
    return this.validationEngine.validateTokenPair(tokenPair);
  }

  /**
   * Find compatible routes for a request
   */
  async findCompatibleRoutes(
    request: RouteCompatibilityRequest,
  ): Promise<CompatibleRoute[]> {
    return this.validationEngine.findCompatibleRoutes(request);
  }

  /**
   * Get aggregated routes with compatibility filtering
   *
   * This method integrates with the BridgeAggregator to:
   * 1. Pre-validate the route request
   * 2. Find compatible bridges
   * 3. Fetch quotes only from compatible bridges
   * 4. Return results with validation metadata
   */
  async getCompatibleRoutes(
    request: CompatibilityQuoteRequest,
    aggregatorConfig?: {
      layerZeroApiKey?: string;
      timeout?: number;
    },
  ): Promise<CompatibilityQuoteResult> {
    const startTime = Date.now();

    // Step 1: Pre-validate the request
    const compatibilityRequest: RouteCompatibilityRequest = {
      sourceChain: request.sourceChain,
      destinationChain: request.targetChain,
      sourceToken: request.tokenAddress || 'native',
      destinationToken:
        request.destinationTokenAddress || request.tokenAddress || 'native',
      amount: request.assetAmount,
      preferredBridges:
        request.preferredBridges || this.config.defaultProviders,
      allowWrappedTokens: request.allowWrappedTokens ?? true,
    };

    const preValidation = await this.preValidateRoute(compatibilityRequest);

    if (!preValidation.isValid && this.config.filterBeforeAggregation) {
      // Return early if pre-validation fails and filtering is enabled
      return {
        routes: [],
        timestamp: Date.now(),
        providersQueried: 0,
        providersResponded: 0,
        validationResults: new Map(),
        filteredRoutes: preValidation.errors.map((error) => ({
          bridge: 'unknown' as BridgeProvider,
          reason: error.message,
          code: error.code,
        })),
        alternatives: preValidation.alternatives
          ? await this.convertTokenPairsToRoutes(preValidation.alternatives)
          : undefined,
      };
    }

    // Step 2: Find compatible bridges
    const compatibleRoutes =
      await this.findCompatibleRoutes(compatibilityRequest);

    if (compatibleRoutes.length === 0) {
      return {
        routes: [],
        timestamp: Date.now(),
        providersQueried: 0,
        providersResponded: 0,
        filteredRoutes: [
          {
            bridge: 'unknown' as BridgeProvider,
            reason: 'No compatible bridges found for this route',
            code: TokenPairErrorCode.ROUTE_NOT_SUPPORTED,
          },
        ],
      };
    }

    // Step 3: Build aggregator config with only compatible providers
    const compatibleProviders = new Set(compatibleRoutes.map((r) => r.bridge));

    const aggregator = new BridgeAggregator({
      providers: {
        hop: compatibleProviders.has('hop'),
        layerzero: compatibleProviders.has('layerzero'),
        stellar: compatibleProviders.has('stellar'),
      },
      layerZeroApiKey: aggregatorConfig?.layerZeroApiKey,
      timeout: aggregatorConfig?.timeout,
    });

    // Step 4: Fetch routes from compatible bridges only
    const baseRequest: RouteRequest = {
      sourceChain: request.sourceChain,
      targetChain: request.targetChain,
      assetAmount: request.assetAmount,
      tokenAddress: request.tokenAddress,
      slippageTolerance: request.slippageTolerance,
      recipientAddress: request.recipientAddress,
    };

    const aggregatedRoutes = await aggregator.getRoutes(baseRequest);

    // Step 5: Validate each returned route
    const validationResults = new Map<string, TokenPairValidationResult>();
    const filteredRoutes: Array<{
      bridge: BridgeProvider;
      reason: string;
      code: TokenPairErrorCode;
    }> = [];

    const validatedRoutes = [];
    for (const route of aggregatedRoutes.routes) {
      const tokenPair: TokenPair = {
        sourceChain: route.sourceChain,
        destinationChain: route.destinationChain,
        sourceToken: route.tokenIn,
        destinationToken: route.tokenOut,
        sourceDecimals: 18, // Default, should be fetched from registry
        destinationDecimals: 18,
        bridgeName: route.adapter,
      };

      const validation = await this.validateTokenPair(tokenPair);
      validationResults.set(route.id, validation);

      if (validation.isValid) {
        validatedRoutes.push(route);
      } else {
        filteredRoutes.push({
          bridge: route.adapter,
          reason: validation.errors[0]?.message || 'Validation failed',
          code:
            validation.errors[0]?.code || TokenPairErrorCode.VALIDATION_FAILED,
        });
      }
    }

    // Build result
    const result: CompatibilityQuoteResult = {
      routes: validatedRoutes,
      timestamp: Date.now(),
      providersQueried: aggregatedRoutes.providersQueried,
      providersResponded: aggregatedRoutes.providersResponded,
    };

    if (this.config.includeMetadata) {
      result.validationResults = validationResults;
      result.filteredRoutes =
        filteredRoutes.length > 0 ? filteredRoutes : undefined;
    }

    // Add alternatives if routes were filtered
    if (filteredRoutes.length > 0) {
      const alternatives = await this.findAlternativeRoutes(request);
      if (alternatives.length > 0) {
        result.alternatives = alternatives;
      }
    }

    return result;
  }

  /**
   * Find alternative routes for a request
   */
  async findAlternativeRoutes(
    request: CompatibilityQuoteRequest,
  ): Promise<CompatibleRoute[]> {
    const compatibilityRequest: RouteCompatibilityRequest = {
      sourceChain: request.sourceChain,
      destinationChain: request.targetChain,
      sourceToken: request.tokenAddress || 'native',
      destinationToken:
        request.destinationTokenAddress || request.tokenAddress || 'native',
      amount: request.assetAmount,
      allowWrappedTokens: true, // Always allow wrapped for alternatives
    };

    // Get all compatible routes including wrapped alternatives
    const allRoutes = await this.findCompatibleRoutes(compatibilityRequest);

    // Filter out routes that were already in the original request
    const preferredBridges = new Set(request.preferredBridges || []);
    return allRoutes.filter((route) => !preferredBridges.has(route.bridge));
  }

  /**
   * Check if a specific token pair is supported
   */
  async isPairSupported(
    sourceChain: ChainId,
    destinationChain: ChainId,
    sourceToken: string,
    destinationToken: string,
    bridge?: BridgeProvider,
  ): Promise<boolean> {
    const tokenPair: TokenPair = {
      sourceChain,
      destinationChain,
      sourceToken,
      destinationToken,
      sourceDecimals: 18,
      destinationDecimals: 18,
      bridgeName: bridge || 'hop',
    };

    const validation = await this.validateTokenPair(tokenPair);
    return validation.isValid;
  }

  /**
   * Get supported tokens for a chain pair
   */
  async getSupportedTokensForRoute(
    sourceChain: ChainId,
    destinationChain: ChainId,
    bridge?: BridgeProvider,
  ): Promise<string[]> {
    if (bridge) {
      return this.tokenRegistry.getSupportedTokensForBridge(
        sourceChain,
        destinationChain,
        bridge,
      );
    }

    // Get tokens from all bridges
    const allTokens = new Set<string>();
    const bridges: BridgeProvider[] = ['hop', 'layerzero', 'stellar'];

    for (const b of bridges) {
      const tokens = await this.tokenRegistry.getSupportedTokensForBridge(
        sourceChain,
        destinationChain,
        b,
      );
      tokens.forEach((t) => allTokens.add(t));
    }

    return Array.from(allTokens);
  }

  /**
   * Register a token for compatibility checking
   */
  async registerToken(
    chain: ChainId,
    address: string,
    symbol: string,
    decimals: number,
    supportedBridges: BridgeProvider[],
    options?: {
      isWrapped?: boolean;
      underlyingSymbol?: string;
      coingeckoId?: string;
    },
  ): Promise<void> {
    await this.tokenRegistry.registerToken(chain, address, {
      symbol,
      name: symbol,
      decimals,
      addresses: { [chain]: address },
      isStablecoin: ['USDC', 'USDT', 'DAI', 'BUSD'].includes(
        symbol.toUpperCase(),
      ),
      isWrapped: options?.isWrapped ?? false,
      underlyingSymbol: options?.underlyingSymbol,
      supportedBridges,
      coingeckoId: options?.coingeckoId,
    });
  }

  /**
   * Register a token mapping
   */
  async registerTokenMapping(
    sourceChain: ChainId,
    destinationChain: ChainId,
    sourceToken: string,
    destinationToken: string,
    provider: BridgeProvider,
    config: {
      minAmount: string;
      maxAmount: string;
      conversionRate?: string;
      bridgeTokenId?: string;
    },
  ): Promise<void> {
    await this.tokenRegistry.registerMapping(
      sourceChain,
      destinationChain,
      sourceToken,
      destinationToken,
      provider,
      {
        minAmount: config.minAmount,
        maxAmount: config.maxAmount,
        conversionRate: config.conversionRate || '1000000000000000000',
        bridgeTokenId: config.bridgeTokenId,
      },
    );
  }

  /**
   * Register a wrapped token mapping
   */
  async registerWrappedToken(
    chain: ChainId,
    originalToken: string,
    wrappedToken: string,
    wrapperProvider?: string,
  ): Promise<void> {
    await this.tokenRegistry.registerWrappedToken(
      chain,
      originalToken,
      wrappedToken,
      wrapperProvider,
    );
  }

  /**
   * Update bridge status
   */
  setBridgeStatus(
    provider: BridgeProvider,
    isAvailable: boolean,
    paused: boolean = false,
  ): void {
    this.validationEngine.setBridgeStatus(provider, isAvailable, paused);
  }

  /**
   * Get service statistics
   */
  getStats(): {
    registry: ReturnType<TokenMappingRegistry['getStats']>;
    config: CompatibilityServiceConfig;
  } {
    return {
      registry: this.tokenRegistry.getStats(),
      config: this.config,
    };
  }

  /**
   * Convert token pairs to compatible routes
   */
  private async convertTokenPairsToRoutes(
    tokenPairs: TokenPair[],
  ): Promise<CompatibleRoute[]> {
    return tokenPairs.map((pair) => ({
      tokenPair: pair,
      bridge: pair.bridgeName,
      isAvailable: true,
      liquidityScore: pair.liquidityScore || 0.8,
      priority: 0,
    }));
  }
}
