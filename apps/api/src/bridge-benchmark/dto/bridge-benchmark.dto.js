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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpeedMetricsResponseDto = exports.RouteSpeedMetricDto = exports.SpeedMetricsQueryDto = exports.UpdateBenchmarkStatusDto = exports.ConfirmBenchmarkDto = exports.InitiateBenchmarkDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const bridge_benchmark_entity_1 = require("../entities/bridge-benchmark.entity");
let InitiateBenchmarkDto = (() => {
    var _a;
    let _bridgeName_decorators;
    let _bridgeName_initializers = [];
    let _bridgeName_extraInitializers = [];
    let _sourceChain_decorators;
    let _sourceChain_initializers = [];
    let _sourceChain_extraInitializers = [];
    let _destinationChain_decorators;
    let _destinationChain_initializers = [];
    let _destinationChain_extraInitializers = [];
    let _token_decorators;
    let _token_initializers = [];
    let _token_extraInitializers = [];
    let _sourceChainType_decorators;
    let _sourceChainType_initializers = [];
    let _sourceChainType_extraInitializers = [];
    let _destinationChainType_decorators;
    let _destinationChainType_initializers = [];
    let _destinationChainType_extraInitializers = [];
    let _amount_decorators;
    let _amount_initializers = [];
    let _amount_extraInitializers = [];
    let _quoteRequestedAt_decorators;
    let _quoteRequestedAt_initializers = [];
    let _quoteRequestedAt_extraInitializers = [];
    return _a = class InitiateBenchmarkDto {
            constructor() {
                this.bridgeName = __runInitializers(this, _bridgeName_initializers, void 0);
                this.sourceChain = (__runInitializers(this, _bridgeName_extraInitializers), __runInitializers(this, _sourceChain_initializers, void 0));
                this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
                this.token = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _token_initializers, void 0));
                this.sourceChainType = (__runInitializers(this, _token_extraInitializers), __runInitializers(this, _sourceChainType_initializers, void 0));
                this.destinationChainType = (__runInitializers(this, _sourceChainType_extraInitializers), __runInitializers(this, _destinationChainType_initializers, void 0));
                this.amount = (__runInitializers(this, _destinationChainType_extraInitializers), __runInitializers(this, _amount_initializers, void 0));
                this.quoteRequestedAt = (__runInitializers(this, _amount_extraInitializers), __runInitializers(this, _quoteRequestedAt_initializers, void 0));
                __runInitializers(this, _quoteRequestedAt_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _bridgeName_decorators = [(0, swagger_1.ApiProperty)({ example: 'Stargate' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _sourceChain_decorators = [(0, swagger_1.ApiProperty)({ example: 'ethereum' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _destinationChain_decorators = [(0, swagger_1.ApiProperty)({ example: 'polygon' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _token_decorators = [(0, swagger_1.ApiProperty)({ example: 'USDC' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _sourceChainType_decorators = [(0, swagger_1.ApiPropertyOptional)({ enum: bridge_benchmark_entity_1.ChainType, default: bridge_benchmark_entity_1.ChainType.EVM }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsEnum)(bridge_benchmark_entity_1.ChainType)];
            _destinationChainType_decorators = [(0, swagger_1.ApiPropertyOptional)({ enum: bridge_benchmark_entity_1.ChainType, default: bridge_benchmark_entity_1.ChainType.EVM }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsEnum)(bridge_benchmark_entity_1.ChainType)];
            _amount_decorators = [(0, swagger_1.ApiPropertyOptional)({ example: '1000.00' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsNumber)(), (0, class_validator_1.IsPositive)()];
            _quoteRequestedAt_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: 'ISO timestamp when quote was requested',
                }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsDateString)()];
            __esDecorate(null, null, _bridgeName_decorators, { kind: "field", name: "bridgeName", static: false, private: false, access: { has: obj => "bridgeName" in obj, get: obj => obj.bridgeName, set: (obj, value) => { obj.bridgeName = value; } }, metadata: _metadata }, _bridgeName_initializers, _bridgeName_extraInitializers);
            __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
            __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
            __esDecorate(null, null, _token_decorators, { kind: "field", name: "token", static: false, private: false, access: { has: obj => "token" in obj, get: obj => obj.token, set: (obj, value) => { obj.token = value; } }, metadata: _metadata }, _token_initializers, _token_extraInitializers);
            __esDecorate(null, null, _sourceChainType_decorators, { kind: "field", name: "sourceChainType", static: false, private: false, access: { has: obj => "sourceChainType" in obj, get: obj => obj.sourceChainType, set: (obj, value) => { obj.sourceChainType = value; } }, metadata: _metadata }, _sourceChainType_initializers, _sourceChainType_extraInitializers);
            __esDecorate(null, null, _destinationChainType_decorators, { kind: "field", name: "destinationChainType", static: false, private: false, access: { has: obj => "destinationChainType" in obj, get: obj => obj.destinationChainType, set: (obj, value) => { obj.destinationChainType = value; } }, metadata: _metadata }, _destinationChainType_initializers, _destinationChainType_extraInitializers);
            __esDecorate(null, null, _amount_decorators, { kind: "field", name: "amount", static: false, private: false, access: { has: obj => "amount" in obj, get: obj => obj.amount, set: (obj, value) => { obj.amount = value; } }, metadata: _metadata }, _amount_initializers, _amount_extraInitializers);
            __esDecorate(null, null, _quoteRequestedAt_decorators, { kind: "field", name: "quoteRequestedAt", static: false, private: false, access: { has: obj => "quoteRequestedAt" in obj, get: obj => obj.quoteRequestedAt, set: (obj, value) => { obj.quoteRequestedAt = value; } }, metadata: _metadata }, _quoteRequestedAt_initializers, _quoteRequestedAt_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.InitiateBenchmarkDto = InitiateBenchmarkDto;
let ConfirmBenchmarkDto = (() => {
    var _a;
    let _transactionHash_decorators;
    let _transactionHash_initializers = [];
    let _transactionHash_extraInitializers = [];
    let _destinationTxHash_decorators;
    let _destinationTxHash_initializers = [];
    let _destinationTxHash_extraInitializers = [];
    return _a = class ConfirmBenchmarkDto {
            constructor() {
                this.transactionHash = __runInitializers(this, _transactionHash_initializers, void 0);
                this.destinationTxHash = (__runInitializers(this, _transactionHash_extraInitializers), __runInitializers(this, _destinationTxHash_initializers, void 0));
                __runInitializers(this, _destinationTxHash_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _transactionHash_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Source chain transaction hash' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _destinationTxHash_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Destination chain transaction hash' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            __esDecorate(null, null, _transactionHash_decorators, { kind: "field", name: "transactionHash", static: false, private: false, access: { has: obj => "transactionHash" in obj, get: obj => obj.transactionHash, set: (obj, value) => { obj.transactionHash = value; } }, metadata: _metadata }, _transactionHash_initializers, _transactionHash_extraInitializers);
            __esDecorate(null, null, _destinationTxHash_decorators, { kind: "field", name: "destinationTxHash", static: false, private: false, access: { has: obj => "destinationTxHash" in obj, get: obj => obj.destinationTxHash, set: (obj, value) => { obj.destinationTxHash = value; } }, metadata: _metadata }, _destinationTxHash_initializers, _destinationTxHash_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.ConfirmBenchmarkDto = ConfirmBenchmarkDto;
let UpdateBenchmarkStatusDto = (() => {
    var _a;
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    let _transactionHash_decorators;
    let _transactionHash_initializers = [];
    let _transactionHash_extraInitializers = [];
    return _a = class UpdateBenchmarkStatusDto {
            constructor() {
                this.status = __runInitializers(this, _status_initializers, void 0);
                this.transactionHash = (__runInitializers(this, _status_extraInitializers), __runInitializers(this, _transactionHash_initializers, void 0));
                __runInitializers(this, _transactionHash_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _status_decorators = [(0, swagger_1.ApiProperty)({ enum: bridge_benchmark_entity_1.TransactionStatus }), (0, class_validator_1.IsEnum)(bridge_benchmark_entity_1.TransactionStatus)];
            _transactionHash_decorators = [(0, swagger_1.ApiPropertyOptional)(), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
            __esDecorate(null, null, _transactionHash_decorators, { kind: "field", name: "transactionHash", static: false, private: false, access: { has: obj => "transactionHash" in obj, get: obj => obj.transactionHash, set: (obj, value) => { obj.transactionHash = value; } }, metadata: _metadata }, _transactionHash_initializers, _transactionHash_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.UpdateBenchmarkStatusDto = UpdateBenchmarkStatusDto;
let SpeedMetricsQueryDto = (() => {
    var _a;
    let _bridgeName_decorators;
    let _bridgeName_initializers = [];
    let _bridgeName_extraInitializers = [];
    let _sourceChain_decorators;
    let _sourceChain_initializers = [];
    let _sourceChain_extraInitializers = [];
    let _destinationChain_decorators;
    let _destinationChain_initializers = [];
    let _destinationChain_extraInitializers = [];
    let _token_decorators;
    let _token_initializers = [];
    let _token_extraInitializers = [];
    let _rollingWindow_decorators;
    let _rollingWindow_initializers = [];
    let _rollingWindow_extraInitializers = [];
    return _a = class SpeedMetricsQueryDto {
            constructor() {
                this.bridgeName = __runInitializers(this, _bridgeName_initializers, void 0);
                this.sourceChain = (__runInitializers(this, _bridgeName_extraInitializers), __runInitializers(this, _sourceChain_initializers, void 0));
                this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
                this.token = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _token_initializers, void 0));
                this.rollingWindow = (__runInitializers(this, _token_extraInitializers), __runInitializers(this, _rollingWindow_initializers, void 0));
                __runInitializers(this, _rollingWindow_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _bridgeName_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Filter by bridge name' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _sourceChain_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Filter by source chain' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _destinationChain_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Filter by destination chain' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _token_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Filter by token' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _rollingWindow_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: 'Number of recent transactions used for rolling average',
                    default: 50,
                }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsNumber)(), (0, class_validator_1.IsPositive)()];
            __esDecorate(null, null, _bridgeName_decorators, { kind: "field", name: "bridgeName", static: false, private: false, access: { has: obj => "bridgeName" in obj, get: obj => obj.bridgeName, set: (obj, value) => { obj.bridgeName = value; } }, metadata: _metadata }, _bridgeName_initializers, _bridgeName_extraInitializers);
            __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
            __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
            __esDecorate(null, null, _token_decorators, { kind: "field", name: "token", static: false, private: false, access: { has: obj => "token" in obj, get: obj => obj.token, set: (obj, value) => { obj.token = value; } }, metadata: _metadata }, _token_initializers, _token_extraInitializers);
            __esDecorate(null, null, _rollingWindow_decorators, { kind: "field", name: "rollingWindow", static: false, private: false, access: { has: obj => "rollingWindow" in obj, get: obj => obj.rollingWindow, set: (obj, value) => { obj.rollingWindow = value; } }, metadata: _metadata }, _rollingWindow_initializers, _rollingWindow_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.SpeedMetricsQueryDto = SpeedMetricsQueryDto;
class RouteSpeedMetricDto {
}
exports.RouteSpeedMetricDto = RouteSpeedMetricDto;
class SpeedMetricsResponseDto {
}
exports.SpeedMetricsResponseDto = SpeedMetricsResponseDto;
//# sourceMappingURL=bridge-benchmark.dto.js.map