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
exports.RankingService = void 0;
const common_1 = require("@nestjs/common");
const enums_1 = require("./enums");
let RankingService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var RankingService = _classThis = class {
        constructor() {
            this.logger = new common_1.Logger(RankingService.name);
            this.RANKING_WEIGHTS = {
                [enums_1.RankingMode.BALANCED]: {
                    cost: 0.3,
                    speed: 0.25,
                    reliability: 0.3,
                    slippage: 0.15,
                },
                [enums_1.RankingMode.LOWEST_COST]: {
                    cost: 0.55,
                    speed: 0.15,
                    reliability: 0.2,
                    slippage: 0.1,
                },
                [enums_1.RankingMode.FASTEST]: {
                    cost: 0.15,
                    speed: 0.55,
                    reliability: 0.2,
                    slippage: 0.1,
                },
            };
        }
        /**
         * Apply ranking to a list of normalized quotes and assign composite scores + positions.
         */
        rankQuotes(quotes, mode) {
            if (!quotes.length)
                return [];
            const weights = this.RANKING_WEIGHTS[mode];
            const maxFee = Math.max(...quotes.map((q) => q.totalFeeUsd));
            const maxTime = Math.max(...quotes.map((q) => q.estimatedTimeSeconds));
            const maxSlippage = Math.max(...quotes.map((q) => q.slippagePercent));
            this.logger.debug(`Ranking ${quotes.length} quotes with mode: ${mode}`);
            const scored = quotes.map((quote) => {
                const costScore = maxFee > 0 ? (1 - quote.totalFeeUsd / maxFee) * 100 : 100;
                const speedScore = maxTime > 0 ? (1 - quote.estimatedTimeSeconds / maxTime) * 100 : 100;
                const reliabilityScore = quote.reliabilityScore;
                const slippageScore = maxSlippage > 0 ? (1 - quote.slippagePercent / maxSlippage) * 100 : 100;
                const compositeScore = costScore * weights.cost +
                    speedScore * weights.speed +
                    reliabilityScore * weights.reliability +
                    slippageScore * weights.slippage;
                return {
                    ...quote,
                    compositeScore: parseFloat(compositeScore.toFixed(2)),
                };
            });
            // Sort descending — higher composite score = better route
            const sorted = scored.sort((a, b) => b.compositeScore - a.compositeScore);
            return sorted.map((quote, index) => ({
                ...quote,
                rankingPosition: index + 1,
            }));
        }
        /**
         * Get the best quote for a given ranking mode.
         */
        getBestQuote(quotes, mode) {
            const ranked = this.rankQuotes(quotes, mode);
            return ranked[0] ?? null;
        }
        /**
         * Get ranking weights for a given mode.
         */
        getWeights(mode) {
            return this.RANKING_WEIGHTS[mode];
        }
    };
    __setFunctionName(_classThis, "RankingService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        RankingService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return RankingService = _classThis;
})();
exports.RankingService = RankingService;
//# sourceMappingURL=ranking.service.js.map