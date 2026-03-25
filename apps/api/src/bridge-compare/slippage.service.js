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
exports.SlippageService = void 0;
const common_1 = require("@nestjs/common");
let SlippageService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var SlippageService = _classThis = class {
        constructor() {
            this.logger = new common_1.Logger(SlippageService.name);
            // Simulated liquidity pool data — in production, fetched from on-chain / oracles
            this.MOCK_POOLS = [
                {
                    token: 'USDC',
                    chain: 'ethereum',
                    tvlUsd: 50_000_000,
                    dailyVolumeUsd: 10_000_000,
                },
                {
                    token: 'USDC',
                    chain: 'stellar',
                    tvlUsd: 5_000_000,
                    dailyVolumeUsd: 1_000_000,
                },
                {
                    token: 'USDT',
                    chain: 'ethereum',
                    tvlUsd: 40_000_000,
                    dailyVolumeUsd: 8_000_000,
                },
                {
                    token: 'ETH',
                    chain: 'ethereum',
                    tvlUsd: 200_000_000,
                    dailyVolumeUsd: 50_000_000,
                },
                {
                    token: 'XLM',
                    chain: 'stellar',
                    tvlUsd: 2_000_000,
                    dailyVolumeUsd: 500_000,
                },
            ];
        }
        /**
         * Estimate slippage for a bridge quote based on amount vs. pool liquidity.
         */
        estimateSlippage(quote, sourceToken, sourceChain, amountUsd) {
            const pool = this.MOCK_POOLS.find((p) => p.token.toUpperCase() === sourceToken.toUpperCase() &&
                p.chain === sourceChain);
            if (!pool) {
                this.logger.warn(`No liquidity data for ${sourceToken} on ${sourceChain}, using conservative estimate`);
                return this.conservativeEstimate(amountUsd);
            }
            const impactRatio = amountUsd / pool.tvlUsd;
            const expectedSlippage = this.calculatePriceImpact(impactRatio);
            const maxSlippage = expectedSlippage * 2.5;
            const confidence = this.determineConfidence(pool, amountUsd);
            return {
                expectedSlippage: parseFloat(expectedSlippage.toFixed(4)),
                maxSlippage: parseFloat(maxSlippage.toFixed(4)),
                confidence,
            };
        }
        /**
         * Batch estimate slippage across multiple quotes.
         */
        batchEstimateSlippage(quotes, sourceToken, sourceChain, amountUsd) {
            const results = new Map();
            for (const quote of quotes) {
                results.set(quote.bridgeId, this.estimateSlippage(quote, sourceToken, sourceChain, amountUsd));
            }
            return results;
        }
        calculatePriceImpact(impactRatio) {
            // Approximation of constant-product AMM price impact: 1 - 1/sqrt(1 + x)
            return (1 - 1 / Math.sqrt(1 + impactRatio)) * 100;
        }
        determineConfidence(pool, amountUsd) {
            const ratio = amountUsd / pool.tvlUsd;
            if (ratio < 0.001)
                return 'high';
            if (ratio < 0.01)
                return 'medium';
            return 'low';
        }
        conservativeEstimate(amountUsd) {
            const base = Math.min(amountUsd / 100_000, 5);
            return {
                expectedSlippage: parseFloat(base.toFixed(4)),
                maxSlippage: parseFloat((base * 2).toFixed(4)),
                confidence: 'low',
            };
        }
    };
    __setFunctionName(_classThis, "SlippageService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        SlippageService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return SlippageService = _classThis;
})();
exports.SlippageService = SlippageService;
//# sourceMappingURL=slippage.service.js.map