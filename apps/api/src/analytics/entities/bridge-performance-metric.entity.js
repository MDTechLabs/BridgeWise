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
exports.BridgePerformanceMetric = void 0;
const typeorm_1 = require("typeorm");
/**
 * BridgePerformanceMetric Entity
 *
 * Stores historical performance metrics for bridge routes over time.
 * Supports multiple time intervals for flexible analysis.
 */
let BridgePerformanceMetric = (() => {
    let _classDecorators = [(0, typeorm_1.Entity)('bridge_performance_metrics'), (0, typeorm_1.Index)([
            'bridgeName',
            'sourceChain',
            'destinationChain',
            'timeInterval',
            'timestamp',
        ]), (0, typeorm_1.Index)(['timeInterval', 'timestamp'])];
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
    let _timeInterval_decorators;
    let _timeInterval_initializers = [];
    let _timeInterval_extraInitializers = [];
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
    let _minSettlementTimeMs_decorators;
    let _minSettlementTimeMs_initializers = [];
    let _minSettlementTimeMs_extraInitializers = [];
    let _maxSettlementTimeMs_decorators;
    let _maxSettlementTimeMs_initializers = [];
    let _maxSettlementTimeMs_extraInitializers = [];
    let _averageFee_decorators;
    let _averageFee_initializers = [];
    let _averageFee_extraInitializers = [];
    let _minFee_decorators;
    let _minFee_initializers = [];
    let _minFee_extraInitializers = [];
    let _maxFee_decorators;
    let _maxFee_initializers = [];
    let _maxFee_extraInitializers = [];
    let _averageSlippagePercent_decorators;
    let _averageSlippagePercent_initializers = [];
    let _averageSlippagePercent_extraInitializers = [];
    let _minSlippagePercent_decorators;
    let _minSlippagePercent_initializers = [];
    let _minSlippagePercent_extraInitializers = [];
    let _maxSlippagePercent_decorators;
    let _maxSlippagePercent_initializers = [];
    let _maxSlippagePercent_extraInitializers = [];
    let _totalVolume_decorators;
    let _totalVolume_initializers = [];
    let _totalVolume_extraInitializers = [];
    let _totalFees_decorators;
    let _totalFees_initializers = [];
    let _totalFees_extraInitializers = [];
    let _timestamp_decorators;
    let _timestamp_initializers = [];
    let _timestamp_extraInitializers = [];
    let _createdAt_decorators;
    let _createdAt_initializers = [];
    let _createdAt_extraInitializers = [];
    var BridgePerformanceMetric = _classThis = class {
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
            this.timeInterval = (__runInitializers(this, _token_extraInitializers), __runInitializers(this, _timeInterval_initializers, void 0));
            this.totalTransfers = (__runInitializers(this, _timeInterval_extraInitializers), __runInitializers(this, _totalTransfers_initializers, void 0));
            this.successfulTransfers = (__runInitializers(this, _totalTransfers_extraInitializers), __runInitializers(this, _successfulTransfers_initializers, void 0));
            this.failedTransfers = (__runInitializers(this, _successfulTransfers_extraInitializers), __runInitializers(this, _failedTransfers_initializers, void 0));
            this.averageSettlementTimeMs = (__runInitializers(this, _failedTransfers_extraInitializers), __runInitializers(this, _averageSettlementTimeMs_initializers, void 0));
            this.minSettlementTimeMs = (__runInitializers(this, _averageSettlementTimeMs_extraInitializers), __runInitializers(this, _minSettlementTimeMs_initializers, void 0));
            this.maxSettlementTimeMs = (__runInitializers(this, _minSettlementTimeMs_extraInitializers), __runInitializers(this, _maxSettlementTimeMs_initializers, void 0));
            this.averageFee = (__runInitializers(this, _maxSettlementTimeMs_extraInitializers), __runInitializers(this, _averageFee_initializers, void 0));
            this.minFee = (__runInitializers(this, _averageFee_extraInitializers), __runInitializers(this, _minFee_initializers, void 0));
            this.maxFee = (__runInitializers(this, _minFee_extraInitializers), __runInitializers(this, _maxFee_initializers, void 0));
            this.averageSlippagePercent = (__runInitializers(this, _maxFee_extraInitializers), __runInitializers(this, _averageSlippagePercent_initializers, void 0));
            this.minSlippagePercent = (__runInitializers(this, _averageSlippagePercent_extraInitializers), __runInitializers(this, _minSlippagePercent_initializers, void 0));
            this.maxSlippagePercent = (__runInitializers(this, _minSlippagePercent_extraInitializers), __runInitializers(this, _maxSlippagePercent_initializers, void 0));
            this.totalVolume = (__runInitializers(this, _maxSlippagePercent_extraInitializers), __runInitializers(this, _totalVolume_initializers, void 0));
            this.totalFees = (__runInitializers(this, _totalVolume_extraInitializers), __runInitializers(this, _totalFees_initializers, void 0));
            this.timestamp = (__runInitializers(this, _totalFees_extraInitializers), __runInitializers(this, _timestamp_initializers, void 0));
            this.createdAt = (__runInitializers(this, _timestamp_extraInitializers), __runInitializers(this, _createdAt_initializers, void 0));
            __runInitializers(this, _createdAt_extraInitializers);
        }
    };
    __setFunctionName(_classThis, "BridgePerformanceMetric");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _id_decorators = [(0, typeorm_1.PrimaryGeneratedColumn)('uuid')];
        _bridgeName_decorators = [(0, typeorm_1.Column)({ name: 'bridge_name' })];
        _sourceChain_decorators = [(0, typeorm_1.Column)({ name: 'source_chain' })];
        _destinationChain_decorators = [(0, typeorm_1.Column)({ name: 'destination_chain' })];
        _token_decorators = [(0, typeorm_1.Column)({ name: 'token', nullable: true })];
        _timeInterval_decorators = [(0, typeorm_1.Column)({
                name: 'time_interval',
                type: 'enum',
                enum: ['hourly', 'daily', 'weekly', 'monthly'],
            })];
        _totalTransfers_decorators = [(0, typeorm_1.Column)({ name: 'total_transfers', type: 'int', default: 0 })];
        _successfulTransfers_decorators = [(0, typeorm_1.Column)({ name: 'successful_transfers', type: 'int', default: 0 })];
        _failedTransfers_decorators = [(0, typeorm_1.Column)({ name: 'failed_transfers', type: 'int', default: 0 })];
        _averageSettlementTimeMs_decorators = [(0, typeorm_1.Column)({
                name: 'average_settlement_time_ms',
                type: 'bigint',
                nullable: true,
            })];
        _minSettlementTimeMs_decorators = [(0, typeorm_1.Column)({ name: 'min_settlement_time_ms', type: 'bigint', nullable: true })];
        _maxSettlementTimeMs_decorators = [(0, typeorm_1.Column)({ name: 'max_settlement_time_ms', type: 'bigint', nullable: true })];
        _averageFee_decorators = [(0, typeorm_1.Column)({
                name: 'average_fee',
                type: 'decimal',
                precision: 30,
                scale: 10,
                nullable: true,
            })];
        _minFee_decorators = [(0, typeorm_1.Column)({
                name: 'min_fee',
                type: 'decimal',
                precision: 30,
                scale: 10,
                nullable: true,
            })];
        _maxFee_decorators = [(0, typeorm_1.Column)({
                name: 'max_fee',
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
        _minSlippagePercent_decorators = [(0, typeorm_1.Column)({
                name: 'min_slippage_percent',
                type: 'decimal',
                precision: 10,
                scale: 4,
                nullable: true,
            })];
        _maxSlippagePercent_decorators = [(0, typeorm_1.Column)({
                name: 'max_slippage_percent',
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
        _totalFees_decorators = [(0, typeorm_1.Column)({
                name: 'total_fees',
                type: 'decimal',
                precision: 30,
                scale: 10,
                default: 0,
            })];
        _timestamp_decorators = [(0, typeorm_1.Column)({ type: 'timestamptz' })];
        _createdAt_decorators = [(0, typeorm_1.CreateDateColumn)({ name: 'created_at' })];
        __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
        __esDecorate(null, null, _bridgeName_decorators, { kind: "field", name: "bridgeName", static: false, private: false, access: { has: obj => "bridgeName" in obj, get: obj => obj.bridgeName, set: (obj, value) => { obj.bridgeName = value; } }, metadata: _metadata }, _bridgeName_initializers, _bridgeName_extraInitializers);
        __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
        __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
        __esDecorate(null, null, _token_decorators, { kind: "field", name: "token", static: false, private: false, access: { has: obj => "token" in obj, get: obj => obj.token, set: (obj, value) => { obj.token = value; } }, metadata: _metadata }, _token_initializers, _token_extraInitializers);
        __esDecorate(null, null, _timeInterval_decorators, { kind: "field", name: "timeInterval", static: false, private: false, access: { has: obj => "timeInterval" in obj, get: obj => obj.timeInterval, set: (obj, value) => { obj.timeInterval = value; } }, metadata: _metadata }, _timeInterval_initializers, _timeInterval_extraInitializers);
        __esDecorate(null, null, _totalTransfers_decorators, { kind: "field", name: "totalTransfers", static: false, private: false, access: { has: obj => "totalTransfers" in obj, get: obj => obj.totalTransfers, set: (obj, value) => { obj.totalTransfers = value; } }, metadata: _metadata }, _totalTransfers_initializers, _totalTransfers_extraInitializers);
        __esDecorate(null, null, _successfulTransfers_decorators, { kind: "field", name: "successfulTransfers", static: false, private: false, access: { has: obj => "successfulTransfers" in obj, get: obj => obj.successfulTransfers, set: (obj, value) => { obj.successfulTransfers = value; } }, metadata: _metadata }, _successfulTransfers_initializers, _successfulTransfers_extraInitializers);
        __esDecorate(null, null, _failedTransfers_decorators, { kind: "field", name: "failedTransfers", static: false, private: false, access: { has: obj => "failedTransfers" in obj, get: obj => obj.failedTransfers, set: (obj, value) => { obj.failedTransfers = value; } }, metadata: _metadata }, _failedTransfers_initializers, _failedTransfers_extraInitializers);
        __esDecorate(null, null, _averageSettlementTimeMs_decorators, { kind: "field", name: "averageSettlementTimeMs", static: false, private: false, access: { has: obj => "averageSettlementTimeMs" in obj, get: obj => obj.averageSettlementTimeMs, set: (obj, value) => { obj.averageSettlementTimeMs = value; } }, metadata: _metadata }, _averageSettlementTimeMs_initializers, _averageSettlementTimeMs_extraInitializers);
        __esDecorate(null, null, _minSettlementTimeMs_decorators, { kind: "field", name: "minSettlementTimeMs", static: false, private: false, access: { has: obj => "minSettlementTimeMs" in obj, get: obj => obj.minSettlementTimeMs, set: (obj, value) => { obj.minSettlementTimeMs = value; } }, metadata: _metadata }, _minSettlementTimeMs_initializers, _minSettlementTimeMs_extraInitializers);
        __esDecorate(null, null, _maxSettlementTimeMs_decorators, { kind: "field", name: "maxSettlementTimeMs", static: false, private: false, access: { has: obj => "maxSettlementTimeMs" in obj, get: obj => obj.maxSettlementTimeMs, set: (obj, value) => { obj.maxSettlementTimeMs = value; } }, metadata: _metadata }, _maxSettlementTimeMs_initializers, _maxSettlementTimeMs_extraInitializers);
        __esDecorate(null, null, _averageFee_decorators, { kind: "field", name: "averageFee", static: false, private: false, access: { has: obj => "averageFee" in obj, get: obj => obj.averageFee, set: (obj, value) => { obj.averageFee = value; } }, metadata: _metadata }, _averageFee_initializers, _averageFee_extraInitializers);
        __esDecorate(null, null, _minFee_decorators, { kind: "field", name: "minFee", static: false, private: false, access: { has: obj => "minFee" in obj, get: obj => obj.minFee, set: (obj, value) => { obj.minFee = value; } }, metadata: _metadata }, _minFee_initializers, _minFee_extraInitializers);
        __esDecorate(null, null, _maxFee_decorators, { kind: "field", name: "maxFee", static: false, private: false, access: { has: obj => "maxFee" in obj, get: obj => obj.maxFee, set: (obj, value) => { obj.maxFee = value; } }, metadata: _metadata }, _maxFee_initializers, _maxFee_extraInitializers);
        __esDecorate(null, null, _averageSlippagePercent_decorators, { kind: "field", name: "averageSlippagePercent", static: false, private: false, access: { has: obj => "averageSlippagePercent" in obj, get: obj => obj.averageSlippagePercent, set: (obj, value) => { obj.averageSlippagePercent = value; } }, metadata: _metadata }, _averageSlippagePercent_initializers, _averageSlippagePercent_extraInitializers);
        __esDecorate(null, null, _minSlippagePercent_decorators, { kind: "field", name: "minSlippagePercent", static: false, private: false, access: { has: obj => "minSlippagePercent" in obj, get: obj => obj.minSlippagePercent, set: (obj, value) => { obj.minSlippagePercent = value; } }, metadata: _metadata }, _minSlippagePercent_initializers, _minSlippagePercent_extraInitializers);
        __esDecorate(null, null, _maxSlippagePercent_decorators, { kind: "field", name: "maxSlippagePercent", static: false, private: false, access: { has: obj => "maxSlippagePercent" in obj, get: obj => obj.maxSlippagePercent, set: (obj, value) => { obj.maxSlippagePercent = value; } }, metadata: _metadata }, _maxSlippagePercent_initializers, _maxSlippagePercent_extraInitializers);
        __esDecorate(null, null, _totalVolume_decorators, { kind: "field", name: "totalVolume", static: false, private: false, access: { has: obj => "totalVolume" in obj, get: obj => obj.totalVolume, set: (obj, value) => { obj.totalVolume = value; } }, metadata: _metadata }, _totalVolume_initializers, _totalVolume_extraInitializers);
        __esDecorate(null, null, _totalFees_decorators, { kind: "field", name: "totalFees", static: false, private: false, access: { has: obj => "totalFees" in obj, get: obj => obj.totalFees, set: (obj, value) => { obj.totalFees = value; } }, metadata: _metadata }, _totalFees_initializers, _totalFees_extraInitializers);
        __esDecorate(null, null, _timestamp_decorators, { kind: "field", name: "timestamp", static: false, private: false, access: { has: obj => "timestamp" in obj, get: obj => obj.timestamp, set: (obj, value) => { obj.timestamp = value; } }, metadata: _metadata }, _timestamp_initializers, _timestamp_extraInitializers);
        __esDecorate(null, null, _createdAt_decorators, { kind: "field", name: "createdAt", static: false, private: false, access: { has: obj => "createdAt" in obj, get: obj => obj.createdAt, set: (obj, value) => { obj.createdAt = value; } }, metadata: _metadata }, _createdAt_initializers, _createdAt_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        BridgePerformanceMetric = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return BridgePerformanceMetric = _classThis;
})();
exports.BridgePerformanceMetric = BridgePerformanceMetric;
//# sourceMappingURL=bridge-performance-metric.entity.js.map