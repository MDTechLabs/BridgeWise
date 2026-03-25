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
exports.BridgeBenchmarkController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const bridge_benchmark_dto_1 = require("./dto/bridge-benchmark.dto");
const bridge_benchmark_entity_1 = require("./entities/bridge-benchmark.entity");
let BridgeBenchmarkController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)('Bridge Benchmarks'), (0, common_1.Controller)('api/v1/bridges')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _initiate_decorators;
    let _confirm_decorators;
    let _updateStatus_decorators;
    let _findOne_decorators;
    let _getSpeedMetrics_decorators;
    var BridgeBenchmarkController = _classThis = class {
        constructor(benchmarkService) {
            this.benchmarkService = (__runInitializers(this, _instanceExtraInitializers), benchmarkService);
        }
        initiate(dto) {
            return this.benchmarkService.initiate(dto);
        }
        confirm(id, dto) {
            return this.benchmarkService.confirm(id, dto);
        }
        updateStatus(id, dto) {
            return this.benchmarkService.updateStatus(id, dto);
        }
        findOne(id) {
            return this.benchmarkService.findOne(id);
        }
        getSpeedMetrics(query) {
            return this.benchmarkService.getSpeedMetrics(query);
        }
    };
    __setFunctionName(_classThis, "BridgeBenchmarkController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _initiate_decorators = [(0, common_1.Post)('benchmarks'), (0, common_1.HttpCode)(common_1.HttpStatus.CREATED), (0, swagger_1.ApiOperation)({
                summary: 'Initiate a bridge transaction benchmark',
                description: 'Records the start of a bridge transaction lifecycle for speed tracking.',
            }), (0, swagger_1.ApiResponse)({
                status: 201,
                description: 'Benchmark initiated',
                type: bridge_benchmark_entity_1.BridgeBenchmark,
            })];
        _confirm_decorators = [(0, common_1.Patch)('benchmarks/:id/confirm'), (0, swagger_1.ApiOperation)({
                summary: 'Confirm destination chain settlement',
                description: 'Records the completion timestamp and calculates total settlement duration.',
            }), (0, swagger_1.ApiParam)({ name: 'id', description: 'Benchmark UUID' }), (0, swagger_1.ApiResponse)({
                status: 200,
                description: 'Benchmark confirmed',
                type: bridge_benchmark_entity_1.BridgeBenchmark,
            })];
        _updateStatus_decorators = [(0, common_1.Patch)('benchmarks/:id/status'), (0, swagger_1.ApiOperation)({
                summary: 'Update benchmark transaction status',
                description: 'Update the status (pending, submitted, confirmed, failed).',
            }), (0, swagger_1.ApiParam)({ name: 'id', description: 'Benchmark UUID' }), (0, swagger_1.ApiResponse)({
                status: 200,
                description: 'Status updated',
                type: bridge_benchmark_entity_1.BridgeBenchmark,
            })];
        _findOne_decorators = [(0, common_1.Get)('benchmarks/:id'), (0, swagger_1.ApiOperation)({ summary: 'Get a single benchmark record' }), (0, swagger_1.ApiParam)({ name: 'id', description: 'Benchmark UUID' }), (0, swagger_1.ApiResponse)({ status: 200, type: bridge_benchmark_entity_1.BridgeBenchmark })];
        _getSpeedMetrics_decorators = [(0, common_1.Get)('speed-metrics'), (0, swagger_1.ApiOperation)({
                summary: 'Get bridge speed metrics',
                description: 'Returns aggregated speed metrics per bridge/route including rolling averages for the last N transactions (default 50). Suitable for consumption by the ranking engine.',
            }), (0, swagger_1.ApiResponse)({
                status: 200,
                description: 'Speed metrics per bridge route',
                type: bridge_benchmark_dto_1.SpeedMetricsResponseDto,
            })];
        __esDecorate(_classThis, null, _initiate_decorators, { kind: "method", name: "initiate", static: false, private: false, access: { has: obj => "initiate" in obj, get: obj => obj.initiate }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _confirm_decorators, { kind: "method", name: "confirm", static: false, private: false, access: { has: obj => "confirm" in obj, get: obj => obj.confirm }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _updateStatus_decorators, { kind: "method", name: "updateStatus", static: false, private: false, access: { has: obj => "updateStatus" in obj, get: obj => obj.updateStatus }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _findOne_decorators, { kind: "method", name: "findOne", static: false, private: false, access: { has: obj => "findOne" in obj, get: obj => obj.findOne }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getSpeedMetrics_decorators, { kind: "method", name: "getSpeedMetrics", static: false, private: false, access: { has: obj => "getSpeedMetrics" in obj, get: obj => obj.getSpeedMetrics }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        BridgeBenchmarkController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return BridgeBenchmarkController = _classThis;
})();
exports.BridgeBenchmarkController = BridgeBenchmarkController;
//# sourceMappingURL=bridge-benchmark.controller.js.map