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
exports.QuoteScoringService = void 0;
const common_1 = require("@nestjs/common");
const DEFAULT_WEIGHTS = {
    costWeight: 0.5,
    speedWeight: 0.3,
    outputWeight: 0.2,
};
let QuoteScoringService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var QuoteScoringService = _classThis = class {
        /**
         * Assigns a composite score (0–100) to each quote using min-max normalization.
         * Higher score = better option.
         */
        scoreAndRank(quotes, strategy = 'score') {
            const supported = quotes.filter((q) => q.supported && !q.error);
            const unsupported = quotes.filter((q) => !q.supported || q.error);
            if (supported.length === 0)
                return [...unsupported];
            const scored = this.applyScores(supported);
            const ranked = this.sortByStrategy(scored, strategy);
            return [...ranked, ...unsupported];
        }
        applyScores(quotes) {
            const fees = quotes.map((q) => q.totalFeeUSD);
            const times = quotes.map((q) => q.estimatedArrivalTime);
            const outputs = quotes.map((q) => parseFloat(q.outputAmount));
            const minFee = Math.min(...fees);
            const maxFee = Math.max(...fees);
            const minTime = Math.min(...times);
            const maxTime = Math.max(...times);
            const minOutput = Math.min(...outputs);
            const maxOutput = Math.max(...outputs);
            return quotes.map((q) => {
                const costScore = this.normalizeInverted(q.totalFeeUSD, minFee, maxFee);
                const speedScore = this.normalizeInverted(q.estimatedArrivalTime, minTime, maxTime);
                const outputScore = this.normalize(parseFloat(q.outputAmount), minOutput, maxOutput);
                const score = DEFAULT_WEIGHTS.costWeight * costScore +
                    DEFAULT_WEIGHTS.speedWeight * speedScore +
                    DEFAULT_WEIGHTS.outputWeight * outputScore;
                return { ...q, score: parseFloat((score * 100).toFixed(2)) };
            });
        }
        sortByStrategy(quotes, strategy) {
            switch (strategy) {
                case 'cost':
                    return [...quotes].sort((a, b) => a.totalFeeUSD - b.totalFeeUSD);
                case 'speed':
                    return [...quotes].sort((a, b) => a.estimatedArrivalTime - b.estimatedArrivalTime);
                case 'score':
                default:
                    return [...quotes].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
            }
        }
        /** Higher value = better (e.g., output amount) */
        normalize(value, min, max) {
            if (max === min)
                return 1;
            return (value - min) / (max - min);
        }
        /** Lower value = better (e.g., fee, time) */
        normalizeInverted(value, min, max) {
            if (max === min)
                return 1;
            return 1 - (value - min) / (max - min);
        }
    };
    __setFunctionName(_classThis, "QuoteScoringService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        QuoteScoringService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return QuoteScoringService = _classThis;
})();
exports.QuoteScoringService = QuoteScoringService;
//# sourceMappingURL=quote-scoring.service.js.map