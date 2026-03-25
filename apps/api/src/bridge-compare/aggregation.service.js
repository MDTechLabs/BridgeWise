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
exports.AggregationService = void 0;
const common_1 = require("@nestjs/common");
const enums_1 = require("./enums");
let AggregationService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var AggregationService = _classThis = class {
        constructor() {
            this.logger = new common_1.Logger(AggregationService.name);
            this.MOCK_PROVIDERS = [
                {
                    id: 'stargate',
                    name: 'Stargate Finance',
                    apiBaseUrl: 'https://api.stargate.finance',
                    supportedChains: [
                        'ethereum',
                        'polygon',
                        'arbitrum',
                        'optimism',
                        'binance',
                        'avalanche',
                    ],
                    supportedTokens: ['USDC', 'USDT', 'ETH', 'WBTC'],
                    isActive: true,
                },
                {
                    id: 'squid',
                    name: 'Squid Router',
                    apiBaseUrl: 'https://api.0xsquid.com',
                    supportedChains: [
                        'ethereum',
                        'polygon',
                        'arbitrum',
                        'avalanche',
                        'stellar',
                    ],
                    supportedTokens: ['USDC', 'USDT', 'ETH', 'XLM'],
                    isActive: true,
                },
                {
                    id: 'hop',
                    name: 'Hop Protocol',
                    apiBaseUrl: 'https://api.hop.exchange',
                    supportedChains: ['ethereum', 'polygon', 'arbitrum', 'optimism'],
                    supportedTokens: ['USDC', 'USDT', 'ETH', 'MATIC'],
                    isActive: true,
                },
                {
                    id: 'cbridge',
                    name: 'cBridge',
                    apiBaseUrl: 'https://cbridge-prod2.celer.app',
                    supportedChains: [
                        'ethereum',
                        'polygon',
                        'arbitrum',
                        'binance',
                        'avalanche',
                    ],
                    supportedTokens: ['USDC', 'USDT', 'ETH', 'BNB'],
                    isActive: true,
                },
                {
                    id: 'soroswap',
                    name: 'Soroswap Bridge',
                    apiBaseUrl: 'https://api.soroswap.finance',
                    supportedChains: ['stellar', 'ethereum'],
                    supportedTokens: ['USDC', 'XLM', 'yXLM'],
                    isActive: true,
                },
            ];
            this.MOCK_QUOTE_TEMPLATES = {
                stargate: {
                    feesUsd: 0.8,
                    gasCostUsd: 1.2,
                    estimatedTimeSeconds: 45,
                    outputRatio: 0.989,
                },
                squid: {
                    feesUsd: 1.1,
                    gasCostUsd: 0.9,
                    estimatedTimeSeconds: 30,
                    outputRatio: 0.992,
                },
                hop: {
                    feesUsd: 0.6,
                    gasCostUsd: 1.5,
                    estimatedTimeSeconds: 120,
                    outputRatio: 0.985,
                },
                cbridge: {
                    feesUsd: 0.7,
                    gasCostUsd: 1.3,
                    estimatedTimeSeconds: 90,
                    outputRatio: 0.987,
                },
                soroswap: {
                    feesUsd: 0.3,
                    gasCostUsd: 0.2,
                    estimatedTimeSeconds: 15,
                    outputRatio: 0.997,
                },
            };
        }
        /**
         * Fetch raw quotes from all providers supporting the given route.
         * Returns an object with successful quotes and the count of failed providers.
         */
        async fetchRawQuotes(params) {
            const eligibleProviders = this.getEligibleProviders(params);
            if (!eligibleProviders.length) {
                throw new common_1.HttpException(`No bridge providers support the route ${params.sourceToken} from ${params.sourceChain} → ${params.destinationChain}`, common_1.HttpStatus.NOT_FOUND);
            }
            this.logger.log(`Fetching quotes from ${eligibleProviders.length} providers for ` +
                `${params.sourceToken} ${params.sourceChain}→${params.destinationChain} amount=${params.amount}`);
            const results = await Promise.allSettled(eligibleProviders.map((p) => this.fetchSingleProviderQuote(p, params)));
            const quotes = [];
            let failedProviders = 0;
            for (const result of results) {
                if (result.status === 'fulfilled') {
                    quotes.push(result.value);
                }
                else {
                    failedProviders++;
                    this.logger.warn(`Provider quote fetch failed: ${result.reason}`);
                }
            }
            if (!quotes.length) {
                throw new common_1.HttpException('All bridge providers failed to respond. Please try again later.', common_1.HttpStatus.SERVICE_UNAVAILABLE);
            }
            return { quotes, failedProviders };
        }
        /**
         * Get active providers that support the requested route.
         */
        getEligibleProviders(params) {
            return this.MOCK_PROVIDERS.filter((provider) => {
                if (!provider.isActive)
                    return false;
                const supportsSourceChain = provider.supportedChains.includes(params.sourceChain);
                const supportsDestChain = provider.supportedChains.includes(params.destinationChain);
                const supportsToken = provider.supportedTokens.some((t) => t.toUpperCase() === params.sourceToken.toUpperCase());
                return supportsSourceChain && supportsDestChain && supportsToken;
            });
        }
        /**
         * Fetch a quote from a single provider (simulated; real impl uses HttpService).
         */
        async fetchSingleProviderQuote(provider, params) {
            // Simulate occasional provider failures (5% chance)
            if (Math.random() < 0.05) {
                throw new Error(`Provider ${provider.name} returned timeout`);
            }
            const template = this.MOCK_QUOTE_TEMPLATES[provider.id] ?? {
                feesUsd: 1.0,
                gasCostUsd: 1.0,
                estimatedTimeSeconds: 60,
                outputRatio: 0.99,
            };
            // Scale fees relative to amount
            const scaledFees = template.feesUsd * (1 + Math.log10(Math.max(1, params.amount / 100)));
            const scaledGas = template.gasCostUsd;
            const outputAmount = params.amount * template.outputRatio;
            return {
                bridgeId: provider.id,
                bridgeName: provider.name,
                outputAmount,
                feesUsd: parseFloat(scaledFees.toFixed(4)),
                gasCostUsd: parseFloat(scaledGas.toFixed(4)),
                estimatedTimeSeconds: template.estimatedTimeSeconds,
                steps: [
                    {
                        protocol: provider.name,
                        type: 'bridge',
                        inputAmount: params.amount,
                        outputAmount,
                        feeUsd: scaledFees,
                    },
                ],
            };
        }
        getAllProviders() {
            return this.MOCK_PROVIDERS;
        }
        getBridgeStatus(bridgeId) {
            const provider = this.MOCK_PROVIDERS.find((p) => p.id === bridgeId);
            if (!provider)
                return enums_1.BridgeStatus.OFFLINE;
            return provider.isActive ? enums_1.BridgeStatus.ACTIVE : enums_1.BridgeStatus.OFFLINE;
        }
    };
    __setFunctionName(_classThis, "AggregationService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        AggregationService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return AggregationService = _classThis;
})();
exports.AggregationService = AggregationService;
//# sourceMappingURL=aggregation.service.js.map