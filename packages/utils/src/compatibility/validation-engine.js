"use strict";
/**
 * Route Validation Engine
 *
 * Validates token pairs and routes for compatibility across bridge providers.
 * Ensures only supported routes are displayed to users.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteValidationEngine = void 0;
const types_1 = require("./types");
/**
 * Default validation engine configuration
 */
const DEFAULT_CONFIG = {
    minLiquidityScore: 0.1,
    allowWrappedTokens: true,
    suggestAlternatives: true,
    maxAlternatives: 3,
};
/**
 * Route Validation Engine
 *
 * Provides comprehensive validation for token pairs and bridge routes,
 * ensuring only compatible and executable routes are presented to users.
 */
class RouteValidationEngine {
    constructor(tokenRegistry, config = {}) {
        /**
         * Supported chain pairs per bridge provider
         */
        this.supportedChainPairs = new Map();
        /**
         * Bridge availability status
         */
        this.bridgeStatus = new Map();
        this.tokenRegistry = tokenRegistry;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.initializeBridgeStatus();
    }
    /**
     * Initialize bridge availability status
     */
    initializeBridgeStatus() {
        const providers = ['stellar', 'layerzero', 'hop'];
        providers.forEach((provider) => {
            this.bridgeStatus.set(provider, { isAvailable: true, paused: false });
        });
    }
    /**
     * Register supported chain pairs for a bridge provider
     */
    registerSupportedChainPairs(provider, pairs) {
        const pairSet = new Set();
        pairs.forEach(([source, dest]) => {
            pairSet.add(this.getChainPairKey(source, dest));
        });
        this.supportedChainPairs.set(provider, pairSet);
    }
    /**
     * Update bridge availability status
     */
    setBridgeStatus(provider, isAvailable, paused = false) {
        this.bridgeStatus.set(provider, { isAvailable, paused });
    }
    /**
     * Validate a token pair for a specific bridge
     */
    async validateTokenPair(tokenPair) {
        const startTime = Date.now();
        const errors = [];
        const warnings = [];
        // Validate chain support
        const chainValidation = await this.validateChainSupport(tokenPair.sourceChain, tokenPair.destinationChain, tokenPair.bridgeName);
        errors.push(...chainValidation.errors);
        warnings.push(...chainValidation.warnings);
        // Validate bridge availability
        const bridgeStatus = this.bridgeStatus.get(tokenPair.bridgeName);
        if (!bridgeStatus?.isAvailable) {
            errors.push({
                code: types_1.TokenPairErrorCode.BRIDGE_NOT_AVAILABLE,
                message: `Bridge ${tokenPair.bridgeName} is currently not available`,
                field: 'bridgeName',
            });
        }
        else if (bridgeStatus.paused) {
            errors.push({
                code: types_1.TokenPairErrorCode.BRIDGE_PAUSED,
                message: `Bridge ${tokenPair.bridgeName} is temporarily paused`,
                field: 'bridgeName',
            });
        }
        // If chains are invalid, skip token validation
        if (errors.length === 0) {
            // Validate token support
            const tokenValidation = await this.validateTokenSupport(tokenPair);
            errors.push(...tokenValidation.errors);
            warnings.push(...tokenValidation.warnings);
            // Validate liquidity if amount is provided
            if (tokenPair.minAmount && tokenPair.maxAmount) {
                const liquidityValidation = await this.validateLiquidity(tokenPair);
                errors.push(...liquidityValidation.errors);
                warnings.push(...liquidityValidation.warnings);
            }
        }
        // Check liquidity score
        if (tokenPair.liquidityScore !== undefined &&
            tokenPair.liquidityScore < this.config.minLiquidityScore) {
            warnings.push({
                code: types_1.TokenPairErrorCode.INSUFFICIENT_LIQUIDITY,
                message: `Low liquidity detected for this route (score: ${tokenPair.liquidityScore})`,
                field: 'liquidityScore',
            });
        }
        const isValid = errors.length === 0;
        const validationTime = Date.now() - startTime;
        // Find alternatives if validation failed and suggestions are enabled
        let alternatives;
        if (!isValid && this.config.suggestAlternatives) {
            alternatives = await this.findAlternativePairs(tokenPair);
        }
        return {
            isValid,
            errors,
            warnings,
            normalizedPair: isValid ? tokenPair : undefined,
            alternatives: alternatives?.slice(0, this.config.maxAlternatives),
            metadata: {
                validationTime,
                checkedBridges: [tokenPair.bridgeName],
                liquidityScore: tokenPair.liquidityScore,
            },
        };
    }
    /**
     * Validate chain pair support for a bridge
     */
    async validateChainSupport(sourceChain, destinationChain, bridge) {
        const errors = [];
        const warnings = [];
        const supportedPairs = this.supportedChainPairs.get(bridge);
        if (!supportedPairs) {
            errors.push({
                code: types_1.TokenPairErrorCode.BRIDGE_NOT_AVAILABLE,
                message: `No chain pair information available for bridge ${bridge}`,
                field: 'bridgeName',
            });
            return { errors, warnings };
        }
        const pairKey = this.getChainPairKey(sourceChain, destinationChain);
        if (!supportedPairs.has(pairKey)) {
            // Check if reverse pair is supported
            const reverseKey = this.getChainPairKey(destinationChain, sourceChain);
            if (supportedPairs.has(reverseKey)) {
                errors.push({
                    code: types_1.TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR,
                    message: `Route from ${sourceChain} to ${destinationChain} is not supported by ${bridge}, but reverse route is available`,
                    field: 'chainPair',
                    suggestions: [
                        `Try bridging from ${destinationChain} to ${sourceChain} instead`,
                    ],
                });
            }
            else {
                errors.push({
                    code: types_1.TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR,
                    message: `Chain pair ${sourceChain} -> ${destinationChain} is not supported by ${bridge}`,
                    field: 'chainPair',
                });
            }
        }
        return { errors, warnings };
    }
    /**
     * Validate token support for a bridge route
     */
    async validateTokenSupport(tokenPair) {
        const errors = [];
        const warnings = [];
        // Check if source token is registered
        const sourceToken = await this.tokenRegistry.getToken(tokenPair.sourceChain, tokenPair.sourceToken);
        if (!sourceToken) {
            errors.push({
                code: types_1.TokenPairErrorCode.TOKEN_NOT_REGISTERED,
                message: `Source token ${tokenPair.sourceToken} is not registered on ${tokenPair.sourceChain}`,
                field: 'sourceToken',
            });
        }
        // Check if destination token is registered
        const destToken = await this.tokenRegistry.getToken(tokenPair.destinationChain, tokenPair.destinationToken);
        if (!destToken) {
            errors.push({
                code: types_1.TokenPairErrorCode.TOKEN_NOT_REGISTERED,
                message: `Destination token ${tokenPair.destinationToken} is not registered on ${tokenPair.destinationChain}`,
                field: 'destinationToken',
            });
        }
        // If both tokens exist, check if they're bridgeable
        if (sourceToken && destToken) {
            const isBridgeable = await this.tokenRegistry.isBridgeable(tokenPair.sourceChain, tokenPair.destinationChain, tokenPair.sourceToken, tokenPair.bridgeName);
            if (!isBridgeable) {
                errors.push({
                    code: types_1.TokenPairErrorCode.UNSUPPORTED_TOKEN_PAIR,
                    message: `Token pair ${sourceToken.symbol} -> ${destToken.symbol} is not supported by ${tokenPair.bridgeName}`,
                    field: 'tokenPair',
                    suggestions: await this.getTokenPairSuggestions(tokenPair),
                });
            }
        }
        // Check wrapped token compatibility if applicable
        if (sourceToken?.isWrapped || destToken?.isWrapped) {
            const wrappedValidation = await this.validateWrappedTokenCompatibility(tokenPair, sourceToken, destToken);
            errors.push(...wrappedValidation.errors);
            warnings.push(...wrappedValidation.warnings);
        }
        return { errors, warnings };
    }
    /**
     * Validate wrapped token compatibility
     */
    async validateWrappedTokenCompatibility(tokenPair, sourceToken, destToken) {
        const errors = [];
        const warnings = [];
        if (!this.config.allowWrappedTokens) {
            if (sourceToken?.isWrapped) {
                errors.push({
                    code: types_1.TokenPairErrorCode.WRAPPED_TOKEN_MISMATCH,
                    message: 'Wrapped tokens are not allowed for this route',
                    field: 'sourceToken',
                });
            }
            if (destToken?.isWrapped) {
                errors.push({
                    code: types_1.TokenPairErrorCode.WRAPPED_TOKEN_MISMATCH,
                    message: 'Wrapped tokens are not allowed for this route',
                    field: 'destinationToken',
                });
            }
            return { errors, warnings };
        }
        // Check if wrapped tokens have valid underlying mappings
        if (sourceToken?.isWrapped && sourceToken.underlyingToken) {
            const underlying = await this.tokenRegistry.getToken(tokenPair.sourceChain, sourceToken.underlyingToken);
            if (!underlying) {
                warnings.push({
                    code: types_1.TokenPairErrorCode.INVALID_WRAPPED_MAPPING,
                    message: `Wrapped token ${sourceToken.symbol} has no valid underlying token mapping`,
                    field: 'sourceToken',
                });
            }
        }
        if (destToken?.isWrapped && destToken.underlyingToken) {
            const underlying = await this.tokenRegistry.getToken(tokenPair.destinationChain, destToken.underlyingToken);
            if (!underlying) {
                warnings.push({
                    code: types_1.TokenPairErrorCode.INVALID_WRAPPED_MAPPING,
                    message: `Wrapped token ${destToken.symbol} has no valid underlying token mapping`,
                    field: 'destinationToken',
                });
            }
        }
        return { errors, warnings };
    }
    /**
     * Validate liquidity for a token pair
     */
    validateLiquidity(tokenPair) {
        const errors = [];
        const warnings = [];
        // Liquidity validation is handled by the token registry
        // This method can be extended for additional liquidity checks
        return Promise.resolve({ errors, warnings });
    }
    /**
     * Find compatible routes for a request
     */
    async findCompatibleRoutes(request) {
        const compatibleRoutes = [];
        // Get all supported bridges for this chain pair
        const bridges = request.preferredBridges || this.getAllBridgeProviders();
        for (const bridge of bridges) {
            // Check chain pair support
            const chainPairSupported = await this.isChainPairSupported(request.sourceChain, request.destinationChain, bridge);
            if (!chainPairSupported)
                continue;
            // Check bridge status
            const status = this.bridgeStatus.get(bridge);
            if (!status?.isAvailable || status.paused)
                continue;
            // Get token mapping
            const mapping = await this.tokenRegistry.getMapping(request.sourceChain, request.destinationChain, request.sourceToken, bridge);
            if (!mapping || !mapping.isActive)
                continue;
            // Validate amount constraints
            const amount = BigInt(request.amount);
            const minAmount = BigInt(mapping.minAmount);
            const maxAmount = BigInt(mapping.maxAmount);
            if (amount < minAmount || amount > maxAmount)
                continue;
            // Create compatible route
            const tokenPair = {
                sourceChain: request.sourceChain,
                destinationChain: request.destinationChain,
                sourceToken: request.sourceToken,
                destinationToken: request.destinationToken,
                sourceDecimals: mapping.sourceToken.decimals,
                destinationDecimals: mapping.destinationToken.decimals,
                bridgeName: bridge,
                isSupported: true,
                minAmount: mapping.minAmount,
                maxAmount: mapping.maxAmount,
                liquidityScore: 0.8, // Default score, can be enhanced
            };
            compatibleRoutes.push({
                tokenPair,
                bridge,
                isAvailable: true,
                liquidityScore: tokenPair.liquidityScore || 0.8,
                priority: this.calculateRoutePriority(tokenPair, bridge),
            });
        }
        // Sort by priority (lower is better)
        return compatibleRoutes.sort((a, b) => a.priority - b.priority);
    }
    /**
     * Check if a chain pair is supported by a bridge
     */
    async isChainPairSupported(sourceChain, destinationChain, bridge) {
        const supportedPairs = this.supportedChainPairs.get(bridge);
        if (!supportedPairs)
            return false;
        return supportedPairs.has(this.getChainPairKey(sourceChain, destinationChain));
    }
    /**
     * Calculate route priority (lower is better)
     */
    calculateRoutePriority(tokenPair, bridge) {
        let priority = 0;
        // Prefer higher liquidity
        priority += (1 - (tokenPair.liquidityScore || 0.5)) * 10;
        // Prefer native bridges over third-party
        const bridgePriority = {
            hop: 1,
            layerzero: 2,
            stellar: 3,
        };
        priority += bridgePriority[bridge] || 5;
        return priority;
    }
    /**
     * Find alternative token pairs for a failed validation
     */
    async findAlternativePairs(originalPair) {
        const alternatives = [];
        // Try different bridges for the same pair
        const allBridges = this.getAllBridgeProviders();
        for (const bridge of allBridges) {
            if (bridge === originalPair.bridgeName)
                continue;
            const altPair = {
                ...originalPair,
                bridgeName: bridge,
            };
            const validation = await this.validateTokenPair(altPair);
            if (validation.isValid && validation.normalizedPair) {
                alternatives.push(validation.normalizedPair);
            }
        }
        // Try wrapped token alternatives if allowed
        if (this.config.allowWrappedTokens) {
            const wrappedAlternatives = await this.findWrappedTokenAlternatives(originalPair);
            alternatives.push(...wrappedAlternatives);
        }
        return alternatives;
    }
    /**
     * Find wrapped token alternatives
     */
    async findWrappedTokenAlternatives(tokenPair) {
        const alternatives = [];
        // Check for wrapped versions of the tokens
        const wrappedSource = await this.tokenRegistry.getWrappedToken(tokenPair.sourceChain, tokenPair.sourceToken);
        const wrappedDest = await this.tokenRegistry.getWrappedToken(tokenPair.destinationChain, tokenPair.destinationToken);
        if (wrappedSource || wrappedDest) {
            const altPair = {
                ...tokenPair,
                sourceToken: wrappedSource?.wrappedToken || tokenPair.sourceToken,
                destinationToken: wrappedDest?.wrappedToken || tokenPair.destinationToken,
            };
            const validation = await this.validateTokenPair(altPair);
            if (validation.isValid && validation.normalizedPair) {
                alternatives.push(validation.normalizedPair);
            }
        }
        return alternatives;
    }
    /**
     * Get suggestions for unsupported token pairs
     */
    async getTokenPairSuggestions(tokenPair) {
        const suggestions = [];
        // Get supported tokens for this bridge on both chains
        const supportedSourceTokens = await this.tokenRegistry.getSupportedTokensForBridge(tokenPair.sourceChain, tokenPair.destinationChain, tokenPair.bridgeName);
        if (supportedSourceTokens.length > 0) {
            suggestions.push(`Supported source tokens on ${tokenPair.sourceChain}: ${supportedSourceTokens.slice(0, 5).join(', ')}`);
        }
        return suggestions;
    }
    /**
     * Get all bridge providers
     */
    getAllBridgeProviders() {
        return ['hop', 'layerzero', 'stellar'];
    }
    /**
     * Generate a unique key for a chain pair
     */
    getChainPairKey(source, destination) {
        return `${source}:${destination}`;
    }
    /**
     * Batch validate multiple token pairs
     */
    async validateTokenPairs(tokenPairs) {
        return Promise.all(tokenPairs.map((pair) => this.validateTokenPair(pair)));
    }
    /**
     * Pre-validate a route request before fetching quotes
     */
    async preValidateRequest(request) {
        const startTime = Date.now();
        const errors = [];
        const warnings = [];
        // Validate chains
        const bridges = request.preferredBridges || this.getAllBridgeProviders();
        let hasSupportedChainPair = false;
        for (const bridge of bridges) {
            const supported = await this.isChainPairSupported(request.sourceChain, request.destinationChain, bridge);
            if (supported) {
                hasSupportedChainPair = true;
                break;
            }
        }
        if (!hasSupportedChainPair) {
            errors.push({
                code: types_1.TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR,
                message: `No bridge supports the route from ${request.sourceChain} to ${request.destinationChain}`,
                field: 'chainPair',
            });
        }
        // Validate tokens exist in registry
        const sourceToken = await this.tokenRegistry.getToken(request.sourceChain, request.sourceToken);
        if (!sourceToken) {
            errors.push({
                code: types_1.TokenPairErrorCode.TOKEN_NOT_REGISTERED,
                message: `Source token ${request.sourceToken} not found on ${request.sourceChain}`,
                field: 'sourceToken',
            });
        }
        const destToken = await this.tokenRegistry.getToken(request.destinationChain, request.destinationToken);
        if (!destToken) {
            errors.push({
                code: types_1.TokenPairErrorCode.TOKEN_NOT_REGISTERED,
                message: `Destination token ${request.destinationToken} not found on ${request.destinationChain}`,
                field: 'destinationToken',
            });
        }
        const validationTime = Date.now() - startTime;
        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            metadata: {
                validationTime,
                checkedBridges: bridges,
            },
        };
    }
}
exports.RouteValidationEngine = RouteValidationEngine;
//# sourceMappingURL=validation-engine.js.map