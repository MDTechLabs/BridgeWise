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
exports.RouteSelectDto = exports.GetQuotesDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const enums_1 = require("../enums");
let GetQuotesDto = (() => {
    var _a;
    let _sourceChain_decorators;
    let _sourceChain_initializers = [];
    let _sourceChain_extraInitializers = [];
    let _destinationChain_decorators;
    let _destinationChain_initializers = [];
    let _destinationChain_extraInitializers = [];
    let _sourceToken_decorators;
    let _sourceToken_initializers = [];
    let _sourceToken_extraInitializers = [];
    let _destinationToken_decorators;
    let _destinationToken_initializers = [];
    let _destinationToken_extraInitializers = [];
    let _amount_decorators;
    let _amount_initializers = [];
    let _amount_extraInitializers = [];
    let _rankingMode_decorators;
    let _rankingMode_initializers = [];
    let _rankingMode_extraInitializers = [];
    let _slippageTolerance_decorators;
    let _slippageTolerance_initializers = [];
    let _slippageTolerance_extraInitializers = [];
    return _a = class GetQuotesDto {
            constructor() {
                this.sourceChain = __runInitializers(this, _sourceChain_initializers, void 0);
                this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
                this.sourceToken = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _sourceToken_initializers, void 0));
                this.destinationToken = (__runInitializers(this, _sourceToken_extraInitializers), __runInitializers(this, _destinationToken_initializers, void 0));
                this.amount = (__runInitializers(this, _destinationToken_extraInitializers), __runInitializers(this, _amount_initializers, void 0));
                this.rankingMode = (__runInitializers(this, _amount_extraInitializers), __runInitializers(this, _rankingMode_initializers, enums_1.RankingMode.BALANCED));
                this.slippageTolerance = (__runInitializers(this, _rankingMode_extraInitializers), __runInitializers(this, _slippageTolerance_initializers, void 0));
                __runInitializers(this, _slippageTolerance_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _sourceChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Source blockchain', enum: enums_1.SupportedChain, example: 'stellar' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _destinationChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Destination blockchain', enum: enums_1.SupportedChain, example: 'ethereum' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _sourceToken_decorators = [(0, swagger_1.ApiProperty)({ description: 'Source token symbol', example: 'USDC' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _destinationToken_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Destination token symbol (defaults to sourceToken)', example: 'USDC' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _amount_decorators = [(0, swagger_1.ApiProperty)({ description: 'Amount to bridge', example: 100 }), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsNumber)(), (0, class_validator_1.IsPositive)(), (0, class_validator_1.Min)(0.000001)];
            _rankingMode_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Ranking mode for route comparison', enum: enums_1.RankingMode, default: enums_1.RankingMode.BALANCED }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsEnum)(enums_1.RankingMode)];
            _slippageTolerance_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Max acceptable slippage %', example: 0.5 }), (0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsNumber)(), (0, class_validator_1.Min)(0), (0, class_validator_1.Max)(100)];
            __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
            __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
            __esDecorate(null, null, _sourceToken_decorators, { kind: "field", name: "sourceToken", static: false, private: false, access: { has: obj => "sourceToken" in obj, get: obj => obj.sourceToken, set: (obj, value) => { obj.sourceToken = value; } }, metadata: _metadata }, _sourceToken_initializers, _sourceToken_extraInitializers);
            __esDecorate(null, null, _destinationToken_decorators, { kind: "field", name: "destinationToken", static: false, private: false, access: { has: obj => "destinationToken" in obj, get: obj => obj.destinationToken, set: (obj, value) => { obj.destinationToken = value; } }, metadata: _metadata }, _destinationToken_initializers, _destinationToken_extraInitializers);
            __esDecorate(null, null, _amount_decorators, { kind: "field", name: "amount", static: false, private: false, access: { has: obj => "amount" in obj, get: obj => obj.amount, set: (obj, value) => { obj.amount = value; } }, metadata: _metadata }, _amount_initializers, _amount_extraInitializers);
            __esDecorate(null, null, _rankingMode_decorators, { kind: "field", name: "rankingMode", static: false, private: false, access: { has: obj => "rankingMode" in obj, get: obj => obj.rankingMode, set: (obj, value) => { obj.rankingMode = value; } }, metadata: _metadata }, _rankingMode_initializers, _rankingMode_extraInitializers);
            __esDecorate(null, null, _slippageTolerance_decorators, { kind: "field", name: "slippageTolerance", static: false, private: false, access: { has: obj => "slippageTolerance" in obj, get: obj => obj.slippageTolerance, set: (obj, value) => { obj.slippageTolerance = value; } }, metadata: _metadata }, _slippageTolerance_initializers, _slippageTolerance_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.GetQuotesDto = GetQuotesDto;
let RouteSelectDto = (() => {
    var _a;
    let _bridgeId_decorators;
    let _bridgeId_initializers = [];
    let _bridgeId_extraInitializers = [];
    let _sourceChain_decorators;
    let _sourceChain_initializers = [];
    let _sourceChain_extraInitializers = [];
    let _destinationChain_decorators;
    let _destinationChain_initializers = [];
    let _destinationChain_extraInitializers = [];
    let _sourceToken_decorators;
    let _sourceToken_initializers = [];
    let _sourceToken_extraInitializers = [];
    let _amount_decorators;
    let _amount_initializers = [];
    let _amount_extraInitializers = [];
    return _a = class RouteSelectDto {
            constructor() {
                this.bridgeId = __runInitializers(this, _bridgeId_initializers, void 0);
                this.sourceChain = (__runInitializers(this, _bridgeId_extraInitializers), __runInitializers(this, _sourceChain_initializers, void 0));
                this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
                this.sourceToken = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _sourceToken_initializers, void 0));
                this.amount = (__runInitializers(this, _sourceToken_extraInitializers), __runInitializers(this, _amount_initializers, void 0));
                __runInitializers(this, _amount_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _bridgeId_decorators = [(0, swagger_1.ApiProperty)({ description: 'Bridge provider ID' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _sourceChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Source chain' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _destinationChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Destination chain' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _sourceToken_decorators = [(0, swagger_1.ApiProperty)({ description: 'Source token' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _amount_decorators = [(0, swagger_1.ApiProperty)({ description: 'Input amount' }), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsNumber)(), (0, class_validator_1.IsPositive)()];
            __esDecorate(null, null, _bridgeId_decorators, { kind: "field", name: "bridgeId", static: false, private: false, access: { has: obj => "bridgeId" in obj, get: obj => obj.bridgeId, set: (obj, value) => { obj.bridgeId = value; } }, metadata: _metadata }, _bridgeId_initializers, _bridgeId_extraInitializers);
            __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
            __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
            __esDecorate(null, null, _sourceToken_decorators, { kind: "field", name: "sourceToken", static: false, private: false, access: { has: obj => "sourceToken" in obj, get: obj => obj.sourceToken, set: (obj, value) => { obj.sourceToken = value; } }, metadata: _metadata }, _sourceToken_initializers, _sourceToken_extraInitializers);
            __esDecorate(null, null, _amount_decorators, { kind: "field", name: "amount", static: false, private: false, access: { has: obj => "amount" in obj, get: obj => obj.amount, set: (obj, value) => { obj.amount = value; } }, metadata: _metadata }, _amount_initializers, _amount_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.RouteSelectDto = RouteSelectDto;
//# sourceMappingURL=index.js.map