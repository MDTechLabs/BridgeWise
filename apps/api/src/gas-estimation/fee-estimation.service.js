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
const fees_interface_1 = require("./interfaces/fees.interface");
let FeeEstimationService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var FeeEstimationService = _classThis = class {
        constructor(stellarAdapter, layerZeroAdapter, hopAdapter, tokenService, auditLogger) {
            this.stellarAdapter = stellarAdapter;
            this.layerZeroAdapter = layerZeroAdapter;
            this.hopAdapter = hopAdapter;
            this.tokenService = tokenService;
            this.auditLogger = auditLogger;
            this.logger = new common_1.Logger(FeeEstimationService.name);
        }
        /**
         * Get fee estimates for all supported networks
         */
        async getAllFeeEstimates() {
            const estimates = await Promise.allSettled([
                this.getStellarFees(),
                this.getLayerZeroFees(),
                this.getHopFees(),
            ]);
            const stellarResult = this.extractResult(estimates[0], 'Stellar');
            const layerzeroResult = this.extractResult(estimates[1], 'LayerZero');
            const hopResult = this.extractResult(estimates[2], 'Hop');
            // Count only providers that are actually available
            const successfulProviders = [
                stellarResult,
                layerzeroResult,
                hopResult,
            ].filter((result) => result.available).length;
            return {
                timestamp: Date.now(),
                networks: {
                    stellar: stellarResult,
                    layerzero: layerzeroResult,
                    hop: hopResult,
                },
                metadata: {
                    successfulProviders,
                    totalProviders: estimates.length,
                },
            };
        }
        /**
         * Get fee estimate for a specific network
         */
        async getFeeEstimate(network) {
            const startTime = Date.now();
            try {
                let result;
                switch (network) {
                    case fees_interface_1.NetworkType.STELLAR:
                        result = await this.getStellarFees();
                        break;
                    case fees_interface_1.NetworkType.LAYERZERO:
                        result = await this.getLayerZeroFees();
                        break;
                    case fees_interface_1.NetworkType.HOP:
                        result = await this.getHopFees();
                        break;
                    default:
                        throw new Error(`Unsupported network: ${network}`);
                }
                // Log successful fee estimation
                if (result.available) {
                    this.auditLogger.logFeeEstimation({
                        adapter: network,
                        sourceChain: network,
                        destinationChain: network,
                        estimatedFee: result.fees?.standard || '0',
                        responseTimeMs: Date.now() - startTime,
                    });
                }
                return result;
            }
            catch (error) {
                this.logger.error(`Failed to fetch fees for ${network}:`, error.message);
                return this.createUnavailableEstimate(network, error.message);
            }
        }
        /**
         * Get Stellar network fees
         */
        async getStellarFees() {
            try {
                const rawFees = await this.stellarAdapter.getFees();
                return {
                    network: fees_interface_1.NetworkType.STELLAR,
                    available: true,
                    fees: {
                        slow: this.tokenService.normalizeAmount(rawFees.min, rawFees.decimals),
                        standard: this.tokenService.normalizeAmount(rawFees.mode, rawFees.decimals),
                        fast: this.tokenService.normalizeAmount(rawFees.p90, rawFees.decimals),
                    },
                    currency: rawFees.symbol,
                    estimatedTime: {
                        slow: 5000, // 5 seconds
                        standard: 5000,
                        fast: 5000,
                    },
                    lastUpdated: Date.now(),
                };
            }
            catch (error) {
                this.logger.error('Stellar adapter failed:', error.message);
                return this.createUnavailableEstimate(fees_interface_1.NetworkType.STELLAR, error.message);
            }
        }
        /**
         * Get LayerZero cross-chain fees
         */
        async getLayerZeroFees() {
            try {
                const rawFees = await this.layerZeroAdapter.getFees();
                return {
                    network: fees_interface_1.NetworkType.LAYERZERO,
                    available: true,
                    fees: {
                        slow: this.tokenService.normalizeAmount(rawFees.baseFee, rawFees.decimals),
                        standard: this.tokenService.normalizeAmount(rawFees.standardFee, rawFees.decimals),
                        fast: this.tokenService.normalizeAmount(rawFees.priorityFee, rawFees.decimals),
                    },
                    currency: rawFees.symbol,
                    estimatedTime: {
                        slow: 300000, // 5 minutes
                        standard: 180000, // 3 minutes
                        fast: 60000, // 1 minute
                    },
                    lastUpdated: Date.now(),
                    additionalData: {
                        destinationChain: rawFees.destinationChain,
                        sourceChain: rawFees.sourceChain,
                    },
                };
            }
            catch (error) {
                this.logger.error('LayerZero adapter failed:', error.message);
                return this.createUnavailableEstimate(fees_interface_1.NetworkType.LAYERZERO, error.message);
            }
        }
        /**
         * Get Hop Protocol bridge fees
         */
        async getHopFees() {
            try {
                const rawFees = await this.hopAdapter.getFees();
                return {
                    network: fees_interface_1.NetworkType.HOP,
                    available: true,
                    fees: {
                        slow: this.tokenService.normalizeAmount(rawFees.lpFee, rawFees.decimals),
                        standard: this.tokenService.normalizeAmount(rawFees.lpFee + rawFees.bonderFee, rawFees.decimals),
                        fast: this.tokenService.normalizeAmount(rawFees.lpFee + rawFees.bonderFee + rawFees.destinationTxFee, rawFees.decimals),
                    },
                    currency: rawFees.symbol,
                    estimatedTime: {
                        slow: 1200000, // 20 minutes
                        standard: 600000, // 10 minutes
                        fast: 300000, // 5 minutes
                    },
                    lastUpdated: Date.now(),
                    additionalData: {
                        route: `${rawFees.sourceChain} -> ${rawFees.destinationChain}`,
                        token: rawFees.token,
                    },
                };
            }
            catch (error) {
                this.logger.error('Hop adapter failed:', error.message);
                return this.createUnavailableEstimate(fees_interface_1.NetworkType.HOP, error.message);
            }
        }
        /**
         * Extract result from Promise.allSettled
         */
        extractResult(result, providerName) {
            if (result.status === 'fulfilled') {
                return result.value;
            }
            this.logger.warn(`${providerName} provider unavailable:`, result.reason?.message);
            return this.createUnavailableEstimate(providerName.toLowerCase(), result.reason?.message || 'Unknown error');
        }
        /**
         * Create unavailable estimate fallback
         */
        createUnavailableEstimate(network, error) {
            return {
                network,
                available: false,
                fees: {
                    slow: '0',
                    standard: '0',
                    fast: '0',
                },
                currency: 'N/A',
                estimatedTime: {
                    slow: 0,
                    standard: 0,
                    fast: 0,
                },
                lastUpdated: Date.now(),
                error,
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