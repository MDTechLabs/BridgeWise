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
exports.TriggerAggregationDto = exports.BridgePerformanceComparisonResponseDto = exports.BridgePerformanceComparisonDto = exports.HistoricalTrendsDto = exports.BridgePerformanceMetricResponseDto = exports.BridgePerformanceMetricDto = exports.BridgePerformanceMetricQueryDto = exports.TimeIntervalEnum = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
/**
 * Time interval enum for validation
 */
var TimeIntervalEnum;
(function (TimeIntervalEnum) {
    TimeIntervalEnum["HOURLY"] = "hourly";
    TimeIntervalEnum["DAILY"] = "daily";
    TimeIntervalEnum["WEEKLY"] = "weekly";
    TimeIntervalEnum["MONTHLY"] = "monthly";
})(TimeIntervalEnum || (exports.TimeIntervalEnum = TimeIntervalEnum = {}));
/**
 * DTO for querying historical performance metrics
 */
let BridgePerformanceMetricQueryDto = (() => {
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
    let _timeInterval_decorators;
    let _timeInterval_initializers = [];
    let _timeInterval_extraInitializers = [];
    let _startDate_decorators;
    let _startDate_initializers = [];
    let _startDate_extraInitializers = [];
    let _endDate_decorators;
    let _endDate_initializers = [];
    let _endDate_extraInitializers = [];
    let _page_decorators;
    let _page_initializers = [];
    let _page_extraInitializers = [];
    let _limit_decorators;
    let _limit_initializers = [];
    let _limit_extraInitializers = [];
    return _a = class BridgePerformanceMetricQueryDto {
            constructor() {
                this.bridgeName = __runInitializers(this, _bridgeName_initializers, void 0);
                this.sourceChain = (__runInitializers(this, _bridgeName_extraInitializers), __runInitializers(this, _sourceChain_initializers, void 0));
                this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
                this.token = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _token_initializers, void 0));
                this.timeInterval = (__runInitializers(this, _token_extraInitializers), __runInitializers(this, _timeInterval_initializers, TimeIntervalEnum.DAILY));
                this.startDate = (__runInitializers(this, _timeInterval_extraInitializers), __runInitializers(this, _startDate_initializers, void 0));
                this.endDate = (__runInitializers(this, _startDate_extraInitializers), __runInitializers(this, _endDate_initializers, void 0));
                this.page = (__runInitializers(this, _endDate_extraInitializers), __runInitializers(this, _page_initializers, 1));
                this.limit = (__runInitializers(this, _page_extraInitializers), __runInitializers(this, _limit_initializers, 50));
                __runInitializers(this, _limit_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _bridgeName_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Filter by bridge name' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _sourceChain_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Filter by source chain' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _destinationChain_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Filter by destination chain' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _token_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Filter by token' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _timeInterval_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: 'Time interval for aggregation',
                    enum: TimeIntervalEnum,
                    default: TimeIntervalEnum.DAILY,
                }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsEnum)(TimeIntervalEnum)];
            _startDate_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Start date for time range (ISO 8601)' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsDateString)()];
            _endDate_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'End date for time range (ISO 8601)' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsDateString)()];
            _page_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: 'Page number for pagination',
                    default: 1,
                }), (0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(1)];
            _limit_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Items per page', default: 50 }), (0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(1)];
            __esDecorate(null, null, _bridgeName_decorators, { kind: "field", name: "bridgeName", static: false, private: false, access: { has: obj => "bridgeName" in obj, get: obj => obj.bridgeName, set: (obj, value) => { obj.bridgeName = value; } }, metadata: _metadata }, _bridgeName_initializers, _bridgeName_extraInitializers);
            __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
            __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
            __esDecorate(null, null, _token_decorators, { kind: "field", name: "token", static: false, private: false, access: { has: obj => "token" in obj, get: obj => obj.token, set: (obj, value) => { obj.token = value; } }, metadata: _metadata }, _token_initializers, _token_extraInitializers);
            __esDecorate(null, null, _timeInterval_decorators, { kind: "field", name: "timeInterval", static: false, private: false, access: { has: obj => "timeInterval" in obj, get: obj => obj.timeInterval, set: (obj, value) => { obj.timeInterval = value; } }, metadata: _metadata }, _timeInterval_initializers, _timeInterval_extraInitializers);
            __esDecorate(null, null, _startDate_decorators, { kind: "field", name: "startDate", static: false, private: false, access: { has: obj => "startDate" in obj, get: obj => obj.startDate, set: (obj, value) => { obj.startDate = value; } }, metadata: _metadata }, _startDate_initializers, _startDate_extraInitializers);
            __esDecorate(null, null, _endDate_decorators, { kind: "field", name: "endDate", static: false, private: false, access: { has: obj => "endDate" in obj, get: obj => obj.endDate, set: (obj, value) => { obj.endDate = value; } }, metadata: _metadata }, _endDate_initializers, _endDate_extraInitializers);
            __esDecorate(null, null, _page_decorators, { kind: "field", name: "page", static: false, private: false, access: { has: obj => "page" in obj, get: obj => obj.page, set: (obj, value) => { obj.page = value; } }, metadata: _metadata }, _page_initializers, _page_extraInitializers);
            __esDecorate(null, null, _limit_decorators, { kind: "field", name: "limit", static: false, private: false, access: { has: obj => "limit" in obj, get: obj => obj.limit, set: (obj, value) => { obj.limit = value; } }, metadata: _metadata }, _limit_initializers, _limit_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.BridgePerformanceMetricQueryDto = BridgePerformanceMetricQueryDto;
/**
 * DTO for a single performance metric data point
 */
let BridgePerformanceMetricDto = (() => {
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
    let _timeInterval_decorators;
    let _timeInterval_initializers = [];
    let _timeInterval_extraInitializers = [];
    let _timestamp_decorators;
    let _timestamp_initializers = [];
    let _timestamp_extraInitializers = [];
    let _totalTransfers_decorators;
    let _totalTransfers_initializers = [];
    let _totalTransfers_extraInitializers = [];
    let _successfulTransfers_decorators;
    let _successfulTransfers_initializers = [];
    let _successfulTransfers_extraInitializers = [];
    let _failedTransfers_decorators;
    let _failedTransfers_initializers = [];
    let _failedTransfers_extraInitializers = [];
    let _successRate_decorators;
    let _successRate_initializers = [];
    let _successRate_extraInitializers = [];
    let _failureRate_decorators;
    let _failureRate_initializers = [];
    let _failureRate_extraInitializers = [];
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
    return _a = class BridgePerformanceMetricDto {
            constructor() {
                this.bridgeName = __runInitializers(this, _bridgeName_initializers, void 0);
                this.sourceChain = (__runInitializers(this, _bridgeName_extraInitializers), __runInitializers(this, _sourceChain_initializers, void 0));
                this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
                this.token = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _token_initializers, void 0));
                this.timeInterval = (__runInitializers(this, _token_extraInitializers), __runInitializers(this, _timeInterval_initializers, void 0));
                this.timestamp = (__runInitializers(this, _timeInterval_extraInitializers), __runInitializers(this, _timestamp_initializers, void 0));
                this.totalTransfers = (__runInitializers(this, _timestamp_extraInitializers), __runInitializers(this, _totalTransfers_initializers, void 0));
                this.successfulTransfers = (__runInitializers(this, _totalTransfers_extraInitializers), __runInitializers(this, _successfulTransfers_initializers, void 0));
                this.failedTransfers = (__runInitializers(this, _successfulTransfers_extraInitializers), __runInitializers(this, _failedTransfers_initializers, void 0));
                this.successRate = (__runInitializers(this, _failedTransfers_extraInitializers), __runInitializers(this, _successRate_initializers, void 0));
                this.failureRate = (__runInitializers(this, _successRate_extraInitializers), __runInitializers(this, _failureRate_initializers, void 0));
                this.averageSettlementTimeMs = (__runInitializers(this, _failureRate_extraInitializers), __runInitializers(this, _averageSettlementTimeMs_initializers, void 0));
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
                __runInitializers(this, _totalFees_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _bridgeName_decorators = [(0, swagger_1.ApiProperty)({ description: 'Bridge name' })];
            _sourceChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Source chain' })];
            _destinationChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Destination chain' })];
            _token_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Token symbol' })];
            _timeInterval_decorators = [(0, swagger_1.ApiProperty)({ description: 'Time interval', enum: TimeIntervalEnum })];
            _timestamp_decorators = [(0, swagger_1.ApiProperty)({ description: 'Timestamp for this metric period' })];
            _totalTransfers_decorators = [(0, swagger_1.ApiProperty)({ description: 'Total transfers in this period' })];
            _successfulTransfers_decorators = [(0, swagger_1.ApiProperty)({ description: 'Successful transfers' })];
            _failedTransfers_decorators = [(0, swagger_1.ApiProperty)({ description: 'Failed transfers' })];
            _successRate_decorators = [(0, swagger_1.ApiProperty)({ description: 'Success rate percentage' })];
            _failureRate_decorators = [(0, swagger_1.ApiProperty)({ description: 'Failure rate percentage' })];
            _averageSettlementTimeMs_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: 'Average settlement time in milliseconds',
                })];
            _minSettlementTimeMs_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Minimum settlement time' })];
            _maxSettlementTimeMs_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Maximum settlement time' })];
            _averageFee_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Average fee amount' })];
            _minFee_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Minimum fee' })];
            _maxFee_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Maximum fee' })];
            _averageSlippagePercent_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Average slippage percentage' })];
            _minSlippagePercent_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Minimum slippage' })];
            _maxSlippagePercent_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Maximum slippage' })];
            _totalVolume_decorators = [(0, swagger_1.ApiProperty)({ description: 'Total volume transferred' })];
            _totalFees_decorators = [(0, swagger_1.ApiProperty)({ description: 'Total fees collected' })];
            __esDecorate(null, null, _bridgeName_decorators, { kind: "field", name: "bridgeName", static: false, private: false, access: { has: obj => "bridgeName" in obj, get: obj => obj.bridgeName, set: (obj, value) => { obj.bridgeName = value; } }, metadata: _metadata }, _bridgeName_initializers, _bridgeName_extraInitializers);
            __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
            __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
            __esDecorate(null, null, _token_decorators, { kind: "field", name: "token", static: false, private: false, access: { has: obj => "token" in obj, get: obj => obj.token, set: (obj, value) => { obj.token = value; } }, metadata: _metadata }, _token_initializers, _token_extraInitializers);
            __esDecorate(null, null, _timeInterval_decorators, { kind: "field", name: "timeInterval", static: false, private: false, access: { has: obj => "timeInterval" in obj, get: obj => obj.timeInterval, set: (obj, value) => { obj.timeInterval = value; } }, metadata: _metadata }, _timeInterval_initializers, _timeInterval_extraInitializers);
            __esDecorate(null, null, _timestamp_decorators, { kind: "field", name: "timestamp", static: false, private: false, access: { has: obj => "timestamp" in obj, get: obj => obj.timestamp, set: (obj, value) => { obj.timestamp = value; } }, metadata: _metadata }, _timestamp_initializers, _timestamp_extraInitializers);
            __esDecorate(null, null, _totalTransfers_decorators, { kind: "field", name: "totalTransfers", static: false, private: false, access: { has: obj => "totalTransfers" in obj, get: obj => obj.totalTransfers, set: (obj, value) => { obj.totalTransfers = value; } }, metadata: _metadata }, _totalTransfers_initializers, _totalTransfers_extraInitializers);
            __esDecorate(null, null, _successfulTransfers_decorators, { kind: "field", name: "successfulTransfers", static: false, private: false, access: { has: obj => "successfulTransfers" in obj, get: obj => obj.successfulTransfers, set: (obj, value) => { obj.successfulTransfers = value; } }, metadata: _metadata }, _successfulTransfers_initializers, _successfulTransfers_extraInitializers);
            __esDecorate(null, null, _failedTransfers_decorators, { kind: "field", name: "failedTransfers", static: false, private: false, access: { has: obj => "failedTransfers" in obj, get: obj => obj.failedTransfers, set: (obj, value) => { obj.failedTransfers = value; } }, metadata: _metadata }, _failedTransfers_initializers, _failedTransfers_extraInitializers);
            __esDecorate(null, null, _successRate_decorators, { kind: "field", name: "successRate", static: false, private: false, access: { has: obj => "successRate" in obj, get: obj => obj.successRate, set: (obj, value) => { obj.successRate = value; } }, metadata: _metadata }, _successRate_initializers, _successRate_extraInitializers);
            __esDecorate(null, null, _failureRate_decorators, { kind: "field", name: "failureRate", static: false, private: false, access: { has: obj => "failureRate" in obj, get: obj => obj.failureRate, set: (obj, value) => { obj.failureRate = value; } }, metadata: _metadata }, _failureRate_initializers, _failureRate_extraInitializers);
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
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.BridgePerformanceMetricDto = BridgePerformanceMetricDto;
/**
 * DTO for paginated performance metrics response
 */
let BridgePerformanceMetricResponseDto = (() => {
    var _a;
    let _data_decorators;
    let _data_initializers = [];
    let _data_extraInitializers = [];
    let _total_decorators;
    let _total_initializers = [];
    let _total_extraInitializers = [];
    let _page_decorators;
    let _page_initializers = [];
    let _page_extraInitializers = [];
    let _limit_decorators;
    let _limit_initializers = [];
    let _limit_extraInitializers = [];
    let _totalPages_decorators;
    let _totalPages_initializers = [];
    let _totalPages_extraInitializers = [];
    let _timeInterval_decorators;
    let _timeInterval_initializers = [];
    let _timeInterval_extraInitializers = [];
    let _generatedAt_decorators;
    let _generatedAt_initializers = [];
    let _generatedAt_extraInitializers = [];
    return _a = class BridgePerformanceMetricResponseDto {
            constructor() {
                this.data = __runInitializers(this, _data_initializers, void 0);
                this.total = (__runInitializers(this, _data_extraInitializers), __runInitializers(this, _total_initializers, void 0));
                this.page = (__runInitializers(this, _total_extraInitializers), __runInitializers(this, _page_initializers, void 0));
                this.limit = (__runInitializers(this, _page_extraInitializers), __runInitializers(this, _limit_initializers, void 0));
                this.totalPages = (__runInitializers(this, _limit_extraInitializers), __runInitializers(this, _totalPages_initializers, void 0));
                this.timeInterval = (__runInitializers(this, _totalPages_extraInitializers), __runInitializers(this, _timeInterval_initializers, void 0));
                this.generatedAt = (__runInitializers(this, _timeInterval_extraInitializers), __runInitializers(this, _generatedAt_initializers, void 0));
                __runInitializers(this, _generatedAt_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _data_decorators = [(0, swagger_1.ApiProperty)({
                    description: 'Performance metrics data',
                    type: [BridgePerformanceMetricDto],
                })];
            _total_decorators = [(0, swagger_1.ApiProperty)({ description: 'Total number of records' })];
            _page_decorators = [(0, swagger_1.ApiProperty)({ description: 'Current page number' })];
            _limit_decorators = [(0, swagger_1.ApiProperty)({ description: 'Items per page' })];
            _totalPages_decorators = [(0, swagger_1.ApiProperty)({ description: 'Total number of pages' })];
            _timeInterval_decorators = [(0, swagger_1.ApiProperty)({ description: 'Time interval used' })];
            _generatedAt_decorators = [(0, swagger_1.ApiProperty)({ description: 'Response generation timestamp' })];
            __esDecorate(null, null, _data_decorators, { kind: "field", name: "data", static: false, private: false, access: { has: obj => "data" in obj, get: obj => obj.data, set: (obj, value) => { obj.data = value; } }, metadata: _metadata }, _data_initializers, _data_extraInitializers);
            __esDecorate(null, null, _total_decorators, { kind: "field", name: "total", static: false, private: false, access: { has: obj => "total" in obj, get: obj => obj.total, set: (obj, value) => { obj.total = value; } }, metadata: _metadata }, _total_initializers, _total_extraInitializers);
            __esDecorate(null, null, _page_decorators, { kind: "field", name: "page", static: false, private: false, access: { has: obj => "page" in obj, get: obj => obj.page, set: (obj, value) => { obj.page = value; } }, metadata: _metadata }, _page_initializers, _page_extraInitializers);
            __esDecorate(null, null, _limit_decorators, { kind: "field", name: "limit", static: false, private: false, access: { has: obj => "limit" in obj, get: obj => obj.limit, set: (obj, value) => { obj.limit = value; } }, metadata: _metadata }, _limit_initializers, _limit_extraInitializers);
            __esDecorate(null, null, _totalPages_decorators, { kind: "field", name: "totalPages", static: false, private: false, access: { has: obj => "totalPages" in obj, get: obj => obj.totalPages, set: (obj, value) => { obj.totalPages = value; } }, metadata: _metadata }, _totalPages_initializers, _totalPages_extraInitializers);
            __esDecorate(null, null, _timeInterval_decorators, { kind: "field", name: "timeInterval", static: false, private: false, access: { has: obj => "timeInterval" in obj, get: obj => obj.timeInterval, set: (obj, value) => { obj.timeInterval = value; } }, metadata: _metadata }, _timeInterval_initializers, _timeInterval_extraInitializers);
            __esDecorate(null, null, _generatedAt_decorators, { kind: "field", name: "generatedAt", static: false, private: false, access: { has: obj => "generatedAt" in obj, get: obj => obj.generatedAt, set: (obj, value) => { obj.generatedAt = value; } }, metadata: _metadata }, _generatedAt_initializers, _generatedAt_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.BridgePerformanceMetricResponseDto = BridgePerformanceMetricResponseDto;
/**
 * DTO for historical trends data
 */
let HistoricalTrendsDto = (() => {
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
    let _timeInterval_decorators;
    let _timeInterval_initializers = [];
    let _timeInterval_extraInitializers = [];
    let _trends_decorators;
    let _trends_initializers = [];
    let _trends_extraInitializers = [];
    let _generatedAt_decorators;
    let _generatedAt_initializers = [];
    let _generatedAt_extraInitializers = [];
    return _a = class HistoricalTrendsDto {
            constructor() {
                this.bridgeName = __runInitializers(this, _bridgeName_initializers, void 0);
                this.sourceChain = (__runInitializers(this, _bridgeName_extraInitializers), __runInitializers(this, _sourceChain_initializers, void 0));
                this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
                this.token = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _token_initializers, void 0));
                this.timeInterval = (__runInitializers(this, _token_extraInitializers), __runInitializers(this, _timeInterval_initializers, void 0));
                this.trends = (__runInitializers(this, _timeInterval_extraInitializers), __runInitializers(this, _trends_initializers, void 0));
                this.generatedAt = (__runInitializers(this, _trends_extraInitializers), __runInitializers(this, _generatedAt_initializers, void 0));
                __runInitializers(this, _generatedAt_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _bridgeName_decorators = [(0, swagger_1.ApiProperty)({ description: 'Bridge name' })];
            _sourceChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Source chain' })];
            _destinationChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Destination chain' })];
            _token_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Token symbol' })];
            _timeInterval_decorators = [(0, swagger_1.ApiProperty)({ description: 'Time interval', enum: TimeIntervalEnum })];
            _trends_decorators = [(0, swagger_1.ApiProperty)({
                    description: 'Trend data points',
                    type: [BridgePerformanceMetricDto],
                })];
            _generatedAt_decorators = [(0, swagger_1.ApiProperty)({ description: 'Response generation timestamp' })];
            __esDecorate(null, null, _bridgeName_decorators, { kind: "field", name: "bridgeName", static: false, private: false, access: { has: obj => "bridgeName" in obj, get: obj => obj.bridgeName, set: (obj, value) => { obj.bridgeName = value; } }, metadata: _metadata }, _bridgeName_initializers, _bridgeName_extraInitializers);
            __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
            __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
            __esDecorate(null, null, _token_decorators, { kind: "field", name: "token", static: false, private: false, access: { has: obj => "token" in obj, get: obj => obj.token, set: (obj, value) => { obj.token = value; } }, metadata: _metadata }, _token_initializers, _token_extraInitializers);
            __esDecorate(null, null, _timeInterval_decorators, { kind: "field", name: "timeInterval", static: false, private: false, access: { has: obj => "timeInterval" in obj, get: obj => obj.timeInterval, set: (obj, value) => { obj.timeInterval = value; } }, metadata: _metadata }, _timeInterval_initializers, _timeInterval_extraInitializers);
            __esDecorate(null, null, _trends_decorators, { kind: "field", name: "trends", static: false, private: false, access: { has: obj => "trends" in obj, get: obj => obj.trends, set: (obj, value) => { obj.trends = value; } }, metadata: _metadata }, _trends_initializers, _trends_extraInitializers);
            __esDecorate(null, null, _generatedAt_decorators, { kind: "field", name: "generatedAt", static: false, private: false, access: { has: obj => "generatedAt" in obj, get: obj => obj.generatedAt, set: (obj, value) => { obj.generatedAt = value; } }, metadata: _metadata }, _generatedAt_initializers, _generatedAt_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.HistoricalTrendsDto = HistoricalTrendsDto;
/**
 * DTO for performance comparison between bridges
 */
let BridgePerformanceComparisonDto = (() => {
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
    let _timeInterval_decorators;
    let _timeInterval_initializers = [];
    let _timeInterval_extraInitializers = [];
    let _dataPoints_decorators;
    let _dataPoints_initializers = [];
    let _dataPoints_extraInitializers = [];
    let _avgSuccessRate_decorators;
    let _avgSuccessRate_initializers = [];
    let _avgSuccessRate_extraInitializers = [];
    let _avgSettlementTimeMs_decorators;
    let _avgSettlementTimeMs_initializers = [];
    let _avgSettlementTimeMs_extraInitializers = [];
    let _avgFee_decorators;
    let _avgFee_initializers = [];
    let _avgFee_extraInitializers = [];
    let _avgSlippagePercent_decorators;
    let _avgSlippagePercent_initializers = [];
    let _avgSlippagePercent_extraInitializers = [];
    let _totalVolume_decorators;
    let _totalVolume_initializers = [];
    let _totalVolume_extraInitializers = [];
    let _totalTransfers_decorators;
    let _totalTransfers_initializers = [];
    let _totalTransfers_extraInitializers = [];
    let _trendDirection_decorators;
    let _trendDirection_initializers = [];
    let _trendDirection_extraInitializers = [];
    return _a = class BridgePerformanceComparisonDto {
            constructor() {
                this.bridgeName = __runInitializers(this, _bridgeName_initializers, void 0);
                this.sourceChain = (__runInitializers(this, _bridgeName_extraInitializers), __runInitializers(this, _sourceChain_initializers, void 0));
                this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
                this.timeInterval = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _timeInterval_initializers, void 0));
                this.dataPoints = (__runInitializers(this, _timeInterval_extraInitializers), __runInitializers(this, _dataPoints_initializers, void 0));
                this.avgSuccessRate = (__runInitializers(this, _dataPoints_extraInitializers), __runInitializers(this, _avgSuccessRate_initializers, void 0));
                this.avgSettlementTimeMs = (__runInitializers(this, _avgSuccessRate_extraInitializers), __runInitializers(this, _avgSettlementTimeMs_initializers, void 0));
                this.avgFee = (__runInitializers(this, _avgSettlementTimeMs_extraInitializers), __runInitializers(this, _avgFee_initializers, void 0));
                this.avgSlippagePercent = (__runInitializers(this, _avgFee_extraInitializers), __runInitializers(this, _avgSlippagePercent_initializers, void 0));
                this.totalVolume = (__runInitializers(this, _avgSlippagePercent_extraInitializers), __runInitializers(this, _totalVolume_initializers, void 0));
                this.totalTransfers = (__runInitializers(this, _totalVolume_extraInitializers), __runInitializers(this, _totalTransfers_initializers, void 0));
                this.trendDirection = (__runInitializers(this, _totalTransfers_extraInitializers), __runInitializers(this, _trendDirection_initializers, void 0));
                __runInitializers(this, _trendDirection_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _bridgeName_decorators = [(0, swagger_1.ApiProperty)({ description: 'Bridge name' })];
            _sourceChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Source chain' })];
            _destinationChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Destination chain' })];
            _timeInterval_decorators = [(0, swagger_1.ApiProperty)({ description: 'Time interval', enum: TimeIntervalEnum })];
            _dataPoints_decorators = [(0, swagger_1.ApiProperty)({ description: 'Number of data points' })];
            _avgSuccessRate_decorators = [(0, swagger_1.ApiProperty)({ description: 'Average success rate over period' })];
            _avgSettlementTimeMs_decorators = [(0, swagger_1.ApiProperty)({ description: 'Average settlement time over period' })];
            _avgFee_decorators = [(0, swagger_1.ApiProperty)({ description: 'Average fee over period' })];
            _avgSlippagePercent_decorators = [(0, swagger_1.ApiProperty)({ description: 'Average slippage over period' })];
            _totalVolume_decorators = [(0, swagger_1.ApiProperty)({ description: 'Total volume over period' })];
            _totalTransfers_decorators = [(0, swagger_1.ApiProperty)({ description: 'Total transfers over period' })];
            _trendDirection_decorators = [(0, swagger_1.ApiProperty)({ description: 'Trend direction (improving/declining/stable)' })];
            __esDecorate(null, null, _bridgeName_decorators, { kind: "field", name: "bridgeName", static: false, private: false, access: { has: obj => "bridgeName" in obj, get: obj => obj.bridgeName, set: (obj, value) => { obj.bridgeName = value; } }, metadata: _metadata }, _bridgeName_initializers, _bridgeName_extraInitializers);
            __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
            __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
            __esDecorate(null, null, _timeInterval_decorators, { kind: "field", name: "timeInterval", static: false, private: false, access: { has: obj => "timeInterval" in obj, get: obj => obj.timeInterval, set: (obj, value) => { obj.timeInterval = value; } }, metadata: _metadata }, _timeInterval_initializers, _timeInterval_extraInitializers);
            __esDecorate(null, null, _dataPoints_decorators, { kind: "field", name: "dataPoints", static: false, private: false, access: { has: obj => "dataPoints" in obj, get: obj => obj.dataPoints, set: (obj, value) => { obj.dataPoints = value; } }, metadata: _metadata }, _dataPoints_initializers, _dataPoints_extraInitializers);
            __esDecorate(null, null, _avgSuccessRate_decorators, { kind: "field", name: "avgSuccessRate", static: false, private: false, access: { has: obj => "avgSuccessRate" in obj, get: obj => obj.avgSuccessRate, set: (obj, value) => { obj.avgSuccessRate = value; } }, metadata: _metadata }, _avgSuccessRate_initializers, _avgSuccessRate_extraInitializers);
            __esDecorate(null, null, _avgSettlementTimeMs_decorators, { kind: "field", name: "avgSettlementTimeMs", static: false, private: false, access: { has: obj => "avgSettlementTimeMs" in obj, get: obj => obj.avgSettlementTimeMs, set: (obj, value) => { obj.avgSettlementTimeMs = value; } }, metadata: _metadata }, _avgSettlementTimeMs_initializers, _avgSettlementTimeMs_extraInitializers);
            __esDecorate(null, null, _avgFee_decorators, { kind: "field", name: "avgFee", static: false, private: false, access: { has: obj => "avgFee" in obj, get: obj => obj.avgFee, set: (obj, value) => { obj.avgFee = value; } }, metadata: _metadata }, _avgFee_initializers, _avgFee_extraInitializers);
            __esDecorate(null, null, _avgSlippagePercent_decorators, { kind: "field", name: "avgSlippagePercent", static: false, private: false, access: { has: obj => "avgSlippagePercent" in obj, get: obj => obj.avgSlippagePercent, set: (obj, value) => { obj.avgSlippagePercent = value; } }, metadata: _metadata }, _avgSlippagePercent_initializers, _avgSlippagePercent_extraInitializers);
            __esDecorate(null, null, _totalVolume_decorators, { kind: "field", name: "totalVolume", static: false, private: false, access: { has: obj => "totalVolume" in obj, get: obj => obj.totalVolume, set: (obj, value) => { obj.totalVolume = value; } }, metadata: _metadata }, _totalVolume_initializers, _totalVolume_extraInitializers);
            __esDecorate(null, null, _totalTransfers_decorators, { kind: "field", name: "totalTransfers", static: false, private: false, access: { has: obj => "totalTransfers" in obj, get: obj => obj.totalTransfers, set: (obj, value) => { obj.totalTransfers = value; } }, metadata: _metadata }, _totalTransfers_initializers, _totalTransfers_extraInitializers);
            __esDecorate(null, null, _trendDirection_decorators, { kind: "field", name: "trendDirection", static: false, private: false, access: { has: obj => "trendDirection" in obj, get: obj => obj.trendDirection, set: (obj, value) => { obj.trendDirection = value; } }, metadata: _metadata }, _trendDirection_initializers, _trendDirection_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.BridgePerformanceComparisonDto = BridgePerformanceComparisonDto;
/**
 * DTO for performance comparison response
 */
let BridgePerformanceComparisonResponseDto = (() => {
    var _a;
    let _comparisons_decorators;
    let _comparisons_initializers = [];
    let _comparisons_extraInitializers = [];
    let _timeInterval_decorators;
    let _timeInterval_initializers = [];
    let _timeInterval_extraInitializers = [];
    let _startDate_decorators;
    let _startDate_initializers = [];
    let _startDate_extraInitializers = [];
    let _endDate_decorators;
    let _endDate_initializers = [];
    let _endDate_extraInitializers = [];
    let _generatedAt_decorators;
    let _generatedAt_initializers = [];
    let _generatedAt_extraInitializers = [];
    return _a = class BridgePerformanceComparisonResponseDto {
            constructor() {
                this.comparisons = __runInitializers(this, _comparisons_initializers, void 0);
                this.timeInterval = (__runInitializers(this, _comparisons_extraInitializers), __runInitializers(this, _timeInterval_initializers, void 0));
                this.startDate = (__runInitializers(this, _timeInterval_extraInitializers), __runInitializers(this, _startDate_initializers, void 0));
                this.endDate = (__runInitializers(this, _startDate_extraInitializers), __runInitializers(this, _endDate_initializers, void 0));
                this.generatedAt = (__runInitializers(this, _endDate_extraInitializers), __runInitializers(this, _generatedAt_initializers, void 0));
                __runInitializers(this, _generatedAt_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _comparisons_decorators = [(0, swagger_1.ApiProperty)({
                    description: 'Comparison data',
                    type: [BridgePerformanceComparisonDto],
                })];
            _timeInterval_decorators = [(0, swagger_1.ApiProperty)({ description: 'Time interval used' })];
            _startDate_decorators = [(0, swagger_1.ApiProperty)({ description: 'Start date of comparison period' })];
            _endDate_decorators = [(0, swagger_1.ApiProperty)({ description: 'End date of comparison period' })];
            _generatedAt_decorators = [(0, swagger_1.ApiProperty)({ description: 'Response generation timestamp' })];
            __esDecorate(null, null, _comparisons_decorators, { kind: "field", name: "comparisons", static: false, private: false, access: { has: obj => "comparisons" in obj, get: obj => obj.comparisons, set: (obj, value) => { obj.comparisons = value; } }, metadata: _metadata }, _comparisons_initializers, _comparisons_extraInitializers);
            __esDecorate(null, null, _timeInterval_decorators, { kind: "field", name: "timeInterval", static: false, private: false, access: { has: obj => "timeInterval" in obj, get: obj => obj.timeInterval, set: (obj, value) => { obj.timeInterval = value; } }, metadata: _metadata }, _timeInterval_initializers, _timeInterval_extraInitializers);
            __esDecorate(null, null, _startDate_decorators, { kind: "field", name: "startDate", static: false, private: false, access: { has: obj => "startDate" in obj, get: obj => obj.startDate, set: (obj, value) => { obj.startDate = value; } }, metadata: _metadata }, _startDate_initializers, _startDate_extraInitializers);
            __esDecorate(null, null, _endDate_decorators, { kind: "field", name: "endDate", static: false, private: false, access: { has: obj => "endDate" in obj, get: obj => obj.endDate, set: (obj, value) => { obj.endDate = value; } }, metadata: _metadata }, _endDate_initializers, _endDate_extraInitializers);
            __esDecorate(null, null, _generatedAt_decorators, { kind: "field", name: "generatedAt", static: false, private: false, access: { has: obj => "generatedAt" in obj, get: obj => obj.generatedAt, set: (obj, value) => { obj.generatedAt = value; } }, metadata: _metadata }, _generatedAt_initializers, _generatedAt_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.BridgePerformanceComparisonResponseDto = BridgePerformanceComparisonResponseDto;
/**
 * DTO for aggregation trigger request
 */
let TriggerAggregationDto = (() => {
    var _a;
    let _timeInterval_decorators;
    let _timeInterval_initializers = [];
    let _timeInterval_extraInitializers = [];
    let _date_decorators;
    let _date_initializers = [];
    let _date_extraInitializers = [];
    let _bridgeName_decorators;
    let _bridgeName_initializers = [];
    let _bridgeName_extraInitializers = [];
    return _a = class TriggerAggregationDto {
            constructor() {
                this.timeInterval = __runInitializers(this, _timeInterval_initializers, TimeIntervalEnum.DAILY);
                this.date = (__runInitializers(this, _timeInterval_extraInitializers), __runInitializers(this, _date_initializers, void 0));
                this.bridgeName = (__runInitializers(this, _date_extraInitializers), __runInitializers(this, _bridgeName_initializers, void 0));
                __runInitializers(this, _bridgeName_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _timeInterval_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: 'Time interval to aggregate',
                    enum: TimeIntervalEnum,
                    default: TimeIntervalEnum.DAILY,
                }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsEnum)(TimeIntervalEnum)];
            _date_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: 'Date to aggregate (defaults to previous period)',
                }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsDateString)()];
            _bridgeName_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Specific bridge to aggregate' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            __esDecorate(null, null, _timeInterval_decorators, { kind: "field", name: "timeInterval", static: false, private: false, access: { has: obj => "timeInterval" in obj, get: obj => obj.timeInterval, set: (obj, value) => { obj.timeInterval = value; } }, metadata: _metadata }, _timeInterval_initializers, _timeInterval_extraInitializers);
            __esDecorate(null, null, _date_decorators, { kind: "field", name: "date", static: false, private: false, access: { has: obj => "date" in obj, get: obj => obj.date, set: (obj, value) => { obj.date = value; } }, metadata: _metadata }, _date_initializers, _date_extraInitializers);
            __esDecorate(null, null, _bridgeName_decorators, { kind: "field", name: "bridgeName", static: false, private: false, access: { has: obj => "bridgeName" in obj, get: obj => obj.bridgeName, set: (obj, value) => { obj.bridgeName = value; } }, metadata: _metadata }, _bridgeName_initializers, _bridgeName_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.TriggerAggregationDto = TriggerAggregationDto;
//# sourceMappingURL=bridge-performance-metric.dto.js.map