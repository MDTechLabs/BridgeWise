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
exports.UserActivityInsightsDto = exports.SlippageStatisticsDto = exports.TopPerformingBridgesDto = exports.BridgeAnalyticsResponseDto = exports.TimeSeriesAnalyticsDto = exports.TimeSeriesDataPointDto = exports.RouteAnalyticsDto = exports.BridgeAnalyticsQueryDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
/**
 * DTO for querying bridge analytics with filters
 */
let BridgeAnalyticsQueryDto = (() => {
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
    return _a = class BridgeAnalyticsQueryDto {
            constructor() {
                this.bridgeName = __runInitializers(this, _bridgeName_initializers, void 0);
                this.sourceChain = (__runInitializers(this, _bridgeName_extraInitializers), __runInitializers(this, _sourceChain_initializers, void 0));
                this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
                this.token = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _token_initializers, void 0));
                this.startDate = (__runInitializers(this, _token_extraInitializers), __runInitializers(this, _startDate_initializers, void 0));
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
            _startDate_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: 'Start date for time range filter (ISO 8601)',
                }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsDateString)()];
            _endDate_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: 'End date for time range filter (ISO 8601)',
                }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsDateString)()];
            _page_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: 'Page number for pagination',
                    default: 1,
                }), (0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(1)];
            _limit_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Items per page', default: 50 }), (0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(1)];
            __esDecorate(null, null, _bridgeName_decorators, { kind: "field", name: "bridgeName", static: false, private: false, access: { has: obj => "bridgeName" in obj, get: obj => obj.bridgeName, set: (obj, value) => { obj.bridgeName = value; } }, metadata: _metadata }, _bridgeName_initializers, _bridgeName_extraInitializers);
            __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
            __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
            __esDecorate(null, null, _token_decorators, { kind: "field", name: "token", static: false, private: false, access: { has: obj => "token" in obj, get: obj => obj.token, set: (obj, value) => { obj.token = value; } }, metadata: _metadata }, _token_initializers, _token_extraInitializers);
            __esDecorate(null, null, _startDate_decorators, { kind: "field", name: "startDate", static: false, private: false, access: { has: obj => "startDate" in obj, get: obj => obj.startDate, set: (obj, value) => { obj.startDate = value; } }, metadata: _metadata }, _startDate_initializers, _startDate_extraInitializers);
            __esDecorate(null, null, _endDate_decorators, { kind: "field", name: "endDate", static: false, private: false, access: { has: obj => "endDate" in obj, get: obj => obj.endDate, set: (obj, value) => { obj.endDate = value; } }, metadata: _metadata }, _endDate_initializers, _endDate_extraInitializers);
            __esDecorate(null, null, _page_decorators, { kind: "field", name: "page", static: false, private: false, access: { has: obj => "page" in obj, get: obj => obj.page, set: (obj, value) => { obj.page = value; } }, metadata: _metadata }, _page_initializers, _page_extraInitializers);
            __esDecorate(null, null, _limit_decorators, { kind: "field", name: "limit", static: false, private: false, access: { has: obj => "limit" in obj, get: obj => obj.limit, set: (obj, value) => { obj.limit = value; } }, metadata: _metadata }, _limit_initializers, _limit_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.BridgeAnalyticsQueryDto = BridgeAnalyticsQueryDto;
/**
 * DTO for route-specific analytics data
 */
let RouteAnalyticsDto = (() => {
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
    let _averageSlippagePercent_decorators;
    let _averageSlippagePercent_initializers = [];
    let _averageSlippagePercent_extraInitializers = [];
    let _totalVolume_decorators;
    let _totalVolume_initializers = [];
    let _totalVolume_extraInitializers = [];
    let _lastUpdated_decorators;
    let _lastUpdated_initializers = [];
    let _lastUpdated_extraInitializers = [];
    return _a = class RouteAnalyticsDto {
            constructor() {
                this.bridgeName = __runInitializers(this, _bridgeName_initializers, void 0);
                this.sourceChain = (__runInitializers(this, _bridgeName_extraInitializers), __runInitializers(this, _sourceChain_initializers, void 0));
                this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
                this.token = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _token_initializers, void 0));
                this.totalTransfers = (__runInitializers(this, _token_extraInitializers), __runInitializers(this, _totalTransfers_initializers, void 0));
                this.successfulTransfers = (__runInitializers(this, _totalTransfers_extraInitializers), __runInitializers(this, _successfulTransfers_initializers, void 0));
                this.failedTransfers = (__runInitializers(this, _successfulTransfers_extraInitializers), __runInitializers(this, _failedTransfers_initializers, void 0));
                this.successRate = (__runInitializers(this, _failedTransfers_extraInitializers), __runInitializers(this, _successRate_initializers, void 0));
                this.failureRate = (__runInitializers(this, _successRate_extraInitializers), __runInitializers(this, _failureRate_initializers, void 0));
                this.averageSettlementTimeMs = (__runInitializers(this, _failureRate_extraInitializers), __runInitializers(this, _averageSettlementTimeMs_initializers, void 0));
                this.minSettlementTimeMs = (__runInitializers(this, _averageSettlementTimeMs_extraInitializers), __runInitializers(this, _minSettlementTimeMs_initializers, void 0));
                this.maxSettlementTimeMs = (__runInitializers(this, _minSettlementTimeMs_extraInitializers), __runInitializers(this, _maxSettlementTimeMs_initializers, void 0));
                this.averageFee = (__runInitializers(this, _maxSettlementTimeMs_extraInitializers), __runInitializers(this, _averageFee_initializers, void 0));
                this.averageSlippagePercent = (__runInitializers(this, _averageFee_extraInitializers), __runInitializers(this, _averageSlippagePercent_initializers, void 0));
                this.totalVolume = (__runInitializers(this, _averageSlippagePercent_extraInitializers), __runInitializers(this, _totalVolume_initializers, void 0));
                this.lastUpdated = (__runInitializers(this, _totalVolume_extraInitializers), __runInitializers(this, _lastUpdated_initializers, void 0));
                __runInitializers(this, _lastUpdated_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _bridgeName_decorators = [(0, swagger_1.ApiProperty)({ description: 'Bridge name' })];
            _sourceChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Source chain' })];
            _destinationChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Destination chain' })];
            _token_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Token symbol' })];
            _totalTransfers_decorators = [(0, swagger_1.ApiProperty)({ description: 'Total number of transfers' })];
            _successfulTransfers_decorators = [(0, swagger_1.ApiProperty)({ description: 'Number of successful transfers' })];
            _failedTransfers_decorators = [(0, swagger_1.ApiProperty)({ description: 'Number of failed transfers' })];
            _successRate_decorators = [(0, swagger_1.ApiProperty)({ description: 'Success rate percentage' })];
            _failureRate_decorators = [(0, swagger_1.ApiProperty)({ description: 'Failure rate percentage' })];
            _averageSettlementTimeMs_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: 'Average settlement time in milliseconds',
                })];
            _minSettlementTimeMs_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: 'Minimum settlement time in milliseconds',
                })];
            _maxSettlementTimeMs_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: 'Maximum settlement time in milliseconds',
                })];
            _averageFee_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Average fee amount' })];
            _averageSlippagePercent_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Average slippage percentage' })];
            _totalVolume_decorators = [(0, swagger_1.ApiProperty)({ description: 'Total volume transferred' })];
            _lastUpdated_decorators = [(0, swagger_1.ApiProperty)({ description: 'Last updated timestamp' })];
            __esDecorate(null, null, _bridgeName_decorators, { kind: "field", name: "bridgeName", static: false, private: false, access: { has: obj => "bridgeName" in obj, get: obj => obj.bridgeName, set: (obj, value) => { obj.bridgeName = value; } }, metadata: _metadata }, _bridgeName_initializers, _bridgeName_extraInitializers);
            __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
            __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
            __esDecorate(null, null, _token_decorators, { kind: "field", name: "token", static: false, private: false, access: { has: obj => "token" in obj, get: obj => obj.token, set: (obj, value) => { obj.token = value; } }, metadata: _metadata }, _token_initializers, _token_extraInitializers);
            __esDecorate(null, null, _totalTransfers_decorators, { kind: "field", name: "totalTransfers", static: false, private: false, access: { has: obj => "totalTransfers" in obj, get: obj => obj.totalTransfers, set: (obj, value) => { obj.totalTransfers = value; } }, metadata: _metadata }, _totalTransfers_initializers, _totalTransfers_extraInitializers);
            __esDecorate(null, null, _successfulTransfers_decorators, { kind: "field", name: "successfulTransfers", static: false, private: false, access: { has: obj => "successfulTransfers" in obj, get: obj => obj.successfulTransfers, set: (obj, value) => { obj.successfulTransfers = value; } }, metadata: _metadata }, _successfulTransfers_initializers, _successfulTransfers_extraInitializers);
            __esDecorate(null, null, _failedTransfers_decorators, { kind: "field", name: "failedTransfers", static: false, private: false, access: { has: obj => "failedTransfers" in obj, get: obj => obj.failedTransfers, set: (obj, value) => { obj.failedTransfers = value; } }, metadata: _metadata }, _failedTransfers_initializers, _failedTransfers_extraInitializers);
            __esDecorate(null, null, _successRate_decorators, { kind: "field", name: "successRate", static: false, private: false, access: { has: obj => "successRate" in obj, get: obj => obj.successRate, set: (obj, value) => { obj.successRate = value; } }, metadata: _metadata }, _successRate_initializers, _successRate_extraInitializers);
            __esDecorate(null, null, _failureRate_decorators, { kind: "field", name: "failureRate", static: false, private: false, access: { has: obj => "failureRate" in obj, get: obj => obj.failureRate, set: (obj, value) => { obj.failureRate = value; } }, metadata: _metadata }, _failureRate_initializers, _failureRate_extraInitializers);
            __esDecorate(null, null, _averageSettlementTimeMs_decorators, { kind: "field", name: "averageSettlementTimeMs", static: false, private: false, access: { has: obj => "averageSettlementTimeMs" in obj, get: obj => obj.averageSettlementTimeMs, set: (obj, value) => { obj.averageSettlementTimeMs = value; } }, metadata: _metadata }, _averageSettlementTimeMs_initializers, _averageSettlementTimeMs_extraInitializers);
            __esDecorate(null, null, _minSettlementTimeMs_decorators, { kind: "field", name: "minSettlementTimeMs", static: false, private: false, access: { has: obj => "minSettlementTimeMs" in obj, get: obj => obj.minSettlementTimeMs, set: (obj, value) => { obj.minSettlementTimeMs = value; } }, metadata: _metadata }, _minSettlementTimeMs_initializers, _minSettlementTimeMs_extraInitializers);
            __esDecorate(null, null, _maxSettlementTimeMs_decorators, { kind: "field", name: "maxSettlementTimeMs", static: false, private: false, access: { has: obj => "maxSettlementTimeMs" in obj, get: obj => obj.maxSettlementTimeMs, set: (obj, value) => { obj.maxSettlementTimeMs = value; } }, metadata: _metadata }, _maxSettlementTimeMs_initializers, _maxSettlementTimeMs_extraInitializers);
            __esDecorate(null, null, _averageFee_decorators, { kind: "field", name: "averageFee", static: false, private: false, access: { has: obj => "averageFee" in obj, get: obj => obj.averageFee, set: (obj, value) => { obj.averageFee = value; } }, metadata: _metadata }, _averageFee_initializers, _averageFee_extraInitializers);
            __esDecorate(null, null, _averageSlippagePercent_decorators, { kind: "field", name: "averageSlippagePercent", static: false, private: false, access: { has: obj => "averageSlippagePercent" in obj, get: obj => obj.averageSlippagePercent, set: (obj, value) => { obj.averageSlippagePercent = value; } }, metadata: _metadata }, _averageSlippagePercent_initializers, _averageSlippagePercent_extraInitializers);
            __esDecorate(null, null, _totalVolume_decorators, { kind: "field", name: "totalVolume", static: false, private: false, access: { has: obj => "totalVolume" in obj, get: obj => obj.totalVolume, set: (obj, value) => { obj.totalVolume = value; } }, metadata: _metadata }, _totalVolume_initializers, _totalVolume_extraInitializers);
            __esDecorate(null, null, _lastUpdated_decorators, { kind: "field", name: "lastUpdated", static: false, private: false, access: { has: obj => "lastUpdated" in obj, get: obj => obj.lastUpdated, set: (obj, value) => { obj.lastUpdated = value; } }, metadata: _metadata }, _lastUpdated_initializers, _lastUpdated_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.RouteAnalyticsDto = RouteAnalyticsDto;
/**
 * DTO for time-series analytics data point
 */
let TimeSeriesDataPointDto = (() => {
    var _a;
    let _timestamp_decorators;
    let _timestamp_initializers = [];
    let _timestamp_extraInitializers = [];
    let _transfers_decorators;
    let _transfers_initializers = [];
    let _transfers_extraInitializers = [];
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
    return _a = class TimeSeriesDataPointDto {
            constructor() {
                this.timestamp = __runInitializers(this, _timestamp_initializers, void 0);
                this.transfers = (__runInitializers(this, _timestamp_extraInitializers), __runInitializers(this, _transfers_initializers, void 0));
                this.successfulTransfers = (__runInitializers(this, _transfers_extraInitializers), __runInitializers(this, _successfulTransfers_initializers, void 0));
                this.failedTransfers = (__runInitializers(this, _successfulTransfers_extraInitializers), __runInitializers(this, _failedTransfers_initializers, void 0));
                this.averageSettlementTimeMs = (__runInitializers(this, _failedTransfers_extraInitializers), __runInitializers(this, _averageSettlementTimeMs_initializers, void 0));
                this.averageFee = (__runInitializers(this, _averageSettlementTimeMs_extraInitializers), __runInitializers(this, _averageFee_initializers, void 0));
                this.averageSlippagePercent = (__runInitializers(this, _averageFee_extraInitializers), __runInitializers(this, _averageSlippagePercent_initializers, void 0));
                this.totalVolume = (__runInitializers(this, _averageSlippagePercent_extraInitializers), __runInitializers(this, _totalVolume_initializers, void 0));
                __runInitializers(this, _totalVolume_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _timestamp_decorators = [(0, swagger_1.ApiProperty)({ description: 'Timestamp for the data point' })];
            _transfers_decorators = [(0, swagger_1.ApiProperty)({ description: 'Number of transfers in this period' })];
            _successfulTransfers_decorators = [(0, swagger_1.ApiProperty)({ description: 'Number of successful transfers' })];
            _failedTransfers_decorators = [(0, swagger_1.ApiProperty)({ description: 'Number of failed transfers' })];
            _averageSettlementTimeMs_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Average settlement time' })];
            _averageFee_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Average fee' })];
            _averageSlippagePercent_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Average slippage' })];
            _totalVolume_decorators = [(0, swagger_1.ApiProperty)({ description: 'Total volume' })];
            __esDecorate(null, null, _timestamp_decorators, { kind: "field", name: "timestamp", static: false, private: false, access: { has: obj => "timestamp" in obj, get: obj => obj.timestamp, set: (obj, value) => { obj.timestamp = value; } }, metadata: _metadata }, _timestamp_initializers, _timestamp_extraInitializers);
            __esDecorate(null, null, _transfers_decorators, { kind: "field", name: "transfers", static: false, private: false, access: { has: obj => "transfers" in obj, get: obj => obj.transfers, set: (obj, value) => { obj.transfers = value; } }, metadata: _metadata }, _transfers_initializers, _transfers_extraInitializers);
            __esDecorate(null, null, _successfulTransfers_decorators, { kind: "field", name: "successfulTransfers", static: false, private: false, access: { has: obj => "successfulTransfers" in obj, get: obj => obj.successfulTransfers, set: (obj, value) => { obj.successfulTransfers = value; } }, metadata: _metadata }, _successfulTransfers_initializers, _successfulTransfers_extraInitializers);
            __esDecorate(null, null, _failedTransfers_decorators, { kind: "field", name: "failedTransfers", static: false, private: false, access: { has: obj => "failedTransfers" in obj, get: obj => obj.failedTransfers, set: (obj, value) => { obj.failedTransfers = value; } }, metadata: _metadata }, _failedTransfers_initializers, _failedTransfers_extraInitializers);
            __esDecorate(null, null, _averageSettlementTimeMs_decorators, { kind: "field", name: "averageSettlementTimeMs", static: false, private: false, access: { has: obj => "averageSettlementTimeMs" in obj, get: obj => obj.averageSettlementTimeMs, set: (obj, value) => { obj.averageSettlementTimeMs = value; } }, metadata: _metadata }, _averageSettlementTimeMs_initializers, _averageSettlementTimeMs_extraInitializers);
            __esDecorate(null, null, _averageFee_decorators, { kind: "field", name: "averageFee", static: false, private: false, access: { has: obj => "averageFee" in obj, get: obj => obj.averageFee, set: (obj, value) => { obj.averageFee = value; } }, metadata: _metadata }, _averageFee_initializers, _averageFee_extraInitializers);
            __esDecorate(null, null, _averageSlippagePercent_decorators, { kind: "field", name: "averageSlippagePercent", static: false, private: false, access: { has: obj => "averageSlippagePercent" in obj, get: obj => obj.averageSlippagePercent, set: (obj, value) => { obj.averageSlippagePercent = value; } }, metadata: _metadata }, _averageSlippagePercent_initializers, _averageSlippagePercent_extraInitializers);
            __esDecorate(null, null, _totalVolume_decorators, { kind: "field", name: "totalVolume", static: false, private: false, access: { has: obj => "totalVolume" in obj, get: obj => obj.totalVolume, set: (obj, value) => { obj.totalVolume = value; } }, metadata: _metadata }, _totalVolume_initializers, _totalVolume_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.TimeSeriesDataPointDto = TimeSeriesDataPointDto;
/**
 * DTO for time-series analytics response
 */
let TimeSeriesAnalyticsDto = (() => {
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
    let _granularity_decorators;
    let _granularity_initializers = [];
    let _granularity_extraInitializers = [];
    let _data_decorators;
    let _data_initializers = [];
    let _data_extraInitializers = [];
    return _a = class TimeSeriesAnalyticsDto {
            constructor() {
                this.bridgeName = __runInitializers(this, _bridgeName_initializers, void 0);
                this.sourceChain = (__runInitializers(this, _bridgeName_extraInitializers), __runInitializers(this, _sourceChain_initializers, void 0));
                this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
                this.token = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _token_initializers, void 0));
                this.granularity = (__runInitializers(this, _token_extraInitializers), __runInitializers(this, _granularity_initializers, void 0));
                this.data = (__runInitializers(this, _granularity_extraInitializers), __runInitializers(this, _data_initializers, void 0));
                __runInitializers(this, _data_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _bridgeName_decorators = [(0, swagger_1.ApiProperty)({ description: 'Bridge name' })];
            _sourceChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Source chain' })];
            _destinationChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Destination chain' })];
            _token_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Token symbol' })];
            _granularity_decorators = [(0, swagger_1.ApiProperty)({ description: 'Time granularity (hour, day, week, month)' })];
            _data_decorators = [(0, swagger_1.ApiProperty)({
                    description: 'Time series data points',
                    type: [TimeSeriesDataPointDto],
                })];
            __esDecorate(null, null, _bridgeName_decorators, { kind: "field", name: "bridgeName", static: false, private: false, access: { has: obj => "bridgeName" in obj, get: obj => obj.bridgeName, set: (obj, value) => { obj.bridgeName = value; } }, metadata: _metadata }, _bridgeName_initializers, _bridgeName_extraInitializers);
            __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
            __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
            __esDecorate(null, null, _token_decorators, { kind: "field", name: "token", static: false, private: false, access: { has: obj => "token" in obj, get: obj => obj.token, set: (obj, value) => { obj.token = value; } }, metadata: _metadata }, _token_initializers, _token_extraInitializers);
            __esDecorate(null, null, _granularity_decorators, { kind: "field", name: "granularity", static: false, private: false, access: { has: obj => "granularity" in obj, get: obj => obj.granularity, set: (obj, value) => { obj.granularity = value; } }, metadata: _metadata }, _granularity_initializers, _granularity_extraInitializers);
            __esDecorate(null, null, _data_decorators, { kind: "field", name: "data", static: false, private: false, access: { has: obj => "data" in obj, get: obj => obj.data, set: (obj, value) => { obj.data = value; } }, metadata: _metadata }, _data_initializers, _data_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.TimeSeriesAnalyticsDto = TimeSeriesAnalyticsDto;
/**
 * DTO for paginated analytics response
 */
let BridgeAnalyticsResponseDto = (() => {
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
    let _generatedAt_decorators;
    let _generatedAt_initializers = [];
    let _generatedAt_extraInitializers = [];
    return _a = class BridgeAnalyticsResponseDto {
            constructor() {
                this.data = __runInitializers(this, _data_initializers, void 0);
                this.total = (__runInitializers(this, _data_extraInitializers), __runInitializers(this, _total_initializers, void 0));
                this.page = (__runInitializers(this, _total_extraInitializers), __runInitializers(this, _page_initializers, void 0));
                this.limit = (__runInitializers(this, _page_extraInitializers), __runInitializers(this, _limit_initializers, void 0));
                this.totalPages = (__runInitializers(this, _limit_extraInitializers), __runInitializers(this, _totalPages_initializers, void 0));
                this.generatedAt = (__runInitializers(this, _totalPages_extraInitializers), __runInitializers(this, _generatedAt_initializers, void 0));
                __runInitializers(this, _generatedAt_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _data_decorators = [(0, swagger_1.ApiProperty)({ description: 'Analytics data', type: [RouteAnalyticsDto] })];
            _total_decorators = [(0, swagger_1.ApiProperty)({ description: 'Total number of records' })];
            _page_decorators = [(0, swagger_1.ApiProperty)({ description: 'Current page number' })];
            _limit_decorators = [(0, swagger_1.ApiProperty)({ description: 'Items per page' })];
            _totalPages_decorators = [(0, swagger_1.ApiProperty)({ description: 'Total number of pages' })];
            _generatedAt_decorators = [(0, swagger_1.ApiProperty)({ description: 'Response generation timestamp' })];
            __esDecorate(null, null, _data_decorators, { kind: "field", name: "data", static: false, private: false, access: { has: obj => "data" in obj, get: obj => obj.data, set: (obj, value) => { obj.data = value; } }, metadata: _metadata }, _data_initializers, _data_extraInitializers);
            __esDecorate(null, null, _total_decorators, { kind: "field", name: "total", static: false, private: false, access: { has: obj => "total" in obj, get: obj => obj.total, set: (obj, value) => { obj.total = value; } }, metadata: _metadata }, _total_initializers, _total_extraInitializers);
            __esDecorate(null, null, _page_decorators, { kind: "field", name: "page", static: false, private: false, access: { has: obj => "page" in obj, get: obj => obj.page, set: (obj, value) => { obj.page = value; } }, metadata: _metadata }, _page_initializers, _page_extraInitializers);
            __esDecorate(null, null, _limit_decorators, { kind: "field", name: "limit", static: false, private: false, access: { has: obj => "limit" in obj, get: obj => obj.limit, set: (obj, value) => { obj.limit = value; } }, metadata: _metadata }, _limit_initializers, _limit_extraInitializers);
            __esDecorate(null, null, _totalPages_decorators, { kind: "field", name: "totalPages", static: false, private: false, access: { has: obj => "totalPages" in obj, get: obj => obj.totalPages, set: (obj, value) => { obj.totalPages = value; } }, metadata: _metadata }, _totalPages_initializers, _totalPages_extraInitializers);
            __esDecorate(null, null, _generatedAt_decorators, { kind: "field", name: "generatedAt", static: false, private: false, access: { has: obj => "generatedAt" in obj, get: obj => obj.generatedAt, set: (obj, value) => { obj.generatedAt = value; } }, metadata: _metadata }, _generatedAt_initializers, _generatedAt_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.BridgeAnalyticsResponseDto = BridgeAnalyticsResponseDto;
/**
 * DTO for top performing bridges response
 */
let TopPerformingBridgesDto = (() => {
    var _a;
    let _byVolume_decorators;
    let _byVolume_initializers = [];
    let _byVolume_extraInitializers = [];
    let _bySuccessRate_decorators;
    let _bySuccessRate_initializers = [];
    let _bySuccessRate_extraInitializers = [];
    let _bySpeed_decorators;
    let _bySpeed_initializers = [];
    let _bySpeed_extraInitializers = [];
    let _generatedAt_decorators;
    let _generatedAt_initializers = [];
    let _generatedAt_extraInitializers = [];
    return _a = class TopPerformingBridgesDto {
            constructor() {
                this.byVolume = __runInitializers(this, _byVolume_initializers, void 0);
                this.bySuccessRate = (__runInitializers(this, _byVolume_extraInitializers), __runInitializers(this, _bySuccessRate_initializers, void 0));
                this.bySpeed = (__runInitializers(this, _bySuccessRate_extraInitializers), __runInitializers(this, _bySpeed_initializers, void 0));
                this.generatedAt = (__runInitializers(this, _bySpeed_extraInitializers), __runInitializers(this, _generatedAt_initializers, void 0));
                __runInitializers(this, _generatedAt_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _byVolume_decorators = [(0, swagger_1.ApiProperty)({
                    description: 'Top bridges by volume',
                    type: [RouteAnalyticsDto],
                })];
            _bySuccessRate_decorators = [(0, swagger_1.ApiProperty)({
                    description: 'Top bridges by success rate',
                    type: [RouteAnalyticsDto],
                })];
            _bySpeed_decorators = [(0, swagger_1.ApiProperty)({
                    description: 'Top bridges by speed',
                    type: [RouteAnalyticsDto],
                })];
            _generatedAt_decorators = [(0, swagger_1.ApiProperty)({ description: 'Response generation timestamp' })];
            __esDecorate(null, null, _byVolume_decorators, { kind: "field", name: "byVolume", static: false, private: false, access: { has: obj => "byVolume" in obj, get: obj => obj.byVolume, set: (obj, value) => { obj.byVolume = value; } }, metadata: _metadata }, _byVolume_initializers, _byVolume_extraInitializers);
            __esDecorate(null, null, _bySuccessRate_decorators, { kind: "field", name: "bySuccessRate", static: false, private: false, access: { has: obj => "bySuccessRate" in obj, get: obj => obj.bySuccessRate, set: (obj, value) => { obj.bySuccessRate = value; } }, metadata: _metadata }, _bySuccessRate_initializers, _bySuccessRate_extraInitializers);
            __esDecorate(null, null, _bySpeed_decorators, { kind: "field", name: "bySpeed", static: false, private: false, access: { has: obj => "bySpeed" in obj, get: obj => obj.bySpeed, set: (obj, value) => { obj.bySpeed = value; } }, metadata: _metadata }, _bySpeed_initializers, _bySpeed_extraInitializers);
            __esDecorate(null, null, _generatedAt_decorators, { kind: "field", name: "generatedAt", static: false, private: false, access: { has: obj => "generatedAt" in obj, get: obj => obj.generatedAt, set: (obj, value) => { obj.generatedAt = value; } }, metadata: _metadata }, _generatedAt_initializers, _generatedAt_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.TopPerformingBridgesDto = TopPerformingBridgesDto;
/**
 * DTO for slippage statistics
 */
let SlippageStatisticsDto = (() => {
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
    let _averageSlippagePercent_decorators;
    let _averageSlippagePercent_initializers = [];
    let _averageSlippagePercent_extraInitializers = [];
    let _minSlippagePercent_decorators;
    let _minSlippagePercent_initializers = [];
    let _minSlippagePercent_extraInitializers = [];
    let _maxSlippagePercent_decorators;
    let _maxSlippagePercent_initializers = [];
    let _maxSlippagePercent_extraInitializers = [];
    let _highSlippageCount_decorators;
    let _highSlippageCount_initializers = [];
    let _highSlippageCount_extraInitializers = [];
    let _highSlippagePercentage_decorators;
    let _highSlippagePercentage_initializers = [];
    let _highSlippagePercentage_extraInitializers = [];
    let _distribution_decorators;
    let _distribution_initializers = [];
    let _distribution_extraInitializers = [];
    return _a = class SlippageStatisticsDto {
            constructor() {
                this.bridgeName = __runInitializers(this, _bridgeName_initializers, void 0);
                this.sourceChain = (__runInitializers(this, _bridgeName_extraInitializers), __runInitializers(this, _sourceChain_initializers, void 0));
                this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
                this.averageSlippagePercent = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _averageSlippagePercent_initializers, void 0));
                this.minSlippagePercent = (__runInitializers(this, _averageSlippagePercent_extraInitializers), __runInitializers(this, _minSlippagePercent_initializers, void 0));
                this.maxSlippagePercent = (__runInitializers(this, _minSlippagePercent_extraInitializers), __runInitializers(this, _maxSlippagePercent_initializers, void 0));
                this.highSlippageCount = (__runInitializers(this, _maxSlippagePercent_extraInitializers), __runInitializers(this, _highSlippageCount_initializers, void 0));
                this.highSlippagePercentage = (__runInitializers(this, _highSlippageCount_extraInitializers), __runInitializers(this, _highSlippagePercentage_initializers, void 0));
                this.distribution = (__runInitializers(this, _highSlippagePercentage_extraInitializers), __runInitializers(this, _distribution_initializers, void 0));
                __runInitializers(this, _distribution_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _bridgeName_decorators = [(0, swagger_1.ApiProperty)({ description: 'Bridge name' })];
            _sourceChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Source chain' })];
            _destinationChain_decorators = [(0, swagger_1.ApiProperty)({ description: 'Destination chain' })];
            _averageSlippagePercent_decorators = [(0, swagger_1.ApiProperty)({ description: 'Average slippage percentage' })];
            _minSlippagePercent_decorators = [(0, swagger_1.ApiProperty)({ description: 'Minimum slippage percentage' })];
            _maxSlippagePercent_decorators = [(0, swagger_1.ApiProperty)({ description: 'Maximum slippage percentage' })];
            _highSlippageCount_decorators = [(0, swagger_1.ApiProperty)({ description: 'Number of high slippage transfers (>1%)' })];
            _highSlippagePercentage_decorators = [(0, swagger_1.ApiProperty)({ description: 'Percentage of transfers with high slippage' })];
            _distribution_decorators = [(0, swagger_1.ApiProperty)({ description: 'Slippage distribution buckets' })];
            __esDecorate(null, null, _bridgeName_decorators, { kind: "field", name: "bridgeName", static: false, private: false, access: { has: obj => "bridgeName" in obj, get: obj => obj.bridgeName, set: (obj, value) => { obj.bridgeName = value; } }, metadata: _metadata }, _bridgeName_initializers, _bridgeName_extraInitializers);
            __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
            __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
            __esDecorate(null, null, _averageSlippagePercent_decorators, { kind: "field", name: "averageSlippagePercent", static: false, private: false, access: { has: obj => "averageSlippagePercent" in obj, get: obj => obj.averageSlippagePercent, set: (obj, value) => { obj.averageSlippagePercent = value; } }, metadata: _metadata }, _averageSlippagePercent_initializers, _averageSlippagePercent_extraInitializers);
            __esDecorate(null, null, _minSlippagePercent_decorators, { kind: "field", name: "minSlippagePercent", static: false, private: false, access: { has: obj => "minSlippagePercent" in obj, get: obj => obj.minSlippagePercent, set: (obj, value) => { obj.minSlippagePercent = value; } }, metadata: _metadata }, _minSlippagePercent_initializers, _minSlippagePercent_extraInitializers);
            __esDecorate(null, null, _maxSlippagePercent_decorators, { kind: "field", name: "maxSlippagePercent", static: false, private: false, access: { has: obj => "maxSlippagePercent" in obj, get: obj => obj.maxSlippagePercent, set: (obj, value) => { obj.maxSlippagePercent = value; } }, metadata: _metadata }, _maxSlippagePercent_initializers, _maxSlippagePercent_extraInitializers);
            __esDecorate(null, null, _highSlippageCount_decorators, { kind: "field", name: "highSlippageCount", static: false, private: false, access: { has: obj => "highSlippageCount" in obj, get: obj => obj.highSlippageCount, set: (obj, value) => { obj.highSlippageCount = value; } }, metadata: _metadata }, _highSlippageCount_initializers, _highSlippageCount_extraInitializers);
            __esDecorate(null, null, _highSlippagePercentage_decorators, { kind: "field", name: "highSlippagePercentage", static: false, private: false, access: { has: obj => "highSlippagePercentage" in obj, get: obj => obj.highSlippagePercentage, set: (obj, value) => { obj.highSlippagePercentage = value; } }, metadata: _metadata }, _highSlippagePercentage_initializers, _highSlippagePercentage_extraInitializers);
            __esDecorate(null, null, _distribution_decorators, { kind: "field", name: "distribution", static: false, private: false, access: { has: obj => "distribution" in obj, get: obj => obj.distribution, set: (obj, value) => { obj.distribution = value; } }, metadata: _metadata }, _distribution_initializers, _distribution_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.SlippageStatisticsDto = SlippageStatisticsDto;
/**
 * DTO for user activity insights
 */
let UserActivityInsightsDto = (() => {
    var _a;
    let _totalUniqueUsers_decorators;
    let _totalUniqueUsers_initializers = [];
    let _totalUniqueUsers_extraInitializers = [];
    let _totalTransfers_decorators;
    let _totalTransfers_initializers = [];
    let _totalTransfers_extraInitializers = [];
    let _averageTransfersPerUser_decorators;
    let _averageTransfersPerUser_initializers = [];
    let _averageTransfersPerUser_extraInitializers = [];
    let _peakActivityPeriod_decorators;
    let _peakActivityPeriod_initializers = [];
    let _peakActivityPeriod_extraInitializers = [];
    let _popularRoutes_decorators;
    let _popularRoutes_initializers = [];
    let _popularRoutes_extraInitializers = [];
    let _generatedAt_decorators;
    let _generatedAt_initializers = [];
    let _generatedAt_extraInitializers = [];
    return _a = class UserActivityInsightsDto {
            constructor() {
                this.totalUniqueUsers = __runInitializers(this, _totalUniqueUsers_initializers, void 0);
                this.totalTransfers = (__runInitializers(this, _totalUniqueUsers_extraInitializers), __runInitializers(this, _totalTransfers_initializers, void 0));
                this.averageTransfersPerUser = (__runInitializers(this, _totalTransfers_extraInitializers), __runInitializers(this, _averageTransfersPerUser_initializers, void 0));
                this.peakActivityPeriod = (__runInitializers(this, _averageTransfersPerUser_extraInitializers), __runInitializers(this, _peakActivityPeriod_initializers, void 0));
                this.popularRoutes = (__runInitializers(this, _peakActivityPeriod_extraInitializers), __runInitializers(this, _popularRoutes_initializers, void 0));
                this.generatedAt = (__runInitializers(this, _popularRoutes_extraInitializers), __runInitializers(this, _generatedAt_initializers, void 0));
                __runInitializers(this, _generatedAt_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _totalUniqueUsers_decorators = [(0, swagger_1.ApiProperty)({ description: 'Total unique users (anonymized)' })];
            _totalTransfers_decorators = [(0, swagger_1.ApiProperty)({ description: 'Total transfers' })];
            _averageTransfersPerUser_decorators = [(0, swagger_1.ApiProperty)({ description: 'Average transfers per user' })];
            _peakActivityPeriod_decorators = [(0, swagger_1.ApiProperty)({ description: 'Most active time period' })];
            _popularRoutes_decorators = [(0, swagger_1.ApiProperty)({
                    description: 'Most popular routes',
                    type: [RouteAnalyticsDto],
                })];
            _generatedAt_decorators = [(0, swagger_1.ApiProperty)({ description: 'Response generation timestamp' })];
            __esDecorate(null, null, _totalUniqueUsers_decorators, { kind: "field", name: "totalUniqueUsers", static: false, private: false, access: { has: obj => "totalUniqueUsers" in obj, get: obj => obj.totalUniqueUsers, set: (obj, value) => { obj.totalUniqueUsers = value; } }, metadata: _metadata }, _totalUniqueUsers_initializers, _totalUniqueUsers_extraInitializers);
            __esDecorate(null, null, _totalTransfers_decorators, { kind: "field", name: "totalTransfers", static: false, private: false, access: { has: obj => "totalTransfers" in obj, get: obj => obj.totalTransfers, set: (obj, value) => { obj.totalTransfers = value; } }, metadata: _metadata }, _totalTransfers_initializers, _totalTransfers_extraInitializers);
            __esDecorate(null, null, _averageTransfersPerUser_decorators, { kind: "field", name: "averageTransfersPerUser", static: false, private: false, access: { has: obj => "averageTransfersPerUser" in obj, get: obj => obj.averageTransfersPerUser, set: (obj, value) => { obj.averageTransfersPerUser = value; } }, metadata: _metadata }, _averageTransfersPerUser_initializers, _averageTransfersPerUser_extraInitializers);
            __esDecorate(null, null, _peakActivityPeriod_decorators, { kind: "field", name: "peakActivityPeriod", static: false, private: false, access: { has: obj => "peakActivityPeriod" in obj, get: obj => obj.peakActivityPeriod, set: (obj, value) => { obj.peakActivityPeriod = value; } }, metadata: _metadata }, _peakActivityPeriod_initializers, _peakActivityPeriod_extraInitializers);
            __esDecorate(null, null, _popularRoutes_decorators, { kind: "field", name: "popularRoutes", static: false, private: false, access: { has: obj => "popularRoutes" in obj, get: obj => obj.popularRoutes, set: (obj, value) => { obj.popularRoutes = value; } }, metadata: _metadata }, _popularRoutes_initializers, _popularRoutes_extraInitializers);
            __esDecorate(null, null, _generatedAt_decorators, { kind: "field", name: "generatedAt", static: false, private: false, access: { has: obj => "generatedAt" in obj, get: obj => obj.generatedAt, set: (obj, value) => { obj.generatedAt = value; } }, metadata: _metadata }, _generatedAt_initializers, _generatedAt_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.UserActivityInsightsDto = UserActivityInsightsDto;
//# sourceMappingURL=bridge-analytics.dto.js.map