"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeAggregator = void 0;
const hop_1 = require("./adapters/hop");
const layerzero_1 = require("./adapters/layerzero");
const stellar_1 = require("./adapters/stellar");
const types_1 = require("./types");
const validator_1 = require("./validator");
const ranker_1 = require("./ranker");
/**
 * Central aggregator for collecting and unifying bridge routes from multiple providers
 */
class BridgeAggregator {
    constructor(config = {}) {
        this.timeout = config.timeout || 15000;
        this.adapters = config.adapters || [];
        this.validator = new validator_1.BridgeValidator();
        this.ranker = new ranker_1.RouteRanker(config.rankingWeights);
        this.auditLogger = config.auditLogger;
        // Initialize default adapters if not provided
        if (this.adapters.length === 0) {
            const providers = config.providers || {};
            if (providers.hop !== false) {
                this.adapters.push(new hop_1.HopAdapter());
            }
            if (providers.layerzero !== false) {
                this.adapters.push(new layerzero_1.LayerZeroAdapter());
            }
            if (providers.stellar !== false) {
                this.adapters.push(new stellar_1.StellarAdapter());
            }
        }
    }
    /**
     * Fetch and aggregate routes from all bridge providers
     * @param request Route request parameters
     * @returns Aggregated routes from all providers
     */
    async getRoutes(request) {
        // Filter adapters that support this chain pair
        const supportedAdapters = this.adapters.filter((adapter) => adapter.supportsChainPair(request.sourceChain, request.targetChain));
        if (supportedAdapters.length === 0) {
            return {
                routes: [],
                timestamp: Date.now(),
                providersQueried: 0,
                providersResponded: 0,
            };
        }
        // Fetch routes from all adapters in parallel for high performance
        const routePromises = supportedAdapters.map((adapter) => this.fetchRoutesWithTimeout(adapter, request));
        const results = await Promise.allSettled(routePromises);
        // Collect successful routes and errors
        const routes = [];
        const errors = [];
        let providersResponded = 0;
        results.forEach((result, index) => {
            const adapter = supportedAdapters[index];
            if (result.status === 'fulfilled') {
                const adapterRoutes = Array.isArray(result.value) ? result.value : [];
                if (adapterRoutes.length > 0) {
                    routes.push(...adapterRoutes);
                    providersResponded++;
                }
            }
            else {
                const reason = result.reason;
                const safeError = reason && typeof reason === 'object' && 'message' in reason
                    ? reason
                    : {
                        message: reason instanceof Error
                            ? reason.message
                            : JSON.stringify(reason),
                    };
                errors.push({
                    provider: adapter.provider,
                    error: safeError.message || 'Unknown error',
                    code: safeError.code,
                });
            }
        });
        // Normalize and sort routes
        const normalizedRoutes = routes.map(types_1.toNormalizedRoute);
        const sortedRoutes = this.ranker.rankRoutes(normalizedRoutes);
        // Log route selection if logger is available
        if (this.auditLogger && sortedRoutes.length > 0) {
            const topRoute = sortedRoutes[0];
            this.auditLogger.logRouteSelection({
                sourceChain: request.sourceChain,
                destinationChain: request.targetChain,
                amount: request.assetAmount,
                selectedAdapter: topRoute.adapter,
                routeScore: topRoute.metadata?.score,
                alternativeCount: sortedRoutes.length - 1,
            });
        }
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
    async fetchRoutesWithTimeout(adapter, request) {
        return Promise.race([
            adapter.fetchRoutes(request),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), this.timeout)),
        ]);
    }
    /**
     * Normalize routes to ensure consistent data format
     */
    normalizeRoutes(routes) {
        return routes.map((route, index) => {
            // For single-hop routes, create a hop from the route data
            const hops = route.hops || [
                {
                    sourceChain: route.sourceChain,
                    destinationChain: route.targetChain,
                    tokenIn: route.metadata?.tokenIn || 'native', // Default to native if not specified
                    tokenOut: route.metadata?.tokenOut || 'native',
                    fee: route.fee,
                    estimatedTime: route.estimatedTime,
                    adapter: route.provider,
                    metadata: route.metadata,
                },
            ];
            // Aggregate total fees and estimated time from hops
            const totalFees = hops.reduce((sum, hop) => {
                try {
                    return (BigInt(sum) + BigInt(hop.fee)).toString();
                }
                catch {
                    return sum;
                }
            }, '0');
            const totalEstimatedTime = hops.reduce((sum, hop) => sum + hop.estimatedTime, 0);
            const normalized = {
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
                    inputAmount: route.inputAmount || '0',
                    outputAmount: route.outputAmount || '0',
                    fee: route.fee || '0',
                    feePercentage: route.feePercentage ?? 0,
                    reliability: route.reliability ?? this.calculateReliability(route),
                    minAmountOut: route.minAmountOut || route.outputAmount || '0',
                    maxAmountOut: route.maxAmountOut || route.outputAmount || '0',
                    deadline: route.deadline,
                    transactionData: route.transactionData,
                },
            };
            return normalized;
        });
    }
    /**
     * Sort routes deterministically: lowest totalFees, fastest ETA, fewest hops
     */
    sortRoutes(routes) {
        return [...routes].sort((a, b) => {
            // Primary sort: lowest totalFees
            try {
                const feeDiff = BigInt(a.totalFees) - BigInt(b.totalFees);
                if (feeDiff !== 0n) {
                    return feeDiff > 0n ? 1 : -1;
                }
            }
            catch {
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
    calculateFeePercentage(inputAmount, outputAmount) {
        try {
            const input = BigInt(inputAmount);
            const output = BigInt(outputAmount);
            if (input === 0n)
                return 0;
            const fee = input - output;
            const feePercentage = Number((fee * 10000n) / input) / 100;
            return Math.max(0, Math.min(100, feePercentage));
        }
        catch {
            return 0;
        }
    }
    /**
     * Calculate reliability score based on provider and metadata
     */
    calculateReliability(route) {
        // Base reliability by provider (can be adjusted based on real data)
        const providerReliability = {
            stellar: 0.95, // High reliability for established protocol
            layerzero: 0.9, // Good reliability
            hop: 0.85, // Slightly lower due to optimism-specific
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
    getAdapters() {
        return [...this.adapters];
    }
    /**
     * Add a custom adapter
     */
    addAdapter(adapter) {
        this.adapters.push(adapter);
    }
    /**
     * Remove an adapter by provider name
     */
    removeAdapter(provider) {
        this.adapters = this.adapters.filter((adapter) => adapter.provider !== provider);
    }
    /**
     * Validate a bridge execution request before fetching routes
     * @param request Bridge execution request with user details
     * @returns Validation result with detailed error messages
     */
    validateRequest(request) {
        return this.validator.validateExecutionRequest(request);
    }
    /**
     * Validate a specific route before execution
     * @param route The route to validate
     * @param request The original execution request
     * @returns Validation result with detailed error messages
     */
    validateRoute(route, request) {
        return this.validator.validateRoute(route, request);
    }
    /**
     * Update ranking weights for route prioritization
     */
    updateRankingWeights(weights) {
        this.ranker.updateWeights(weights);
    }
    /**
     * Get current ranking weights
     */
    getRankingWeights() {
        return this.ranker.getWeights();
    }
}
exports.BridgeAggregator = BridgeAggregator;
//# sourceMappingURL=aggregator.js.map