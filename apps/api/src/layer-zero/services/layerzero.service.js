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
exports.LayerZeroService = void 0;
const common_1 = require("@nestjs/common");
const layerzero_type_1 = require("../types/layerzero.type");
let LayerZeroService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var LayerZeroService = _classThis = class {
        constructor(configService) {
            this.configService = configService;
            this.logger = new common_1.Logger(LayerZeroService.name);
            this.latencyCache = new Map();
            this.healthStatus = new Map();
        }
        async onModuleInit() {
            this.logger.log('Initializing LayerZero Adapter Service');
            await this.initializeHealthChecks();
        }
        /**
         * Estimate fees for a LayerZero bridge transaction
         */
        async estimateFees(route, payload) {
            try {
                this.logger.debug(`Estimating fees for route: ${route.sourceChainId} -> ${route.destinationChainId}`);
                // In production, this would call the actual LayerZero endpoint contract
                // Removed unused variable 'message' to resolve lint warning
                // Simulate fee calculation based on chain and payload size
                const baseFee = this.calculateBaseFee(route.sourceChainId, route.destinationChainId);
                const payloadCost = Buffer.from(payload.replace('0x', ''), 'hex').length * 16;
                const nativeFee = (baseFee + payloadCost).toString();
                const feeEstimate = {
                    nativeFee,
                    zroFee: '0', // ZRO token fee (optional payment method)
                    totalFeeUsd: await this.convertToUsd(nativeFee, route.sourceChainId),
                    estimatedAt: new Date(),
                };
                this.logger.debug(`Fee estimate: ${JSON.stringify(feeEstimate)}`);
                return feeEstimate;
            }
            catch (error) {
                const errMsg = typeof error === 'object' && error && 'message' in error
                    ? error.message
                    : String(error);
                const errStack = typeof error === 'object' && error && 'stack' in error
                    ? error.stack
                    : '';
                this.logger.error(`Failed to estimate fees: ${errMsg}`, errStack);
                throw error;
            }
        }
        /**
         * Estimate latency for a bridge transaction
         */
        async estimateLatency(route) {
            const cacheKey = `${route.sourceChainId}-${route.destinationChainId}`;
            await Promise.resolve(); // Added await to satisfy require-await
            // Check cache first
            const cached = this.latencyCache.get(cacheKey);
            if (cached) {
                const cacheAge = Date.now() - cached.lastUpdated.getTime();
                // Return cached value if less than 5 minutes old
                if (cacheAge < 5 * 60 * 1000) {
                    this.logger.debug(`Returning cached latency for ${cacheKey}`);
                    return cached;
                }
            }
            // Calculate new estimate
            const estimate = this.calculateLatencyEstimate(route.sourceChainId, route.destinationChainId);
            this.latencyCache.set(cacheKey, estimate);
            return estimate;
        }
        /**
         * Get complete bridge estimate (fees + latency)
         */
        async getBridgeEstimate(route, payload) {
            const [fee, latency] = await Promise.all([
                this.estimateFees(route, payload),
                this.estimateLatency(route),
            ]);
            return {
                fee,
                latency,
                route,
            };
        }
        /**
         * Health check for specific chain endpoint
         */
        async checkHealth(chainId) {
            const startTime = Date.now();
            const endpoint = this.getEndpointForChain(chainId);
            const errors = [];
            await Promise.resolve(); // Added await to satisfy require-await
            try {
                // Simulate endpoint health check
                // In production, this would ping the actual LayerZero endpoint
                await this.pingEndpoint(endpoint);
                const latency = Date.now() - startTime;
                const isHealthy = latency < 5000; // Consider unhealthy if > 5s
                if (!isHealthy) {
                    errors.push(`High latency: ${latency}ms`);
                }
                const status = {
                    isHealthy,
                    endpoint,
                    chainId,
                    latency,
                    lastChecked: new Date(),
                    errors: errors.length > 0 ? errors : undefined,
                };
                this.healthStatus.set(chainId, status);
                return status;
            }
            catch (error) {
                const errMsg = typeof error === 'object' && error && 'message' in error
                    ? error.message
                    : String(error);
                this.logger.error(`Health check failed for chain ${chainId}: ${errMsg}`);
                const status = {
                    isHealthy: false,
                    endpoint,
                    chainId,
                    latency: Date.now() - startTime,
                    lastChecked: new Date(),
                    errors: [errMsg],
                };
                this.healthStatus.set(chainId, status);
                return status;
            }
        }
        /**
         * Check health of all configured chains
         */
        async checkAllHealth() {
            const chains = Object.values(layerzero_type_1.LayerZeroChainId).filter((v) => typeof v === 'number');
            const healthChecks = await Promise.all(chains.map((chainId) => this.checkHealth(chainId)));
            return healthChecks;
        }
        /**
         * Get cached health status
         */
        getHealthStatus(chainId) {
            if (chainId) {
                return this.healthStatus.get(chainId);
            }
            return Array.from(this.healthStatus.values());
        }
        /**
         * Private helper methods
         */
        async initializeHealthChecks() {
            this.logger.log('Running initial health checks...');
            await this.checkAllHealth();
            // Schedule periodic health checks every 60 seconds
            setInterval(() => {
                this.checkAllHealth().catch((error) => {
                    this.logger.error('Periodic health check failed', error);
                });
            }, 60000);
        }
        calculateBaseFee(sourceChain, destChain) {
            // Base fees vary by chain combination
            const chainPairKey = `${sourceChain}-${destChain}`;
            const baseFees = {
                [`${layerzero_type_1.LayerZeroChainId.ETHEREUM}-${layerzero_type_1.LayerZeroChainId.POLYGON}`]: 500000000000000, // 0.0005 ETH
                [`${layerzero_type_1.LayerZeroChainId.ETHEREUM}-${layerzero_type_1.LayerZeroChainId.ARBITRUM}`]: 300000000000000, // 0.0003 ETH
                [`${layerzero_type_1.LayerZeroChainId.POLYGON}-${layerzero_type_1.LayerZeroChainId.ETHEREUM}`]: 1000000000000000000, // 1 MATIC
                default: 1000000000000000, // 0.001 ETH default
            };
            return baseFees[chainPairKey] || baseFees.default;
        }
        calculateLatencyEstimate(sourceChain, destChain) {
            // Latency estimates based on chain finality and network conditions
            const baseLatency = {
                [layerzero_type_1.LayerZeroChainId.ETHEREUM]: 900, // ~15 minutes for finality
                [layerzero_type_1.LayerZeroChainId.POLYGON]: 180, // ~3 minutes
                [layerzero_type_1.LayerZeroChainId.ARBITRUM]: 120, // ~2 minutes
                [layerzero_type_1.LayerZeroChainId.OPTIMISM]: 120,
                [layerzero_type_1.LayerZeroChainId.BSC]: 120,
                [layerzero_type_1.LayerZeroChainId.AVALANCHE]: 60,
                [layerzero_type_1.LayerZeroChainId.FANTOM]: 60,
            };
            const sourceLatency = baseLatency[sourceChain] || 300;
            const destLatency = baseLatency[destChain] || 300;
            const networkOverhead = 60; // Additional network processing time
            const estimatedSeconds = sourceLatency + destLatency + networkOverhead;
            // Confidence based on how well-tested the route is
            let confidence = 'medium';
            if (sourceChain === layerzero_type_1.LayerZeroChainId.ETHEREUM ||
                destChain === layerzero_type_1.LayerZeroChainId.ETHEREUM) {
                confidence = 'high'; // Well-established routes
            }
            return {
                estimatedSeconds,
                confidence,
                lastUpdated: new Date(),
            };
        }
        async convertToUsd(weiAmount, chainId) {
            // In production, fetch real-time prices from an oracle or price feed
            const mockPrices = {
                [layerzero_type_1.LayerZeroChainId.ETHEREUM]: 2000, // ETH price
                [layerzero_type_1.LayerZeroChainId.POLYGON]: 0.8, // MATIC price
                [layerzero_type_1.LayerZeroChainId.BSC]: 300, // BNB price
                [layerzero_type_1.LayerZeroChainId.AVALANCHE]: 30, // AVAX price
                [layerzero_type_1.LayerZeroChainId.ARBITRUM]: 2000, // Uses ETH
                [layerzero_type_1.LayerZeroChainId.OPTIMISM]: 2000, // Uses ETH
                [layerzero_type_1.LayerZeroChainId.FANTOM]: 0.5, // FTM price
            };
            const price = mockPrices[chainId] || 1;
            const ethAmount = Number(weiAmount) / 1e18;
            return ethAmount * price;
        }
        getEndpointForChain(chainId) {
            // In production, these would be actual LayerZero endpoint addresses
            const endpoints = {
                [layerzero_type_1.LayerZeroChainId.ETHEREUM]: '0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675',
                [layerzero_type_1.LayerZeroChainId.BSC]: '0x3c2269811836af69497E5F486A85D7316753cf62',
                [layerzero_type_1.LayerZeroChainId.POLYGON]: '0x3c2269811836af69497E5F486A85D7316753cf62',
                [layerzero_type_1.LayerZeroChainId.AVALANCHE]: '0x3c2269811836af69497E5F486A85D7316753cf62',
                [layerzero_type_1.LayerZeroChainId.ARBITRUM]: '0x3c2269811836af69497E5F486A85D7316753cf62',
                [layerzero_type_1.LayerZeroChainId.OPTIMISM]: '0x3c2269811836af69497E5F486A85D7316753cf62',
                [layerzero_type_1.LayerZeroChainId.FANTOM]: '0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7',
            };
            return endpoints[chainId] || '';
        }
        async pingEndpoint(endpoint) {
            // Simulate endpoint check with random delay
            const delay = Math.random() * 1000 + 500;
            await new Promise((resolve) => setTimeout(resolve, delay));
            // Simulate occasional failures (5% chance)
            if (Math.random() < 0.05) {
                throw new Error('Endpoint unreachable');
            }
        }
    };
    __setFunctionName(_classThis, "LayerZeroService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        LayerZeroService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return LayerZeroService = _classThis;
})();
exports.LayerZeroService = LayerZeroService;
//# sourceMappingURL=layerzero.service.js.map