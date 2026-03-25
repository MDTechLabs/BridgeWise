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
exports.FeeEstimate = void 0;
const typeorm_1 = require("typeorm");
/**
 * FeeEstimate Entity
 *
 * Stores dynamic fee estimates for bridge routes.
 * Includes breakdown of gas fees, bridge fees, and liquidity impact.
 */
let FeeEstimate = (() => {
    let _classDecorators = [(0, typeorm_1.Entity)('fee_estimates'), (0, typeorm_1.Index)(['bridgeName', 'sourceChain', 'destinationChain']), (0, typeorm_1.Index)(['sourceChain', 'lastUpdated'])];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _id_decorators;
    let _id_initializers = [];
    let _id_extraInitializers = [];
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
    var FeeEstimate = _classThis = class {
        constructor() {
            this.id = __runInitializers(this, _id_initializers, void 0);
            this.bridgeName = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _bridgeName_initializers, void 0));
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
    };
    __setFunctionName(_classThis, "FeeEstimate");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _id_decorators = [(0, typeorm_1.PrimaryGeneratedColumn)('uuid')];
        _bridgeName_decorators = [(0, typeorm_1.Column)({ name: 'bridge_name' })];
        _sourceChain_decorators = [(0, typeorm_1.Column)({ name: 'source_chain' })];
        _destinationChain_decorators = [(0, typeorm_1.Column)({ name: 'destination_chain' })];
        _token_decorators = [(0, typeorm_1.Column)({ name: 'token', nullable: true })];
        _amount_decorators = [(0, typeorm_1.Column)({
                name: 'amount',
                type: 'decimal',
                precision: 30,
                scale: 10,
                nullable: true,
            })];
        _totalFee_decorators = [(0, typeorm_1.Column)({ name: 'total_fee', type: 'decimal', precision: 30, scale: 10 })];
        _gasFee_decorators = [(0, typeorm_1.Column)({ name: 'gas_fee', type: 'decimal', precision: 30, scale: 10 })];
        _bridgeFee_decorators = [(0, typeorm_1.Column)({ name: 'bridge_fee', type: 'decimal', precision: 30, scale: 10 })];
        _liquidityFee_decorators = [(0, typeorm_1.Column)({
                name: 'liquidity_fee',
                type: 'decimal',
                precision: 30,
                scale: 10,
                default: 0,
            })];
        _protocolFee_decorators = [(0, typeorm_1.Column)({
                name: 'protocol_fee',
                type: 'decimal',
                precision: 30,
                scale: 10,
                default: 0,
            })];
        _gasPriceGwei_decorators = [(0, typeorm_1.Column)({
                name: 'gas_price_gwei',
                type: 'decimal',
                precision: 20,
                scale: 4,
                nullable: true,
            })];
        _gasLimit_decorators = [(0, typeorm_1.Column)({ name: 'gas_limit', type: 'bigint', nullable: true })];
        _networkCongestion_decorators = [(0, typeorm_1.Column)({
                name: 'network_congestion',
                type: 'decimal',
                precision: 5,
                scale: 2,
                nullable: true,
            })];
        _feeToken_decorators = [(0, typeorm_1.Column)({ name: 'fee_token' })];
        _feeTokenPriceUsd_decorators = [(0, typeorm_1.Column)({
                name: 'fee_token_price_usd',
                type: 'decimal',
                precision: 20,
                scale: 8,
                nullable: true,
            })];
        _totalFeeUsd_decorators = [(0, typeorm_1.Column)({
                name: 'total_fee_usd',
                type: 'decimal',
                precision: 20,
                scale: 8,
                nullable: true,
            })];
        _isFallback_decorators = [(0, typeorm_1.Column)({ name: 'is_fallback', default: false })];
        _fallbackReason_decorators = [(0, typeorm_1.Column)({ name: 'fallback_reason', nullable: true })];
        _estimatedDurationSeconds_decorators = [(0, typeorm_1.Column)({ name: 'estimated_duration_seconds', type: 'int', nullable: true })];
        _lastUpdated_decorators = [(0, typeorm_1.CreateDateColumn)({ name: 'last_updated' })];
        _expiresAt_decorators = [(0, typeorm_1.Column)({ name: 'expires_at', type: 'timestamptz' })];
        _cacheTtlSeconds_decorators = [(0, typeorm_1.Column)({ name: 'cache_ttl_seconds', type: 'int', default: 60 })];
        __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
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
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        FeeEstimate = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return FeeEstimate = _classThis;
})();
exports.FeeEstimate = FeeEstimate;
//# sourceMappingURL=fee-estimate.entity.js.map