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
exports.FeeAggregationService = exports.QUOTE_TIMEOUT_MS = void 0;
const common_1 = require("@nestjs/common");
exports.QUOTE_TIMEOUT_MS = 10_000;
let FeeAggregationService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var FeeAggregationService = _classThis = class {
        constructor(registry, scoring) {
            this.registry = registry;
            this.scoring = scoring;
            this.logger = new common_1.Logger(FeeAggregationService.name);
        }
        async compareQuotes(request, rankBy = 'score') {
            const adapters = this.registry.listAdapters();
            if (adapters.length === 0) {
                this.logger.warn('No bridge adapters registered');
            }
            const quotes = await this.fetchAllQuotes(adapters, request);
            const ranked = this.scoring.scoreAndRank(quotes, rankBy);
            return {
                fromChain: request.fromChain,
                toChain: request.toChain,
                token: request.token,
                amount: request.amount,
                fetchedAt: new Date().toISOString(),
                quotes: ranked,
            };
        }
        async fetchAllQuotes(adapters, request) {
            const results = await Promise.allSettled(adapters.map((adapter) => this.fetchSingleQuote(adapter, request)));
            return results.map((result, index) => {
                if (result.status === 'fulfilled') {
                    return result.value;
                }
                const adapterName = adapters[index].name;
                this.logger.error(`Failed to fetch quote from "${adapterName}": ${result.reason?.message}`);
                return {
                    bridgeName: adapterName,
                    totalFeeUSD: 0,
                    feeToken: '',
                    estimatedArrivalTime: 0,
                    outputAmount: '0',
                    supported: false,
                    error: result.reason?.message ?? 'Unknown error',
                };
            });
        }
        async fetchSingleQuote(adapter, request) {
            // Check route support before querying
            if (!adapter.supportsRoute(request.fromChain, request.toChain, request.token)) {
                return {
                    bridgeName: adapter.name,
                    totalFeeUSD: 0,
                    feeToken: request.token,
                    estimatedArrivalTime: 0,
                    outputAmount: '0',
                    supported: false,
                    error: `Route ${request.fromChain}→${request.toChain} not supported for ${request.token}`,
                };
            }
            return Promise.race([
                adapter.getQuote(request),
                this.timeoutReject(adapter.name),
            ]);
        }
        timeoutReject(adapterName) {
            return new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout fetching quote from "${adapterName}" after ${exports.QUOTE_TIMEOUT_MS}ms`)), exports.QUOTE_TIMEOUT_MS));
        }
    };
    __setFunctionName(_classThis, "FeeAggregationService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        FeeAggregationService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return FeeAggregationService = _classThis;
})();
exports.FeeAggregationService = FeeAggregationService;
//# sourceMappingURL=fee-aggregation.service.js.map