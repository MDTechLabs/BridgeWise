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
exports.BridgeAnalytics = void 0;
const typeorm_1 = require("typeorm");
/**
 * BridgeAnalytics Entity
 *
 * Stores aggregated analytics data for bridge routes including:
 * - Transfer counts (total, successful, failed)
 * - Performance metrics (settlement times, fees)
 * - Slippage statistics
 * - Last updated timestamp for cache invalidation
 */
let BridgeAnalytics = (() => {
    let _classDecorators = [(0, typeorm_1.Entity)('bridge_analytics'), (0, typeorm_1.Index)(['bridgeName', 'sourceChain', 'destinationChain']), (0, typeorm_1.Index)(['lastUpdated'])];
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
    let _totalTransfers_decorators;
    let _totalTransfers_initializers = [];
    let _totalTransfers_extraInitializers = [];
    let _successfulTransfers_decorators;
    let _successfulTransfers_initializers = [];
    let _successfulTransfers_extraInitializers = [];
    let _failedTransfers_decorators;
    let _failedTransfers_initializers = [];
    let _failedTransfers_extraInitializers = [];
    let _averageSettlementTimeMs_decorators;
    let _averageSettlementTimeMs_initializers = [];
    let _averageSettlementTimeMs_extraInitializers = [];
    let _averageFee_decorators;
    let _averageFee_initializers = [];
    let _averageFee_extraInitializers = [];
    let _averageSlippagePercent_decorators;
    let _averageSlippagePercent_initializers = [];
    let _averageSlippagePercent_extraInitializers = [];
    let _totalVolume_decorators;
    let _totalVolume_initializers = [];
    let _totalVolume_extraInitializers = [];
    let _minSettlementTimeMs_decorators;
    let _minSettlementTimeMs_initializers = [];
    let _minSettlementTimeMs_extraInitializers = [];
    let _maxSettlementTimeMs_decorators;
    let _maxSettlementTimeMs_initializers = [];
    let _maxSettlementTimeMs_extraInitializers = [];
    let _lastUpdated_decorators;
    let _lastUpdated_initializers = [];
    let _lastUpdated_extraInitializers = [];
    let _createdAt_decorators;
    let _createdAt_initializers = [];
    let _createdAt_extraInitializers = [];
    var BridgeAnalytics = _classThis = class {
        /**
         * Computed success rate percentage
         */
        get successRate() {
            if (this.totalTransfers === 0)
                return 0;
            return (this.successfulTransfers / this.totalTransfers) * 100;
        }
        /**
         * Computed failure rate percentage
         */
        get failureRate() {
            if (this.totalTransfers === 0)
                return 0;
            return (this.failedTransfers / this.totalTransfers) * 100;
        }
        constructor() {
            this.id = __runInitializers(this, _id_initializers, void 0);
            this.bridgeName = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _bridgeName_initializers, void 0));
            this.sourceChain = (__runInitializers(this, _bridgeName_extraInitializers), __runInitializers(this, _sourceChain_initializers, void 0));
            this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
            this.token = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _token_initializers, void 0));
            this.totalTransfers = (__runInitializers(this, _token_extraInitializers), __runInitializers(this, _totalTransfers_initializers, void 0));
            this.successfulTransfers = (__runInitializers(this, _totalTransfers_extraInitializers), __runInitializers(this, _successfulTransfers_initializers, void 0));
            this.failedTransfers = (__runInitializers(this, _successfulTransfers_extraInitializers), __runInitializers(this, _failedTransfers_initializers, void 0));
            this.averageSettlementTimeMs = (__runInitializers(this, _failedTransfers_extraInitializers), __runInitializers(this, _averageSettlementTimeMs_initializers, void 0));
            this.averageFee = (__runInitializers(this, _averageSettlementTimeMs_extraInitializers), __runInitializers(this, _averageFee_initializers, void 0));
            this.averageSlippagePercent = (__runInitializers(this, _averageFee_extraInitializers), __runInitializers(this, _averageSlippagePercent_initializers, void 0));
            this.totalVolume = (__runInitializers(this, _averageSlippagePercent_extraInitializers), __runInitializers(this, _totalVolume_initializers, void 0));
            this.minSettlementTimeMs = (__runInitializers(this, _totalVolume_extraInitializers), __runInitializers(this, _minSettlementTimeMs_initializers, void 0));
            this.maxSettlementTimeMs = (__runInitializers(this, _minSettlementTimeMs_extraInitializers), __runInitializers(this, _maxSettlementTimeMs_initializers, void 0));
            this.lastUpdated = (__runInitializers(this, _maxSettlementTimeMs_extraInitializers), __runInitializers(this, _lastUpdated_initializers, void 0));
            this.createdAt = (__runInitializers(this, _lastUpdated_extraInitializers), __runInitializers(this, _createdAt_initializers, void 0));
            __runInitializers(this, _createdAt_extraInitializers);
        }
    };
    __setFunctionName(_classThis, "BridgeAnalytics");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _id_decorators = [(0, typeorm_1.PrimaryGeneratedColumn)('uuid')];
        _bridgeName_decorators = [(0, typeorm_1.Column)({ name: 'bridge_name' })];
        _sourceChain_decorators = [(0, typeorm_1.Column)({ name: 'source_chain' })];
        _destinationChain_decorators = [(0, typeorm_1.Column)({ name: 'destination_chain' })];
        _token_decorators = [(0, typeorm_1.Column)({ name: 'token', nullable: true })];
        _totalTransfers_decorators = [(0, typeorm_1.Column)({ name: 'total_transfers', type: 'int', default: 0 })];
        _successfulTransfers_decorators = [(0, typeorm_1.Column)({ name: 'successful_transfers', type: 'int', default: 0 })];
        _failedTransfers_decorators = [(0, typeorm_1.Column)({ name: 'failed_transfers', type: 'int', default: 0 })];
        _averageSettlementTimeMs_decorators = [(0, typeorm_1.Column)({
                name: 'average_settlement_time_ms',
                type: 'bigint',
                nullable: true,
            })];
        _averageFee_decorators = [(0, typeorm_1.Column)({
                name: 'average_fee',
                type: 'decimal',
                precision: 30,
                scale: 10,
                nullable: true,
            })];
        _averageSlippagePercent_decorators = [(0, typeorm_1.Column)({
                name: 'average_slippage_percent',
                type: 'decimal',
                precision: 10,
                scale: 4,
                nullable: true,
            })];
        _totalVolume_decorators = [(0, typeorm_1.Column)({
                name: 'total_volume',
                type: 'decimal',
                precision: 30,
                scale: 10,
                default: 0,
            })];
        _minSettlementTimeMs_decorators = [(0, typeorm_1.Column)({ name: 'min_settlement_time_ms', type: 'bigint', nullable: true })];
        _maxSettlementTimeMs_decorators = [(0, typeorm_1.Column)({ name: 'max_settlement_time_ms', type: 'bigint', nullable: true })];
        _lastUpdated_decorators = [(0, typeorm_1.UpdateDateColumn)({ name: 'last_updated' })];
        _createdAt_decorators = [(0, typeorm_1.CreateDateColumn)({ name: 'created_at' })];
        __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
        __esDecorate(null, null, _bridgeName_decorators, { kind: "field", name: "bridgeName", static: false, private: false, access: { has: obj => "bridgeName" in obj, get: obj => obj.bridgeName, set: (obj, value) => { obj.bridgeName = value; } }, metadata: _metadata }, _bridgeName_initializers, _bridgeName_extraInitializers);
        __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
        __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
        __esDecorate(null, null, _token_decorators, { kind: "field", name: "token", static: false, private: false, access: { has: obj => "token" in obj, get: obj => obj.token, set: (obj, value) => { obj.token = value; } }, metadata: _metadata }, _token_initializers, _token_extraInitializers);
        __esDecorate(null, null, _totalTransfers_decorators, { kind: "field", name: "totalTransfers", static: false, private: false, access: { has: obj => "totalTransfers" in obj, get: obj => obj.totalTransfers, set: (obj, value) => { obj.totalTransfers = value; } }, metadata: _metadata }, _totalTransfers_initializers, _totalTransfers_extraInitializers);
        __esDecorate(null, null, _successfulTransfers_decorators, { kind: "field", name: "successfulTransfers", static: false, private: false, access: { has: obj => "successfulTransfers" in obj, get: obj => obj.successfulTransfers, set: (obj, value) => { obj.successfulTransfers = value; } }, metadata: _metadata }, _successfulTransfers_initializers, _successfulTransfers_extraInitializers);
        __esDecorate(null, null, _failedTransfers_decorators, { kind: "field", name: "failedTransfers", static: false, private: false, access: { has: obj => "failedTransfers" in obj, get: obj => obj.failedTransfers, set: (obj, value) => { obj.failedTransfers = value; } }, metadata: _metadata }, _failedTransfers_initializers, _failedTransfers_extraInitializers);
        __esDecorate(null, null, _averageSettlementTimeMs_decorators, { kind: "field", name: "averageSettlementTimeMs", static: false, private: false, access: { has: obj => "averageSettlementTimeMs" in obj, get: obj => obj.averageSettlementTimeMs, set: (obj, value) => { obj.averageSettlementTimeMs = value; } }, metadata: _metadata }, _averageSettlementTimeMs_initializers, _averageSettlementTimeMs_extraInitializers);
        __esDecorate(null, null, _averageFee_decorators, { kind: "field", name: "averageFee", static: false, private: false, access: { has: obj => "averageFee" in obj, get: obj => obj.averageFee, set: (obj, value) => { obj.averageFee = value; } }, metadata: _metadata }, _averageFee_initializers, _averageFee_extraInitializers);
        __esDecorate(null, null, _averageSlippagePercent_decorators, { kind: "field", name: "averageSlippagePercent", static: false, private: false, access: { has: obj => "averageSlippagePercent" in obj, get: obj => obj.averageSlippagePercent, set: (obj, value) => { obj.averageSlippagePercent = value; } }, metadata: _metadata }, _averageSlippagePercent_initializers, _averageSlippagePercent_extraInitializers);
        __esDecorate(null, null, _totalVolume_decorators, { kind: "field", name: "totalVolume", static: false, private: false, access: { has: obj => "totalVolume" in obj, get: obj => obj.totalVolume, set: (obj, value) => { obj.totalVolume = value; } }, metadata: _metadata }, _totalVolume_initializers, _totalVolume_extraInitializers);
        __esDecorate(null, null, _minSettlementTimeMs_decorators, { kind: "field", name: "minSettlementTimeMs", static: false, private: false, access: { has: obj => "minSettlementTimeMs" in obj, get: obj => obj.minSettlementTimeMs, set: (obj, value) => { obj.minSettlementTimeMs = value; } }, metadata: _metadata }, _minSettlementTimeMs_initializers, _minSettlementTimeMs_extraInitializers);
        __esDecorate(null, null, _maxSettlementTimeMs_decorators, { kind: "field", name: "maxSettlementTimeMs", static: false, private: false, access: { has: obj => "maxSettlementTimeMs" in obj, get: obj => obj.maxSettlementTimeMs, set: (obj, value) => { obj.maxSettlementTimeMs = value; } }, metadata: _metadata }, _maxSettlementTimeMs_initializers, _maxSettlementTimeMs_extraInitializers);
        __esDecorate(null, null, _lastUpdated_decorators, { kind: "field", name: "lastUpdated", static: false, private: false, access: { has: obj => "lastUpdated" in obj, get: obj => obj.lastUpdated, set: (obj, value) => { obj.lastUpdated = value; } }, metadata: _metadata }, _lastUpdated_initializers, _lastUpdated_extraInitializers);
        __esDecorate(null, null, _createdAt_decorators, { kind: "field", name: "createdAt", static: false, private: false, access: { has: obj => "createdAt" in obj, get: obj => obj.createdAt, set: (obj, value) => { obj.createdAt = value; } }, metadata: _metadata }, _createdAt_initializers, _createdAt_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        BridgeAnalytics = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return BridgeAnalytics = _classThis;
})();
exports.BridgeAnalytics = BridgeAnalytics;
//# sourceMappingURL=bridge-analytics.entity.js.map