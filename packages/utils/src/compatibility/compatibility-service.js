"use strict";
/**
 * Token Pair Compatibility Service
 *
 * Main service that integrates the compatibility engine with the bridge aggregation layer.
 * Validates routes before fetching quotes and filters unsupported combinations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenPairCompatibilityService = void 0;
const types_1 = require("./types");
const validation_engine_1 = require("./validation-engine");
const token_mapping_registry_1 = require("./token-mapping-registry");
const aggregator_1 = require("../aggregator");
/**
 * Token Pair Compatibility Service
 *
 * Provides high-level API for:
 * - Pre-validating routes before quote fetching
 * - Filtering unsupported bridges from comparison
 * - Dynamic UI updates when routes change
 * - Integration with the aggregation layer
 */
class TokenPairCompatibilityService {
    constructor(config = {}) {
        this.config = {
            validationConfig: {},
            filterBeforeAggregation: true,
            includeMetadata: true,
            defaultProviders: ['hop', 'layerzero', 'stellar'],
            ...config,
        };
        this.tokenRegistry = new token_mapping_registry_1.TokenMappingRegistry();
        this.validationEngine = new validation_engine_1.RouteValidationEngine(this.tokenRegistry, this.config.validationConfig);
        this.initializeDefaultChainPairs();
    }
    /**
     * Initialize default supported chain pairs for each bridge
     */
    initializeDefaultChainPairs() {
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
    getTokenRegistry() {
        return this.tokenRegistry;
    }
    /**
     * Get the validation engine for direct access
     */
    getValidationEngine() {
        return this.validationEngine;
    }
    /**
     * Pre-validate a route request before fetching quotes
     */
    async preValidateRoute(request) {
        return this.validationEngine.preValidateRequest(request);
    }
    /**
     * Validate a specific token pair
     */
    async validateTokenPair(tokenPair) {
        return this.validationEngine.validateTokenPair(tokenPair);
    }
    /**
     * Find compatible routes for a request
     */
    async findCompatibleRoutes(request) {
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
    async getCompatibleRoutes(request, aggregatorConfig) {
        const startTime = Date.now();
        // Step 1: Pre-validate the request
        const compatibilityRequest = {
            sourceChain: request.sourceChain,
            destinationChain: request.targetChain,
            sourceToken: request.tokenAddress || 'native',
            destinationToken: request.destinationTokenAddress || request.tokenAddress || 'native',
            amount: request.assetAmount,
            preferredBridges: request.preferredBridges || this.config.defaultProviders,
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
                    bridge: 'unknown',
                    reason: error.message,
                    code: error.code,
                })),
                alternatives: preValidation.alternatives
                    ? await this.convertTokenPairsToRoutes(preValidation.alternatives)
                    : undefined,
            };
        }
        // Step 2: Find compatible bridges
        const compatibleRoutes = await this.findCompatibleRoutes(compatibilityRequest);
        if (compatibleRoutes.length === 0) {
            return {
                routes: [],
                timestamp: Date.now(),
                providersQueried: 0,
                providersResponded: 0,
                filteredRoutes: [
                    {
                        bridge: 'unknown',
                        reason: 'No compatible bridges found for this route',
                        code: types_1.TokenPairErrorCode.ROUTE_NOT_SUPPORTED,
                    },
                ],
            };
        }
        // Step 3: Build aggregator config with only compatible providers
        const compatibleProviders = new Set(compatibleRoutes.map((r) => r.bridge));
        const aggregator = new aggregator_1.BridgeAggregator({
            providers: {
                hop: compatibleProviders.has('hop'),
                layerzero: compatibleProviders.has('layerzero'),
                stellar: compatibleProviders.has('stellar'),
            },
            layerZeroApiKey: aggregatorConfig?.layerZeroApiKey,
            timeout: aggregatorConfig?.timeout,
        });
        // Step 4: Fetch routes from compatible bridges only
        const baseRequest = {
            sourceChain: request.sourceChain,
            targetChain: request.targetChain,
            assetAmount: request.assetAmount,
            tokenAddress: request.tokenAddress,
            slippageTolerance: request.slippageTolerance,
            recipientAddress: request.recipientAddress,
        };
        const aggregatedRoutes = await aggregator.getRoutes(baseRequest);
        // Step 5: Validate each returned route
        const validationResults = new Map();
        const filteredRoutes = [];
        const validatedRoutes = [];
        for (const route of aggregatedRoutes.routes) {
            const tokenPair = {
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
            }
            else {
                filteredRoutes.push({
                    bridge: route.adapter,
                    reason: validation.errors[0]?.message || 'Validation failed',
                    code: validation.errors[0]?.code || types_1.TokenPairErrorCode.VALIDATION_FAILED,
                });
            }
        }
        // Build result
        const result = {
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
    async findAlternativeRoutes(request) {
        const compatibilityRequest = {
            sourceChain: request.sourceChain,
            destinationChain: request.targetChain,
            sourceToken: request.tokenAddress || 'native',
            destinationToken: request.destinationTokenAddress || request.tokenAddress || 'native',
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
    async isPairSupported(sourceChain, destinationChain, sourceToken, destinationToken, bridge) {
        const tokenPair = {
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
    async getSupportedTokensForRoute(sourceChain, destinationChain, bridge) {
        if (bridge) {
            return this.tokenRegistry.getSupportedTokensForBridge(sourceChain, destinationChain, bridge);
        }
        // Get tokens from all bridges
        const allTokens = new Set();
        const bridges = ['hop', 'layerzero', 'stellar'];
        for (const b of bridges) {
            const tokens = await this.tokenRegistry.getSupportedTokensForBridge(sourceChain, destinationChain, b);
            tokens.forEach((t) => allTokens.add(t));
        }
        return Array.from(allTokens);
    }
    /**
     * Register a token for compatibility checking
     */
    async registerToken(chain, address, symbol, decimals, supportedBridges, options) {
        await this.tokenRegistry.registerToken(chain, address, {
            symbol,
            name: symbol,
            decimals,
            addresses: { [chain]: address },
            isStablecoin: ['USDC', 'USDT', 'DAI', 'BUSD'].includes(symbol.toUpperCase()),
            isWrapped: options?.isWrapped ?? false,
            underlyingSymbol: options?.underlyingSymbol,
            supportedBridges,
            coingeckoId: options?.coingeckoId,
        });
    }
    /**
     * Register a token mapping
     */
    async registerTokenMapping(sourceChain, destinationChain, sourceToken, destinationToken, provider, config) {
        await this.tokenRegistry.registerMapping(sourceChain, destinationChain, sourceToken, destinationToken, provider, {
            minAmount: config.minAmount,
            maxAmount: config.maxAmount,
            conversionRate: config.conversionRate || '1000000000000000000',
            bridgeTokenId: config.bridgeTokenId,
        });
    }
    /**
     * Register a wrapped token mapping
     */
    async registerWrappedToken(chain, originalToken, wrappedToken, wrapperProvider) {
        await this.tokenRegistry.registerWrappedToken(chain, originalToken, wrappedToken, wrapperProvider);
    }
    /**
     * Update bridge status
     */
    setBridgeStatus(provider, isAvailable, paused = false) {
        this.validationEngine.setBridgeStatus(provider, isAvailable, paused);
    }
    /**
     * Get service statistics
     */
    getStats() {
        return {
            registry: this.tokenRegistry.getStats(),
            config: this.config,
        };
    }
    /**
     * Convert token pairs to compatible routes
     */
    async convertTokenPairsToRoutes(tokenPairs) {
        return tokenPairs.map((pair) => ({
            tokenPair: pair,
            bridge: pair.bridgeName,
            isAvailable: true,
            liquidityScore: pair.liquidityScore || 0.8,
            priority: 0,
        }));
    }
}
exports.TokenPairCompatibilityService = TokenPairCompatibilityService;
//# sourceMappingURL=compatibility-service.js.map