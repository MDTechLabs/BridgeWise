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
exports.NetworkCongestionDto = exports.FeeComparisonResponseDto = exports.FeeComparisonDto = exports.FeeComparisonQueryDto = exports.GasPriceDto = exports.BatchFeeEstimateResponseDto = exports.BatchFeeEstimateQueryDto = exports.FeeEstimateDto = exports.FeeEstimateQueryDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
/**
 * DTO for fee estimate query
 */
let FeeEstimateQueryDto = (() => {
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
    let _amount_decorators;
    let _amount_initializers = [];
    let _amount_extraInitializers = [];
    let _includeUsd_decorators;
    let _includeUsd_initializers = [];
    let _includeUsd_extraInitializers = [];
    return _a = class FeeEstimateQueryDto {
            constructor() {
                this.bridgeName = __runInitializers(this, _bridgeName_initializers, void 0);
                this.sourceChain = (__runInitializers(this, _bridgeName_extraInitializers), __runInitializers(this, _sourceChain_initializers, void 0));
                this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
                this.token = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _token_initializers, void 0));
                this.amount = (__runInitializers(this, _token_extraInitializers), __runInitializers(this, _amount_initializers, void 0));
                this.includeUsd = (__runInitializers(this, _amount_extraInitializers), __runInitializers(this, _includeUsd_initializers, true));
                __runInitializers(this, _includeUsd_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _bridgeName_decorators = [(0, swagger_1.ApiProperty)({ description: 'Bridge name' }), (0, class_validator_1.IsString)()];
            _sourceChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Source chain' }), (0, class_validator_1.IsString)()];
            _destinationChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Destination chain' }), (0, class_validator_1.IsString)()];
            _token_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Token symbol' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _amount_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Transfer amount' }), (0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsNumber)(), (0, class_validator_1.Min)(0)];
            _includeUsd_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Include USD estimates', default: true }), (0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Boolean), (0, class_validator_1.IsBoolean)()];
            __esDecorate(null, null, _bridgeName_decorators, { kind: "field", name: "bridgeName", static: false, private: false, access: { has: obj => "bridgeName" in obj, get: obj => obj.bridgeName, set: (obj, value) => { obj.bridgeName = value; } }, metadata: _metadata }, _bridgeName_initializers, _bridgeName_extraInitializers);
            __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
            __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
            __esDecorate(null, null, _token_decorators, { kind: "field", name: "token", static: false, private: false, access: { has: obj => "token" in obj, get: obj => obj.token, set: (obj, value) => { obj.token = value; } }, metadata: _metadata }, _token_initializers, _token_extraInitializers);
            __esDecorate(null, null, _amount_decorators, { kind: "field", name: "amount", static: false, private: false, access: { has: obj => "amount" in obj, get: obj => obj.amount, set: (obj, value) => { obj.amount = value; } }, metadata: _metadata }, _amount_initializers, _amount_extraInitializers);
            __esDecorate(null, null, _includeUsd_decorators, { kind: "field", name: "includeUsd", static: false, private: false, access: { has: obj => "includeUsd" in obj, get: obj => obj.includeUsd, set: (obj, value) => { obj.includeUsd = value; } }, metadata: _metadata }, _includeUsd_initializers, _includeUsd_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.FeeEstimateQueryDto = FeeEstimateQueryDto;
/**
 * DTO for fee estimate response
 */
let FeeEstimateDto = (() => {
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
    let _amount_decorators;
    let _amount_initializers = [];
    let _amount_extraInitializers = [];
    let _totalFee_decorators;
    let _totalFee_initializers = [];
    let _totalFee_extraInitializers = [];
    let _gasFee_decorators;
    let _gasFee_initializers = [];
    let _gasFee_extraInitializers = [];
    let _bridgeFee_decorators;
    let _bridgeFee_initializers = [];
    let _bridgeFee_extraInitializers = [];
    let _liquidityFee_decorators;
    let _liquidityFee_initializers = [];
    let _liquidityFee_extraInitializers = [];
    let _protocolFee_decorators;
    let _protocolFee_initializers = [];
    let _protocolFee_extraInitializers = [];
    let _gasPriceGwei_decorators;
    let _gasPriceGwei_initializers = [];
    let _gasPriceGwei_extraInitializers = [];
    let _gasLimit_decorators;
    let _gasLimit_initializers = [];
    let _gasLimit_extraInitializers = [];
    let _networkCongestion_decorators;
    let _networkCongestion_initializers = [];
    let _networkCongestion_extraInitializers = [];
    let _feeToken_decorators;
    let _feeToken_initializers = [];
    let _feeToken_extraInitializers = [];
    let _feeTokenPriceUsd_decorators;
    let _feeTokenPriceUsd_initializers = [];
    let _feeTokenPriceUsd_extraInitializers = [];
    let _totalFeeUsd_decorators;
    let _totalFeeUsd_initializers = [];
    let _totalFeeUsd_extraInitializers = [];
    let _isFallback_decorators;
    let _isFallback_initializers = [];
    let _isFallback_extraInitializers = [];
    let _fallbackReason_decorators;
    let _fallbackReason_initializers = [];
    let _fallbackReason_extraInitializers = [];
    let _estimatedDurationSeconds_decorators;
    let _estimatedDurationSeconds_initializers = [];
    let _estimatedDurationSeconds_extraInitializers = [];
    let _lastUpdated_decorators;
    let _lastUpdated_initializers = [];
    let _lastUpdated_extraInitializers = [];
    let _expiresAt_decorators;
    let _expiresAt_initializers = [];
    let _expiresAt_extraInitializers = [];
    let _cacheTtlSeconds_decorators;
    let _cacheTtlSeconds_initializers = [];
    let _cacheTtlSeconds_extraInitializers = [];
    return _a = class FeeEstimateDto {
            constructor() {
                this.bridgeName = __runInitializers(this, _bridgeName_initializers, void 0);
                this.sourceChain = (__runInitializers(this, _bridgeName_extraInitializers), __runInitializers(this, _sourceChain_initializers, void 0));
                this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
                this.token = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _token_initializers, void 0));
                this.amount = (__runInitializers(this, _token_extraInitializers), __runInitializers(this, _amount_initializers, void 0));
                this.totalFee = (__runInitializers(this, _amount_extraInitializers), __runInitializers(this, _totalFee_initializers, void 0));
                this.gasFee = (__runInitializers(this, _totalFee_extraInitializers), __runInitializers(this, _gasFee_initializers, void 0));
                this.bridgeFee = (__runInitializers(this, _gasFee_extraInitializers), __runInitializers(this, _bridgeFee_initializers, void 0));
                this.liquidityFee = (__runInitializers(this, _bridgeFee_extraInitializers), __runInitializers(this, _liquidityFee_initializers, void 0));
                this.protocolFee = (__runInitializers(this, _liquidityFee_extraInitializers), __runInitializers(this, _protocolFee_initializers, void 0));
                this.gasPriceGwei = (__runInitializers(this, _protocolFee_extraInitializers), __runInitializers(this, _gasPriceGwei_initializers, void 0));
                this.gasLimit = (__runInitializers(this, _gasPriceGwei_extraInitializers), __runInitializers(this, _gasLimit_initializers, void 0));
                this.networkCongestion = (__runInitializers(this, _gasLimit_extraInitializers), __runInitializers(this, _networkCongestion_initializers, void 0));
                this.feeToken = (__runInitializers(this, _networkCongestion_extraInitializers), __runInitializers(this, _feeToken_initializers, void 0));
                this.feeTokenPriceUsd = (__runInitializers(this, _feeToken_extraInitializers), __runInitializers(this, _feeTokenPriceUsd_initializers, void 0));
                this.totalFeeUsd = (__runInitializers(this, _feeTokenPriceUsd_extraInitializers), __runInitializers(this, _totalFeeUsd_initializers, void 0));
                this.isFallback = (__runInitializers(this, _totalFeeUsd_extraInitializers), __runInitializers(this, _isFallback_initializers, void 0));
                this.fallbackReason = (__runInitializers(this, _isFallback_extraInitializers), __runInitializers(this, _fallbackReason_initializers, void 0));
                this.estimatedDurationSeconds = (__runInitializers(this, _fallbackReason_extraInitializers), __runInitializers(this, _estimatedDurationSeconds_initializers, void 0));
                this.lastUpdated = (__runInitializers(this, _estimatedDurationSeconds_extraInitializers), __runInitializers(this, _lastUpdated_initializers, void 0));
                this.expiresAt = (__runInitializers(this, _lastUpdated_extraInitializers), __runInitializers(this, _expiresAt_initializers, void 0));
                this.cacheTtlSeconds = (__runInitializers(this, _expiresAt_extraInitializers), __runInitializers(this, _cacheTtlSeconds_initializers, void 0));
                __runInitializers(this, _cacheTtlSeconds_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _bridgeName_decorators = [(0, swagger_1.ApiProperty)({ description: 'Bridge name' })];
            _sourceChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Source chain' })];
            _destinationChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Destination chain' })];
            _token_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Token symbol' })];
            _amount_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Transfer amount' })];
            _totalFee_decorators = [(0, swagger_1.ApiProperty)({ description: 'Total fee in native token' })];
            _gasFee_decorators = [(0, swagger_1.ApiProperty)({ description: 'Gas fee component' })];
            _bridgeFee_decorators = [(0, swagger_1.ApiProperty)({ description: 'Bridge fee component' })];
            _liquidityFee_decorators = [(0, swagger_1.ApiProperty)({ description: 'Liquidity-based fee component', default: 0 })];
            _protocolFee_decorators = [(0, swagger_1.ApiProperty)({ description: 'Protocol fee component', default: 0 })];
            _gasPriceGwei_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Gas price in Gwei' })];
            _gasLimit_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Gas limit estimate' })];
            _networkCongestion_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Network congestion level (0-100)' })];
            _feeToken_decorators = [(0, swagger_1.ApiProperty)({ description: 'Token used for fee payment' })];
            _feeTokenPriceUsd_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Fee token price in USD' })];
            _totalFeeUsd_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Total fee in USD' })];
            _isFallback_decorators = [(0, swagger_1.ApiProperty)({
                    description: 'Whether this is a fallback estimate',
                    default: false,
                })];
            _fallbackReason_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Reason for fallback if applicable' })];
            _estimatedDurationSeconds_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: 'Estimated transaction duration in seconds',
                })];
            _lastUpdated_decorators = [(0, swagger_1.ApiProperty)({ description: 'Last update timestamp' })];
            _expiresAt_decorators = [(0, swagger_1.ApiProperty)({ description: 'Expiration timestamp' })];
            _cacheTtlSeconds_decorators = [(0, swagger_1.ApiProperty)({ description: 'Cache TTL in seconds' })];
            __esDecorate(null, null, _bridgeName_decorators, { kind: "field", name: "bridgeName", static: false, private: false, access: { has: obj => "bridgeName" in obj, get: obj => obj.bridgeName, set: (obj, value) => { obj.bridgeName = value; } }, metadata: _metadata }, _bridgeName_initializers, _bridgeName_extraInitializers);
            __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
            __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
            __esDecorate(null, null, _token_decorators, { kind: "field", name: "token", static: false, private: false, access: { has: obj => "token" in obj, get: obj => obj.token, set: (obj, value) => { obj.token = value; } }, metadata: _metadata }, _token_initializers, _token_extraInitializers);
            __esDecorate(null, null, _amount_decorators, { kind: "field", name: "amount", static: false, private: false, access: { has: obj => "amount" in obj, get: obj => obj.amount, set: (obj, value) => { obj.amount = value; } }, metadata: _metadata }, _amount_initializers, _amount_extraInitializers);
            __esDecorate(null, null, _totalFee_decorators, { kind: "field", name: "totalFee", static: false, private: false, access: { has: obj => "totalFee" in obj, get: obj => obj.totalFee, set: (obj, value) => { obj.totalFee = value; } }, metadata: _metadata }, _totalFee_initializers, _totalFee_extraInitializers);
            __esDecorate(null, null, _gasFee_decorators, { kind: "field", name: "gasFee", static: false, private: false, access: { has: obj => "gasFee" in obj, get: obj => obj.gasFee, set: (obj, value) => { obj.gasFee = value; } }, metadata: _metadata }, _gasFee_initializers, _gasFee_extraInitializers);
            __esDecorate(null, null, _bridgeFee_decorators, { kind: "field", name: "bridgeFee", static: false, private: false, access: { has: obj => "bridgeFee" in obj, get: obj => obj.bridgeFee, set: (obj, value) => { obj.bridgeFee = value; } }, metadata: _metadata }, _bridgeFee_initializers, _bridgeFee_extraInitializers);
            __esDecorate(null, null, _liquidityFee_decorators, { kind: "field", name: "liquidityFee", static: false, private: false, access: { has: obj => "liquidityFee" in obj, get: obj => obj.liquidityFee, set: (obj, value) => { obj.liquidityFee = value; } }, metadata: _metadata }, _liquidityFee_initializers, _liquidityFee_extraInitializers);
            __esDecorate(null, null, _protocolFee_decorators, { kind: "field", name: "protocolFee", static: false, private: false, access: { has: obj => "protocolFee" in obj, get: obj => obj.protocolFee, set: (obj, value) => { obj.protocolFee = value; } }, metadata: _metadata }, _protocolFee_initializers, _protocolFee_extraInitializers);
            __esDecorate(null, null, _gasPriceGwei_decorators, { kind: "field", name: "gasPriceGwei", static: false, private: false, access: { has: obj => "gasPriceGwei" in obj, get: obj => obj.gasPriceGwei, set: (obj, value) => { obj.gasPriceGwei = value; } }, metadata: _metadata }, _gasPriceGwei_initializers, _gasPriceGwei_extraInitializers);
            __esDecorate(null, null, _gasLimit_decorators, { kind: "field", name: "gasLimit", static: false, private: false, access: { has: obj => "gasLimit" in obj, get: obj => obj.gasLimit, set: (obj, value) => { obj.gasLimit = value; } }, metadata: _metadata }, _gasLimit_initializers, _gasLimit_extraInitializers);
            __esDecorate(null, null, _networkCongestion_decorators, { kind: "field", name: "networkCongestion", static: false, private: false, access: { has: obj => "networkCongestion" in obj, get: obj => obj.networkCongestion, set: (obj, value) => { obj.networkCongestion = value; } }, metadata: _metadata }, _networkCongestion_initializers, _networkCongestion_extraInitializers);
            __esDecorate(null, null, _feeToken_decorators, { kind: "field", name: "feeToken", static: false, private: false, access: { has: obj => "feeToken" in obj, get: obj => obj.feeToken, set: (obj, value) => { obj.feeToken = value; } }, metadata: _metadata }, _feeToken_initializers, _feeToken_extraInitializers);
            __esDecorate(null, null, _feeTokenPriceUsd_decorators, { kind: "field", name: "feeTokenPriceUsd", static: false, private: false, access: { has: obj => "feeTokenPriceUsd" in obj, get: obj => obj.feeTokenPriceUsd, set: (obj, value) => { obj.feeTokenPriceUsd = value; } }, metadata: _metadata }, _feeTokenPriceUsd_initializers, _feeTokenPriceUsd_extraInitializers);
            __esDecorate(null, null, _totalFeeUsd_decorators, { kind: "field", name: "totalFeeUsd", static: false, private: false, access: { has: obj => "totalFeeUsd" in obj, get: obj => obj.totalFeeUsd, set: (obj, value) => { obj.totalFeeUsd = value; } }, metadata: _metadata }, _totalFeeUsd_initializers, _totalFeeUsd_extraInitializers);
            __esDecorate(null, null, _isFallback_decorators, { kind: "field", name: "isFallback", static: false, private: false, access: { has: obj => "isFallback" in obj, get: obj => obj.isFallback, set: (obj, value) => { obj.isFallback = value; } }, metadata: _metadata }, _isFallback_initializers, _isFallback_extraInitializers);
            __esDecorate(null, null, _fallbackReason_decorators, { kind: "field", name: "fallbackReason", static: false, private: false, access: { has: obj => "fallbackReason" in obj, get: obj => obj.fallbackReason, set: (obj, value) => { obj.fallbackReason = value; } }, metadata: _metadata }, _fallbackReason_initializers, _fallbackReason_extraInitializers);
            __esDecorate(null, null, _estimatedDurationSeconds_decorators, { kind: "field", name: "estimatedDurationSeconds", static: false, private: false, access: { has: obj => "estimatedDurationSeconds" in obj, get: obj => obj.estimatedDurationSeconds, set: (obj, value) => { obj.estimatedDurationSeconds = value; } }, metadata: _metadata }, _estimatedDurationSeconds_initializers, _estimatedDurationSeconds_extraInitializers);
            __esDecorate(null, null, _lastUpdated_decorators, { kind: "field", name: "lastUpdated", static: false, private: false, access: { has: obj => "lastUpdated" in obj, get: obj => obj.lastUpdated, set: (obj, value) => { obj.lastUpdated = value; } }, metadata: _metadata }, _lastUpdated_initializers, _lastUpdated_extraInitializers);
            __esDecorate(null, null, _expiresAt_decorators, { kind: "field", name: "expiresAt", static: false, private: false, access: { has: obj => "expiresAt" in obj, get: obj => obj.expiresAt, set: (obj, value) => { obj.expiresAt = value; } }, metadata: _metadata }, _expiresAt_initializers, _expiresAt_extraInitializers);
            __esDecorate(null, null, _cacheTtlSeconds_decorators, { kind: "field", name: "cacheTtlSeconds", static: false, private: false, access: { has: obj => "cacheTtlSeconds" in obj, get: obj => obj.cacheTtlSeconds, set: (obj, value) => { obj.cacheTtlSeconds = value; } }, metadata: _metadata }, _cacheTtlSeconds_initializers, _cacheTtlSeconds_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.FeeEstimateDto = FeeEstimateDto;
/**
 * DTO for batch fee estimates
 */
let BatchFeeEstimateQueryDto = (() => {
    var _a;
    let _routes_decorators;
    let _routes_initializers = [];
    let _routes_extraInitializers = [];
    let _includeUsd_decorators;
    let _includeUsd_initializers = [];
    let _includeUsd_extraInitializers = [];
    return _a = class BatchFeeEstimateQueryDto {
            constructor() {
                this.routes = __runInitializers(this, _routes_initializers, void 0);
                this.includeUsd = (__runInitializers(this, _routes_extraInitializers), __runInitializers(this, _includeUsd_initializers, true));
                __runInitializers(this, _includeUsd_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _routes_decorators = [(0, swagger_1.ApiProperty)({ description: 'Array of route identifiers', type: [Object] })];
            _includeUsd_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Include USD estimates', default: true }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsBoolean)()];
            __esDecorate(null, null, _routes_decorators, { kind: "field", name: "routes", static: false, private: false, access: { has: obj => "routes" in obj, get: obj => obj.routes, set: (obj, value) => { obj.routes = value; } }, metadata: _metadata }, _routes_initializers, _routes_extraInitializers);
            __esDecorate(null, null, _includeUsd_decorators, { kind: "field", name: "includeUsd", static: false, private: false, access: { has: obj => "includeUsd" in obj, get: obj => obj.includeUsd, set: (obj, value) => { obj.includeUsd = value; } }, metadata: _metadata }, _includeUsd_initializers, _includeUsd_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.BatchFeeEstimateQueryDto = BatchFeeEstimateQueryDto;
/**
 * DTO for batch fee estimate response
 */
let BatchFeeEstimateResponseDto = (() => {
    var _a;
    let _estimates_decorators;
    let _estimates_initializers = [];
    let _estimates_extraInitializers = [];
    let _successful_decorators;
    let _successful_initializers = [];
    let _successful_extraInitializers = [];
    let _fallbacks_decorators;
    let _fallbacks_initializers = [];
    let _fallbacks_extraInitializers = [];
    let _generatedAt_decorators;
    let _generatedAt_initializers = [];
    let _generatedAt_extraInitializers = [];
    return _a = class BatchFeeEstimateResponseDto {
            constructor() {
                this.estimates = __runInitializers(this, _estimates_initializers, void 0);
                this.successful = (__runInitializers(this, _estimates_extraInitializers), __runInitializers(this, _successful_initializers, void 0));
                this.fallbacks = (__runInitializers(this, _successful_extraInitializers), __runInitializers(this, _fallbacks_initializers, void 0));
                this.generatedAt = (__runInitializers(this, _fallbacks_extraInitializers), __runInitializers(this, _generatedAt_initializers, void 0));
                __runInitializers(this, _generatedAt_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _estimates_decorators = [(0, swagger_1.ApiProperty)({
                    description: 'Fee estimates for each route',
                    type: [FeeEstimateDto],
                })];
            _successful_decorators = [(0, swagger_1.ApiProperty)({ description: 'Number of successful estimates' })];
            _fallbacks_decorators = [(0, swagger_1.ApiProperty)({ description: 'Number of fallback estimates' })];
            _generatedAt_decorators = [(0, swagger_1.ApiProperty)({ description: 'Response generation timestamp' })];
            __esDecorate(null, null, _estimates_decorators, { kind: "field", name: "estimates", static: false, private: false, access: { has: obj => "estimates" in obj, get: obj => obj.estimates, set: (obj, value) => { obj.estimates = value; } }, metadata: _metadata }, _estimates_initializers, _estimates_extraInitializers);
            __esDecorate(null, null, _successful_decorators, { kind: "field", name: "successful", static: false, private: false, access: { has: obj => "successful" in obj, get: obj => obj.successful, set: (obj, value) => { obj.successful = value; } }, metadata: _metadata }, _successful_initializers, _successful_extraInitializers);
            __esDecorate(null, null, _fallbacks_decorators, { kind: "field", name: "fallbacks", static: false, private: false, access: { has: obj => "fallbacks" in obj, get: obj => obj.fallbacks, set: (obj, value) => { obj.fallbacks = value; } }, metadata: _metadata }, _fallbacks_initializers, _fallbacks_extraInitializers);
            __esDecorate(null, null, _generatedAt_decorators, { kind: "field", name: "generatedAt", static: false, private: false, access: { has: obj => "generatedAt" in obj, get: obj => obj.generatedAt, set: (obj, value) => { obj.generatedAt = value; } }, metadata: _metadata }, _generatedAt_initializers, _generatedAt_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.BatchFeeEstimateResponseDto = BatchFeeEstimateResponseDto;
/**
 * DTO for gas price response
 */
let GasPriceDto = (() => {
    var _a;
    let _chain_decorators;
    let _chain_initializers = [];
    let _chain_extraInitializers = [];
    let _gasPriceGwei_decorators;
    let _gasPriceGwei_initializers = [];
    let _gasPriceGwei_extraInitializers = [];
    let _baseFeeGwei_decorators;
    let _baseFeeGwei_initializers = [];
    let _baseFeeGwei_extraInitializers = [];
    let _priorityFeeGwei_decorators;
    let _priorityFeeGwei_initializers = [];
    let _priorityFeeGwei_extraInitializers = [];
    let _congestionLevel_decorators;
    let _congestionLevel_initializers = [];
    let _congestionLevel_extraInitializers = [];
    let _recommendedGasLimit_decorators;
    let _recommendedGasLimit_initializers = [];
    let _recommendedGasLimit_extraInitializers = [];
    let _lastUpdated_decorators;
    let _lastUpdated_initializers = [];
    let _lastUpdated_extraInitializers = [];
    let _expiresAt_decorators;
    let _expiresAt_initializers = [];
    let _expiresAt_extraInitializers = [];
    return _a = class GasPriceDto {
            constructor() {
                this.chain = __runInitializers(this, _chain_initializers, void 0);
                this.gasPriceGwei = (__runInitializers(this, _chain_extraInitializers), __runInitializers(this, _gasPriceGwei_initializers, void 0));
                this.baseFeeGwei = (__runInitializers(this, _gasPriceGwei_extraInitializers), __runInitializers(this, _baseFeeGwei_initializers, void 0));
                this.priorityFeeGwei = (__runInitializers(this, _baseFeeGwei_extraInitializers), __runInitializers(this, _priorityFeeGwei_initializers, void 0));
                this.congestionLevel = (__runInitializers(this, _priorityFeeGwei_extraInitializers), __runInitializers(this, _congestionLevel_initializers, void 0));
                this.recommendedGasLimit = (__runInitializers(this, _congestionLevel_extraInitializers), __runInitializers(this, _recommendedGasLimit_initializers, void 0));
                this.lastUpdated = (__runInitializers(this, _recommendedGasLimit_extraInitializers), __runInitializers(this, _lastUpdated_initializers, void 0));
                this.expiresAt = (__runInitializers(this, _lastUpdated_extraInitializers), __runInitializers(this, _expiresAt_initializers, void 0));
                __runInitializers(this, _expiresAt_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _chain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Chain name' })];
            _gasPriceGwei_decorators = [(0, swagger_1.ApiProperty)({ description: 'Gas price in Gwei' })];
            _baseFeeGwei_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Base fee (EIP-1559)' })];
            _priorityFeeGwei_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Priority fee (EIP-1559)' })];
            _congestionLevel_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Network congestion level (0-100)' })];
            _recommendedGasLimit_decorators = [(0, swagger_1.ApiProperty)({ description: 'Recommended gas limit' })];
            _lastUpdated_decorators = [(0, swagger_1.ApiProperty)({ description: 'Last updated timestamp' })];
            _expiresAt_decorators = [(0, swagger_1.ApiProperty)({ description: 'Expiration timestamp' })];
            __esDecorate(null, null, _chain_decorators, { kind: "field", name: "chain", static: false, private: false, access: { has: obj => "chain" in obj, get: obj => obj.chain, set: (obj, value) => { obj.chain = value; } }, metadata: _metadata }, _chain_initializers, _chain_extraInitializers);
            __esDecorate(null, null, _gasPriceGwei_decorators, { kind: "field", name: "gasPriceGwei", static: false, private: false, access: { has: obj => "gasPriceGwei" in obj, get: obj => obj.gasPriceGwei, set: (obj, value) => { obj.gasPriceGwei = value; } }, metadata: _metadata }, _gasPriceGwei_initializers, _gasPriceGwei_extraInitializers);
            __esDecorate(null, null, _baseFeeGwei_decorators, { kind: "field", name: "baseFeeGwei", static: false, private: false, access: { has: obj => "baseFeeGwei" in obj, get: obj => obj.baseFeeGwei, set: (obj, value) => { obj.baseFeeGwei = value; } }, metadata: _metadata }, _baseFeeGwei_initializers, _baseFeeGwei_extraInitializers);
            __esDecorate(null, null, _priorityFeeGwei_decorators, { kind: "field", name: "priorityFeeGwei", static: false, private: false, access: { has: obj => "priorityFeeGwei" in obj, get: obj => obj.priorityFeeGwei, set: (obj, value) => { obj.priorityFeeGwei = value; } }, metadata: _metadata }, _priorityFeeGwei_initializers, _priorityFeeGwei_extraInitializers);
            __esDecorate(null, null, _congestionLevel_decorators, { kind: "field", name: "congestionLevel", static: false, private: false, access: { has: obj => "congestionLevel" in obj, get: obj => obj.congestionLevel, set: (obj, value) => { obj.congestionLevel = value; } }, metadata: _metadata }, _congestionLevel_initializers, _congestionLevel_extraInitializers);
            __esDecorate(null, null, _recommendedGasLimit_decorators, { kind: "field", name: "recommendedGasLimit", static: false, private: false, access: { has: obj => "recommendedGasLimit" in obj, get: obj => obj.recommendedGasLimit, set: (obj, value) => { obj.recommendedGasLimit = value; } }, metadata: _metadata }, _recommendedGasLimit_initializers, _recommendedGasLimit_extraInitializers);
            __esDecorate(null, null, _lastUpdated_decorators, { kind: "field", name: "lastUpdated", static: false, private: false, access: { has: obj => "lastUpdated" in obj, get: obj => obj.lastUpdated, set: (obj, value) => { obj.lastUpdated = value; } }, metadata: _metadata }, _lastUpdated_initializers, _lastUpdated_extraInitializers);
            __esDecorate(null, null, _expiresAt_decorators, { kind: "field", name: "expiresAt", static: false, private: false, access: { has: obj => "expiresAt" in obj, get: obj => obj.expiresAt, set: (obj, value) => { obj.expiresAt = value; } }, metadata: _metadata }, _expiresAt_initializers, _expiresAt_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.GasPriceDto = GasPriceDto;
/**
 * DTO for fee comparison request
 */
let FeeComparisonQueryDto = (() => {
    var _a;
    let _sourceChain_decorators;
    let _sourceChain_initializers = [];
    let _sourceChain_extraInitializers = [];
    let _destinationChain_decorators;
    let _destinationChain_initializers = [];
    let _destinationChain_extraInitializers = [];
    let _token_decorators;
    let _token_initializers = [];
    let _token_extraInitializers = [];
    let _amount_decorators;
    let _amount_initializers = [];
    let _amount_extraInitializers = [];
    let _bridges_decorators;
    let _bridges_initializers = [];
    let _bridges_extraInitializers = [];
    return _a = class FeeComparisonQueryDto {
            constructor() {
                this.sourceChain = __runInitializers(this, _sourceChain_initializers, void 0);
                this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
                this.token = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _token_initializers, void 0));
                this.amount = (__runInitializers(this, _token_extraInitializers), __runInitializers(this, _amount_initializers, void 0));
                this.bridges = (__runInitializers(this, _amount_extraInitializers), __runInitializers(this, _bridges_initializers, void 0));
                __runInitializers(this, _bridges_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _sourceChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Source chain' }), (0, class_validator_1.IsString)()];
            _destinationChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Destination chain' }), (0, class_validator_1.IsString)()];
            _token_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Token symbol' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _amount_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Transfer amount' }), (0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsNumber)(), (0, class_validator_1.Min)(0)];
            _bridges_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Bridge names to compare' }), (0, class_validator_1.IsOptional)()];
            __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
            __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
            __esDecorate(null, null, _token_decorators, { kind: "field", name: "token", static: false, private: false, access: { has: obj => "token" in obj, get: obj => obj.token, set: (obj, value) => { obj.token = value; } }, metadata: _metadata }, _token_initializers, _token_extraInitializers);
            __esDecorate(null, null, _amount_decorators, { kind: "field", name: "amount", static: false, private: false, access: { has: obj => "amount" in obj, get: obj => obj.amount, set: (obj, value) => { obj.amount = value; } }, metadata: _metadata }, _amount_initializers, _amount_extraInitializers);
            __esDecorate(null, null, _bridges_decorators, { kind: "field", name: "bridges", static: false, private: false, access: { has: obj => "bridges" in obj, get: obj => obj.bridges, set: (obj, value) => { obj.bridges = value; } }, metadata: _metadata }, _bridges_initializers, _bridges_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.FeeComparisonQueryDto = FeeComparisonQueryDto;
/**
 * DTO for fee comparison result
 */
let FeeComparisonDto = (() => {
    var _a;
    let _bridgeName_decorators;
    let _bridgeName_initializers = [];
    let _bridgeName_extraInitializers = [];
    let _totalFee_decorators;
    let _totalFee_initializers = [];
    let _totalFee_extraInitializers = [];
    let _totalFeeUsd_decorators;
    let _totalFeeUsd_initializers = [];
    let _totalFeeUsd_extraInitializers = [];
    let _breakdown_decorators;
    let _breakdown_initializers = [];
    let _breakdown_extraInitializers = [];
    let _isFallback_decorators;
    let _isFallback_initializers = [];
    let _isFallback_extraInitializers = [];
    let _rank_decorators;
    let _rank_initializers = [];
    let _rank_extraInitializers = [];
    let _savingsPercent_decorators;
    let _savingsPercent_initializers = [];
    let _savingsPercent_extraInitializers = [];
    return _a = class FeeComparisonDto {
            constructor() {
                this.bridgeName = __runInitializers(this, _bridgeName_initializers, void 0);
                this.totalFee = (__runInitializers(this, _bridgeName_extraInitializers), __runInitializers(this, _totalFee_initializers, void 0));
                this.totalFeeUsd = (__runInitializers(this, _totalFee_extraInitializers), __runInitializers(this, _totalFeeUsd_initializers, void 0));
                this.breakdown = (__runInitializers(this, _totalFeeUsd_extraInitializers), __runInitializers(this, _breakdown_initializers, void 0));
                this.isFallback = (__runInitializers(this, _breakdown_extraInitializers), __runInitializers(this, _isFallback_initializers, void 0));
                this.rank = (__runInitializers(this, _isFallback_extraInitializers), __runInitializers(this, _rank_initializers, void 0));
                this.savingsPercent = (__runInitializers(this, _rank_extraInitializers), __runInitializers(this, _savingsPercent_initializers, void 0));
                __runInitializers(this, _savingsPercent_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _bridgeName_decorators = [(0, swagger_1.ApiProperty)({ description: 'Bridge name' })];
            _totalFee_decorators = [(0, swagger_1.ApiProperty)({ description: 'Total fee' })];
            _totalFeeUsd_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Total fee in USD' })];
            _breakdown_decorators = [(0, swagger_1.ApiProperty)({ description: 'Fee breakdown' })];
            _isFallback_decorators = [(0, swagger_1.ApiProperty)({ description: 'Whether this is a fallback estimate' })];
            _rank_decorators = [(0, swagger_1.ApiProperty)({ description: 'Rank by total fee (1 = cheapest)' })];
            _savingsPercent_decorators = [(0, swagger_1.ApiProperty)({ description: 'Savings compared to most expensive option' })];
            __esDecorate(null, null, _bridgeName_decorators, { kind: "field", name: "bridgeName", static: false, private: false, access: { has: obj => "bridgeName" in obj, get: obj => obj.bridgeName, set: (obj, value) => { obj.bridgeName = value; } }, metadata: _metadata }, _bridgeName_initializers, _bridgeName_extraInitializers);
            __esDecorate(null, null, _totalFee_decorators, { kind: "field", name: "totalFee", static: false, private: false, access: { has: obj => "totalFee" in obj, get: obj => obj.totalFee, set: (obj, value) => { obj.totalFee = value; } }, metadata: _metadata }, _totalFee_initializers, _totalFee_extraInitializers);
            __esDecorate(null, null, _totalFeeUsd_decorators, { kind: "field", name: "totalFeeUsd", static: false, private: false, access: { has: obj => "totalFeeUsd" in obj, get: obj => obj.totalFeeUsd, set: (obj, value) => { obj.totalFeeUsd = value; } }, metadata: _metadata }, _totalFeeUsd_initializers, _totalFeeUsd_extraInitializers);
            __esDecorate(null, null, _breakdown_decorators, { kind: "field", name: "breakdown", static: false, private: false, access: { has: obj => "breakdown" in obj, get: obj => obj.breakdown, set: (obj, value) => { obj.breakdown = value; } }, metadata: _metadata }, _breakdown_initializers, _breakdown_extraInitializers);
            __esDecorate(null, null, _isFallback_decorators, { kind: "field", name: "isFallback", static: false, private: false, access: { has: obj => "isFallback" in obj, get: obj => obj.isFallback, set: (obj, value) => { obj.isFallback = value; } }, metadata: _metadata }, _isFallback_initializers, _isFallback_extraInitializers);
            __esDecorate(null, null, _rank_decorators, { kind: "field", name: "rank", static: false, private: false, access: { has: obj => "rank" in obj, get: obj => obj.rank, set: (obj, value) => { obj.rank = value; } }, metadata: _metadata }, _rank_initializers, _rank_extraInitializers);
            __esDecorate(null, null, _savingsPercent_decorators, { kind: "field", name: "savingsPercent", static: false, private: false, access: { has: obj => "savingsPercent" in obj, get: obj => obj.savingsPercent, set: (obj, value) => { obj.savingsPercent = value; } }, metadata: _metadata }, _savingsPercent_initializers, _savingsPercent_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.FeeComparisonDto = FeeComparisonDto;
/**
 * DTO for fee comparison response
 */
let FeeComparisonResponseDto = (() => {
    var _a;
    let _comparisons_decorators;
    let _comparisons_initializers = [];
    let _comparisons_extraInitializers = [];
    let _cheapest_decorators;
    let _cheapest_initializers = [];
    let _cheapest_extraInitializers = [];
    let _fastest_decorators;
    let _fastest_initializers = [];
    let _fastest_extraInitializers = [];
    let _sourceChain_decorators;
    let _sourceChain_initializers = [];
    let _sourceChain_extraInitializers = [];
    let _destinationChain_decorators;
    let _destinationChain_initializers = [];
    let _destinationChain_extraInitializers = [];
    let _generatedAt_decorators;
    let _generatedAt_initializers = [];
    let _generatedAt_extraInitializers = [];
    return _a = class FeeComparisonResponseDto {
            constructor() {
                this.comparisons = __runInitializers(this, _comparisons_initializers, void 0);
                this.cheapest = (__runInitializers(this, _comparisons_extraInitializers), __runInitializers(this, _cheapest_initializers, void 0));
                this.fastest = (__runInitializers(this, _cheapest_extraInitializers), __runInitializers(this, _fastest_initializers, void 0));
                this.sourceChain = (__runInitializers(this, _fastest_extraInitializers), __runInitializers(this, _sourceChain_initializers, void 0));
                this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
                this.generatedAt = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _generatedAt_initializers, void 0));
                __runInitializers(this, _generatedAt_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _comparisons_decorators = [(0, swagger_1.ApiProperty)({ description: 'Fee comparisons', type: [FeeComparisonDto] })];
            _cheapest_decorators = [(0, swagger_1.ApiProperty)({ description: 'Cheapest option' })];
            _fastest_decorators = [(0, swagger_1.ApiProperty)({ description: 'Fastest option (if data available)' })];
            _sourceChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Source chain' })];
            _destinationChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Destination chain' })];
            _generatedAt_decorators = [(0, swagger_1.ApiProperty)({ description: 'Response generation timestamp' })];
            __esDecorate(null, null, _comparisons_decorators, { kind: "field", name: "comparisons", static: false, private: false, access: { has: obj => "comparisons" in obj, get: obj => obj.comparisons, set: (obj, value) => { obj.comparisons = value; } }, metadata: _metadata }, _comparisons_initializers, _comparisons_extraInitializers);
            __esDecorate(null, null, _cheapest_decorators, { kind: "field", name: "cheapest", static: false, private: false, access: { has: obj => "cheapest" in obj, get: obj => obj.cheapest, set: (obj, value) => { obj.cheapest = value; } }, metadata: _metadata }, _cheapest_initializers, _cheapest_extraInitializers);
            __esDecorate(null, null, _fastest_decorators, { kind: "field", name: "fastest", static: false, private: false, access: { has: obj => "fastest" in obj, get: obj => obj.fastest, set: (obj, value) => { obj.fastest = value; } }, metadata: _metadata }, _fastest_initializers, _fastest_extraInitializers);
            __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
            __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
            __esDecorate(null, null, _generatedAt_decorators, { kind: "field", name: "generatedAt", static: false, private: false, access: { has: obj => "generatedAt" in obj, get: obj => obj.generatedAt, set: (obj, value) => { obj.generatedAt = value; } }, metadata: _metadata }, _generatedAt_initializers, _generatedAt_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.FeeComparisonResponseDto = FeeComparisonResponseDto;
/**
 * DTO for network congestion status
 */
let NetworkCongestionDto = (() => {
    var _a;
    let _chain_decorators;
    let _chain_initializers = [];
    let _chain_extraInitializers = [];
    let _congestionLevel_decorators;
    let _congestionLevel_initializers = [];
    let _congestionLevel_extraInitializers = [];
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    let _averageGasPriceGwei_decorators;
    let _averageGasPriceGwei_initializers = [];
    let _averageGasPriceGwei_extraInitializers = [];
    let _pendingTransactions_decorators;
    let _pendingTransactions_initializers = [];
    let _pendingTransactions_extraInitializers = [];
    let _averageBlockTimeSeconds_decorators;
    let _averageBlockTimeSeconds_initializers = [];
    let _averageBlockTimeSeconds_extraInitializers = [];
    let _lastUpdated_decorators;
    let _lastUpdated_initializers = [];
    let _lastUpdated_extraInitializers = [];
    return _a = class NetworkCongestionDto {
            constructor() {
                this.chain = __runInitializers(this, _chain_initializers, void 0);
                this.congestionLevel = (__runInitializers(this, _chain_extraInitializers), __runInitializers(this, _congestionLevel_initializers, void 0));
                this.status = (__runInitializers(this, _congestionLevel_extraInitializers), __runInitializers(this, _status_initializers, void 0));
                this.averageGasPriceGwei = (__runInitializers(this, _status_extraInitializers), __runInitializers(this, _averageGasPriceGwei_initializers, void 0));
                this.pendingTransactions = (__runInitializers(this, _averageGasPriceGwei_extraInitializers), __runInitializers(this, _pendingTransactions_initializers, void 0));
                this.averageBlockTimeSeconds = (__runInitializers(this, _pendingTransactions_extraInitializers), __runInitializers(this, _averageBlockTimeSeconds_initializers, void 0));
                this.lastUpdated = (__runInitializers(this, _averageBlockTimeSeconds_extraInitializers), __runInitializers(this, _lastUpdated_initializers, void 0));
                __runInitializers(this, _lastUpdated_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _chain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Chain name' })];
            _congestionLevel_decorators = [(0, swagger_1.ApiProperty)({ description: 'Congestion level (0-100)' })];
            _status_decorators = [(0, swagger_1.ApiProperty)({ description: 'Congestion status' })];
            _averageGasPriceGwei_decorators = [(0, swagger_1.ApiProperty)({ description: 'Average gas price in Gwei' })];
            _pendingTransactions_decorators = [(0, swagger_1.ApiProperty)({ description: 'Pending transaction count' })];
            _averageBlockTimeSeconds_decorators = [(0, swagger_1.ApiProperty)({ description: 'Average block time in seconds' })];
            _lastUpdated_decorators = [(0, swagger_1.ApiProperty)({ description: 'Last updated timestamp' })];
            __esDecorate(null, null, _chain_decorators, { kind: "field", name: "chain", static: false, private: false, access: { has: obj => "chain" in obj, get: obj => obj.chain, set: (obj, value) => { obj.chain = value; } }, metadata: _metadata }, _chain_initializers, _chain_extraInitializers);
            __esDecorate(null, null, _congestionLevel_decorators, { kind: "field", name: "congestionLevel", static: false, private: false, access: { has: obj => "congestionLevel" in obj, get: obj => obj.congestionLevel, set: (obj, value) => { obj.congestionLevel = value; } }, metadata: _metadata }, _congestionLevel_initializers, _congestionLevel_extraInitializers);
            __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
            __esDecorate(null, null, _averageGasPriceGwei_decorators, { kind: "field", name: "averageGasPriceGwei", static: false, private: false, access: { has: obj => "averageGasPriceGwei" in obj, get: obj => obj.averageGasPriceGwei, set: (obj, value) => { obj.averageGasPriceGwei = value; } }, metadata: _metadata }, _averageGasPriceGwei_initializers, _averageGasPriceGwei_extraInitializers);
            __esDecorate(null, null, _pendingTransactions_decorators, { kind: "field", name: "pendingTransactions", static: false, private: false, access: { has: obj => "pendingTransactions" in obj, get: obj => obj.pendingTransactions, set: (obj, value) => { obj.pendingTransactions = value; } }, metadata: _metadata }, _pendingTransactions_initializers, _pendingTransactions_extraInitializers);
            __esDecorate(null, null, _averageBlockTimeSeconds_decorators, { kind: "field", name: "averageBlockTimeSeconds", static: false, private: false, access: { has: obj => "averageBlockTimeSeconds" in obj, get: obj => obj.averageBlockTimeSeconds, set: (obj, value) => { obj.averageBlockTimeSeconds = value; } }, metadata: _metadata }, _averageBlockTimeSeconds_initializers, _averageBlockTimeSeconds_extraInitializers);
            __esDecorate(null, null, _lastUpdated_decorators, { kind: "field", name: "lastUpdated", static: false, private: false, access: { has: obj => "lastUpdated" in obj, get: obj => obj.lastUpdated, set: (obj, value) => { obj.lastUpdated = value; } }, metadata: _metadata }, _lastUpdated_initializers, _lastUpdated_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.NetworkCongestionDto = NetworkCongestionDto;
//# sourceMappingURL=fee-estimate.dto.js.map