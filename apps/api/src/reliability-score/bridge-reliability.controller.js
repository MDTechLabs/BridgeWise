"use strict";
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
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
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeReliabilityController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const reliability_dto_1 = require("./reliability.dto");
let BridgeReliabilityController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)('Bridge Reliability'), (0, common_1.Controller)('bridge-reliability')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _recordEvent_decorators;
    let _getReliability_decorators;
    let _getAllMetrics_decorators;
    let _getRankingFactors_decorators;
    var BridgeReliabilityController = _classThis = class {
        constructor(reliabilityService) {
            this.reliabilityService = (__runInitializers(this, _instanceExtraInitializers), reliabilityService);
        }
        /**
         * Record a bridge transaction outcome (called internally by bridge adapters).
         */
        async recordEvent(dto) {
            return this.reliabilityService.recordEvent(dto);
        }
        /**
         * Get reliability score for a specific bridge route.
         */
        async getReliability(dto) {
            return this.reliabilityService.getReliability(dto);
        }
        /**
         * Get all cached reliability metrics (for admin / ranking engine).
         */
        async getAllMetrics() {
            return this.reliabilityService.getAllMetrics();
        }
        /**
         * Get ranking adjustment factors for all bridges on a route.
         * Called by Smart Bridge Ranking engine (Issue #5).
         */
        async getRankingFactors(sourceChain, destinationChain, threshold, ignoreReliability) {
            return this.reliabilityService.getBulkReliabilityFactors(sourceChain, destinationChain, { threshold, ignoreReliability });
        }
    };
    __setFunctionName(_classThis, "BridgeReliabilityController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _recordEvent_decorators = [(0, common_1.Post)('events'), (0, common_1.HttpCode)(common_1.HttpStatus.CREATED), (0, swagger_1.ApiOperation)({ summary: 'Record a bridge transaction outcome' }), (0, swagger_1.ApiBody)({ type: reliability_dto_1.RecordBridgeEventDto })];
        _getReliability_decorators = [(0, common_1.Get)(), (0, swagger_1.ApiOperation)({ summary: 'Get reliability score for a bridge route' }), (0, swagger_1.ApiOkResponse)({ type: reliability_dto_1.BridgeReliabilityResponseDto })];
        _getAllMetrics_decorators = [(0, common_1.Get)('all'), (0, swagger_1.ApiOperation)({ summary: 'List all bridge reliability metrics (admin)' })];
        _getRankingFactors_decorators = [(0, common_1.Get)('ranking-factors'), (0, swagger_1.ApiOperation)({
                summary: 'Get reliability ranking factors for a route',
                description: 'Returns reliability-adjusted scores for all bridges on a route.',
            })];
        __esDecorate(_classThis, null, _recordEvent_decorators, { kind: "method", name: "recordEvent", static: false, private: false, access: { has: obj => "recordEvent" in obj, get: obj => obj.recordEvent }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getReliability_decorators, { kind: "method", name: "getReliability", static: false, private: false, access: { has: obj => "getReliability" in obj, get: obj => obj.getReliability }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getAllMetrics_decorators, { kind: "method", name: "getAllMetrics", static: false, private: false, access: { has: obj => "getAllMetrics" in obj, get: obj => obj.getAllMetrics }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getRankingFactors_decorators, { kind: "method", name: "getRankingFactors", static: false, private: false, access: { has: obj => "getRankingFactors" in obj, get: obj => obj.getRankingFactors }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        BridgeReliabilityController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return BridgeReliabilityController = _classThis;
})();
exports.BridgeReliabilityController = BridgeReliabilityController;
//# sourceMappingURL=bridge-reliability.controller.js.map