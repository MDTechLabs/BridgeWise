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
exports.BridgeCompareService = void 0;
const common_1 = require("@nestjs/common");
const enums_1 = require("./enums");
let BridgeCompareService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var BridgeCompareService = _classThis = class {
        constructor(aggregationService, slippageService, reliabilityService, rankingService) {
            this.aggregationService = aggregationService;
            this.slippageService = slippageService;
            this.reliabilityService = reliabilityService;
            this.rankingService = rankingService;
            this.logger = new common_1.Logger(BridgeCompareService.name);
        }
        /**
         * Get all normalized, ranked quotes for a bridge request.
         */
        async getQuotes(dto) {
            const startTime = Date.now();
            const params = {
                sourceChain: dto.sourceChain,
                destinationChain: dto.destinationChain,
                sourceToken: dto.sourceToken,
                destinationToken: dto.destinationToken ?? dto.sourceToken,
                amount: dto.amount,
                rankingMode: dto.rankingMode ?? enums_1.RankingMode.BALANCED,
                slippageTolerance: dto.slippageTolerance,
            };
            this.logger.log(`Getting quotes: ${dto.sourceToken} ${dto.sourceChain}→${dto.destinationChain} ` +
                `amount=${dto.amount} mode=${params.rankingMode}`);
            const { quotes: rawQuotes, failedProviders } = await this.aggregationService.fetchRawQuotes(params);
            const slippageMap = this.slippageService.batchEstimateSlippage(rawQuotes, dto.sourceToken, dto.sourceChain, dto.amount);
            const bridgeIds = rawQuotes.map((q) => q.bridgeId);
            const reliabilityMap = this.reliabilityService.batchCalculateScores(bridgeIds);
            const normalizedQuotes = rawQuotes.map((raw) => this.normalizeQuote(raw, params, slippageMap, reliabilityMap));
            const rankedQuotes = this.rankingService.rankQuotes(normalizedQuotes, params.rankingMode);
            const bestRoute = rankedQuotes[0];
            if (!bestRoute) {
                throw new common_1.NotFoundException('No valid routes found for the requested pair');
            }
            const response = {
                quotes: rankedQuotes,
                bestRoute,
                rankingMode: params.rankingMode,
                requestParams: params,
                totalProviders: rawQuotes.length + failedProviders,
                successfulProviders: rawQuotes.length,
                fetchDurationMs: Date.now() - startTime,
            };
            this.logger.log(`Returned ${rankedQuotes.length} quotes in ${response.fetchDurationMs}ms. ` +
                `Best: ${bestRoute.bridgeName} score=${bestRoute.compositeScore}`);
            return response;
        }
        /**
         * Get a specific route's full details by bridgeId.
         */
        async getRouteDetails(dto, bridgeId) {
            const response = await this.getQuotes(dto);
            const route = response.quotes.find((q) => q.bridgeId === bridgeId);
            if (!route) {
                throw new common_1.NotFoundException(`Route not found for bridge: ${bridgeId}`);
            }
            return route;
        }
        /**
         * Get list of all supported bridges.
         */
        getSupportedBridges() {
            return this.aggregationService.getAllProviders();
        }
        // ---------------------------------------------------------------------------
        // Private helpers
        // ---------------------------------------------------------------------------
        normalizeQuote(raw, params, slippageMap, reliabilityMap) {
            const totalFeeUsd = raw.feesUsd + raw.gasCostUsd;
            const slippage = slippageMap.get(raw.bridgeId);
            const reliabilityScore = reliabilityMap.get(raw.bridgeId) ?? 70;
            const bridgeStatus = this.aggregationService.getBridgeStatus(raw.bridgeId);
            return {
                bridgeId: raw.bridgeId,
                bridgeName: raw.bridgeName,
                sourceChain: params.sourceChain,
                destinationChain: params.destinationChain,
                sourceToken: params.sourceToken,
                destinationToken: params.destinationToken ?? params.sourceToken,
                inputAmount: params.amount,
                outputAmount: parseFloat(raw.outputAmount.toFixed(6)),
                totalFeeUsd: parseFloat(totalFeeUsd.toFixed(4)),
                estimatedTimeSeconds: raw.estimatedTimeSeconds,
                slippagePercent: slippage?.expectedSlippage ?? 0,
                reliabilityScore,
                compositeScore: 0, // assigned by RankingService
                rankingPosition: 0, // assigned by RankingService
                bridgeStatus,
                metadata: {
                    feesBreakdown: { protocolFee: raw.feesUsd, gasFee: raw.gasCostUsd },
                    steps: raw.steps,
                },
                fetchedAt: new Date(),
            };
        }
    };
    __setFunctionName(_classThis, "BridgeCompareService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        BridgeCompareService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return BridgeCompareService = _classThis;
})();
exports.BridgeCompareService = BridgeCompareService;
//# sourceMappingURL=bridge-compare.service.js.map