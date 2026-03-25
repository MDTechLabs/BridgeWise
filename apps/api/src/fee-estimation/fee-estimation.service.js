"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeeEstimationService = void 0;
const common_1 = require("@nestjs/common");
/**
 * Dynamic Fee Estimation Service
 *
 * Provides real-time fee estimates for bridge routes by combining
 * gas prices, bridge fees, and liquidity impacts.
 */
let FeeEstimationService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var FeeEstimationService = _classThis = class {
        constructor(feeEstimateRepository, gasPriceAdapter, bridgeFeeAdapter) {
            this.feeEstimateRepository = feeEstimateRepository;
            this.gasPriceAdapter = gasPriceAdapter;
            this.bridgeFeeAdapter = bridgeFeeAdapter;
            this.logger = new common_1.Logger(FeeEstimationService.name);
            this.cache = new Map();
            this.DEFAULT_CACHE_TTL = 60000; // 1 minute
        }
        /**
         * Get fee estimate for a route
         */
        async getFeeEstimate(query) {
            const cacheKey = this.buildCacheKey(query);
            // Check cache
            const cached = this.cache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < cached.ttl) {
                return this.mapToDto(cached.estimate);
            }
            try {
                const estimate = await this.calculateFeeEstimate(query);
                // Cache the result
                this.cache.set(cacheKey, {
                    estimate,
                    timestamp: Date.now(),
                    ttl: estimate.cacheTtlSeconds * 1000,
                });
                // Store in database for analytics
                await this.saveFeeEstimate(estimate);
                return this.mapToDto(estimate);
            }
            catch (error) {
                this.logger.error(`Failed to calculate fee estimate: ${error.message}`);
                return this.getFallbackEstimate(query, error.message);
            }
        }
        /**
         * Get batch fee estimates
         */
        async getBatchFeeEstimates(query) {
            const estimates = [];
            let fallbacks = 0;
            for (const route of query.routes) {
                try {
                    const estimate = await this.getFeeEstimate({
                        bridgeName: route.bridgeName,
                        sourceChain: route.sourceChain,
                        destinationChain: route.destinationChain,
                        token: route.token,
                        amount: route.amount,
                        includeUsd: query.includeUsd,
                    });
                    if (estimate.isFallback) {
                        fallbacks++;
                    }
                    estimates.push(estimate);
                }
                catch (error) {
                    this.logger.warn(`Failed to get estimate for route: ${error.message}`);
                    fallbacks++;
                    estimates.push(this.getFallbackEstimate({
                        bridgeName: route.bridgeName,
                        sourceChain: route.sourceChain,
                        destinationChain: route.destinationChain,
                    }, error.message));
                }
            }
            return {
                estimates,
                successful: estimates.length - fallbacks,
                fallbacks,
                generatedAt: new Date(),
            };
        }
        /**
         * Compare fees across multiple bridges
         */
        async compareFees(sourceChain, destinationChain, token, amount, bridges) {
            const bridgeList = bridges || this.bridgeFeeAdapter.getSupportedBridges();
            const comparisons = [];
            for (const bridgeName of bridgeList) {
                try {
                    const estimate = await this.getFeeEstimate({
                        bridgeName,
                        sourceChain,
                        destinationChain,
                        token,
                        amount,
                    });
                    comparisons.push({
                        bridgeName,
                        totalFee: estimate.totalFee,
                        totalFeeUsd: estimate.totalFeeUsd,
                        breakdown: {
                            gasFee: estimate.gasFee,
                            bridgeFee: estimate.bridgeFee,
                            liquidityFee: estimate.liquidityFee,
                            protocolFee: estimate.protocolFee,
                        },
                        isFallback: estimate.isFallback,
                        rank: 0, // Will be set after sorting
                        savingsPercent: 0, // Will be calculated
                    });
                }
                catch (error) {
                    this.logger.warn(`Failed to compare fee for ${bridgeName}: ${error.message}`);
                }
            }
            // Sort by total fee and assign ranks
            comparisons.sort((a, b) => a.totalFee - b.totalFee);
            const cheapest = comparisons[0];
            const mostExpensive = comparisons[comparisons.length - 1];
            comparisons.forEach((comp, index) => {
                comp.rank = index + 1;
                if (mostExpensive.totalFee > 0) {
                    comp.savingsPercent =
                        ((mostExpensive.totalFee - comp.totalFee) / mostExpensive.totalFee) *
                            100;
                }
            });
            return {
                comparisons,
                cheapest,
                fastest: comparisons.find((c) => !c.isFallback) || cheapest,
                sourceChain,
                destinationChain,
                generatedAt: new Date(),
            };
        }
        /**
         * Calculate fee estimate
         */
        async calculateFeeEstimate(query) {
            const { bridgeName, sourceChain, destinationChain, token, amount } = query;
            // Get gas price
            const gasPrice = await this.gasPriceAdapter.getGasPrice(sourceChain);
            // Calculate gas fee
            const gasFee = this.gasPriceAdapter.calculateGasFee(sourceChain, gasPrice.gasPriceGwei, gasPrice.recommendedGasLimit);
            // Get bridge fees
            const bridgeFees = this.bridgeFeeAdapter.estimateTotalBridgeCost(bridgeName, amount || 0, sourceChain);
            // Calculate total fee
            const totalFee = gasFee + bridgeFees.totalFee;
            // Get fee token (native token of source chain)
            const feeToken = this.getNativeToken(sourceChain);
            // Calculate USD values (simplified - would need price oracle in production)
            const feeTokenPriceUsd = await this.getTokenPriceUsd(feeToken);
            const totalFeeUsd = feeTokenPriceUsd
                ? totalFee * feeTokenPriceUsd
                : undefined;
            // Create estimate entity
            const estimate = this.feeEstimateRepository.create({
                bridgeName,
                sourceChain,
                destinationChain,
                token: token || null,
                amount: amount || null,
                totalFee,
                gasFee,
                bridgeFee: bridgeFees.bridgeFee,
                liquidityFee: bridgeFees.liquidityFee,
                protocolFee: bridgeFees.protocolFee,
                gasPriceGwei: gasPrice.gasPriceGwei,
                gasLimit: gasPrice.recommendedGasLimit,
                networkCongestion: gasPrice.congestionLevel,
                feeToken,
                feeTokenPriceUsd: feeTokenPriceUsd || null,
                totalFeeUsd: totalFeeUsd || null,
                isFallback: false,
                fallbackReason: null,
                estimatedDurationSeconds: this.estimateDuration(bridgeName, sourceChain, destinationChain),
                expiresAt: gasPrice.expiresAt,
                cacheTtlSeconds: Math.floor((gasPrice.expiresAt.getTime() - Date.now()) / 1000),
            });
            return estimate;
        }
        /**
         * Get fallback estimate when dynamic fetching fails
         */
        getFallbackEstimate(query, reason) {
            const fallbackGasFee = 0.001; // Conservative fallback
            const fallbackBridgeFee = 0.0001;
            const feeToken = query.sourceChain
                ? this.getNativeToken(query.sourceChain)
                : 'ETH';
            return {
                bridgeName: query.bridgeName || 'unknown',
                sourceChain: query.sourceChain || 'unknown',
                destinationChain: query.destinationChain || 'unknown',
                token: query.token,
                amount: query.amount,
                totalFee: fallbackGasFee + fallbackBridgeFee,
                gasFee: fallbackGasFee,
                bridgeFee: fallbackBridgeFee,
                liquidityFee: 0,
                protocolFee: 0,
                feeToken,
                isFallback: true,
                fallbackReason: reason,
                lastUpdated: new Date(),
                expiresAt: new Date(Date.now() + 300000), // 5 minutes
                cacheTtlSeconds: 60,
            };
        }
        /**
         * Save fee estimate to database
         */
        async saveFeeEstimate(estimate) {
            try {
                await this.feeEstimateRepository.save(estimate);
            }
            catch (error) {
                this.logger.warn(`Failed to save fee estimate: ${error.message}`);
            }
        }
        /**
         * Get native token for chain
         */
        getNativeToken(chain) {
            const nativeTokens = {
                ethereum: 'ETH',
                polygon: 'MATIC',
                arbitrum: 'ETH',
                optimism: 'ETH',
                base: 'ETH',
                bsc: 'BNB',
                avalanche: 'AVAX',
                fantom: 'FTM',
                gnosis: 'xDAI',
                scroll: 'ETH',
                linea: 'ETH',
                zksync: 'ETH',
                zkevm: 'ETH',
            };
            return nativeTokens[chain.toLowerCase()] || 'ETH';
        }
        /**
         * Get token price in USD (simplified - would use price oracle)
         */
        async getTokenPriceUsd(token) {
            // Simplified price mapping - in production, use a price oracle
            const prices = {
                ETH: 3000,
                MATIC: 0.8,
                BNB: 600,
                AVAX: 35,
                FTM: 0.6,
                xDAI: 1,
            };
            return prices[token];
        }
        /**
         * Estimate transaction duration
         */
        estimateDuration(bridgeName, sourceChain, destinationChain) {
            // Base durations by bridge (in seconds)
            const baseDurations = {
                hop: 300, // 5 minutes
                across: 120, // 2 minutes
                stargate: 600, // 10 minutes
                cctp: 1800, // 30 minutes
                synapse: 600,
                connext: 300,
                layerzero: 120,
                axelar: 300,
                wormhole: 900,
            };
            const baseDuration = baseDurations[bridgeName.toLowerCase()] || 600;
            // Add chain-specific delays
            const chainDelays = {
                ethereum: 60,
                polygon: 30,
                arbitrum: 15,
                optimism: 15,
            };
            const sourceDelay = chainDelays[sourceChain.toLowerCase()] || 30;
            const destDelay = chainDelays[destinationChain.toLowerCase()] || 30;
            return baseDuration + sourceDelay + destDelay;
        }
        /**
         * Build cache key
         */
        buildCacheKey(query) {
            return `${query.bridgeName}:${query.sourceChain}:${query.destinationChain}:${query.token || 'none'}:${query.amount || 0}`;
        }
        /**
         * Map entity to DTO
         */
        mapToDto(estimate) {
            return {
                bridgeName: estimate.bridgeName,
                sourceChain: estimate.sourceChain,
                destinationChain: estimate.destinationChain,
                token: estimate.token || undefined,
                amount: estimate.amount || undefined,
                totalFee: estimate.totalFee,
                gasFee: estimate.gasFee,
                bridgeFee: estimate.bridgeFee,
                liquidityFee: estimate.liquidityFee,
                protocolFee: estimate.protocolFee,
                gasPriceGwei: estimate.gasPriceGwei || undefined,
                gasLimit: estimate.gasLimit || undefined,
                networkCongestion: estimate.networkCongestion || undefined,
                feeToken: estimate.feeToken,
                feeTokenPriceUsd: estimate.feeTokenPriceUsd || undefined,
                totalFeeUsd: estimate.totalFeeUsd || undefined,
                isFallback: estimate.isFallback,
                fallbackReason: estimate.fallbackReason || undefined,
                estimatedDurationSeconds: estimate.estimatedDurationSeconds || undefined,
                lastUpdated: estimate.lastUpdated,
                expiresAt: estimate.expiresAt,
                cacheTtlSeconds: estimate.cacheTtlSeconds,
            };
        }
        /**
         * Clear expired cache entries
         */
        clearExpiredCache() {
            const now = Date.now();
            for (const [key, entry] of this.cache.entries()) {
                if (now - entry.timestamp > entry.ttl) {
                    this.cache.delete(key);
                }
            }
        }
        /**
         * Clear all cache
         */
        clearCache() {
            this.cache.clear();
        }
        /**
         * Get cache statistics
         */
        getCacheStats() {
            return {
                size: this.cache.size,
                hitRate: 0, // Would track in production
            };
        }
    };
    __setFunctionName(_classThis, "FeeEstimationService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        FeeEstimationService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return FeeEstimationService = _classThis;
})();
exports.FeeEstimationService = FeeEstimationService;
//# sourceMappingURL=fee-estimation.service.js.map