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
exports.ReliabilityRankingFactorDto = exports.BridgeReliabilityResponseDto = exports.ReliabilityBadgeDto = exports.GetReliabilityDto = exports.RecordBridgeEventDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const reliability_enum_1 = require("./reliability.enum");
// ─── Record Event ────────────────────────────────────────────────────────────
let RecordBridgeEventDto = (() => {
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
    let _outcome_decorators;
    let _outcome_initializers = [];
    let _outcome_extraInitializers = [];
    let _transactionHash_decorators;
    let _transactionHash_initializers = [];
    let _transactionHash_extraInitializers = [];
    let _failureReason_decorators;
    let _failureReason_initializers = [];
    let _failureReason_extraInitializers = [];
    let _durationMs_decorators;
    let _durationMs_initializers = [];
    let _durationMs_extraInitializers = [];
    return _a = class RecordBridgeEventDto {
            constructor() {
                this.bridgeName = __runInitializers(this, _bridgeName_initializers, void 0);
                this.sourceChain = (__runInitializers(this, _bridgeName_extraInitializers), __runInitializers(this, _sourceChain_initializers, void 0));
                this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
                this.outcome = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _outcome_initializers, void 0));
                this.transactionHash = (__runInitializers(this, _outcome_extraInitializers), __runInitializers(this, _transactionHash_initializers, void 0));
                this.failureReason = (__runInitializers(this, _transactionHash_extraInitializers), __runInitializers(this, _failureReason_initializers, void 0));
                this.durationMs = (__runInitializers(this, _failureReason_extraInitializers), __runInitializers(this, _durationMs_initializers, void 0));
                __runInitializers(this, _durationMs_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _bridgeName_decorators = [(0, swagger_1.ApiProperty)({ example: 'Stargate' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _sourceChain_decorators = [(0, swagger_1.ApiProperty)({ example: 'ethereum' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _destinationChain_decorators = [(0, swagger_1.ApiProperty)({ example: 'polygon' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _outcome_decorators = [(0, swagger_1.ApiProperty)({ enum: reliability_enum_1.TransactionOutcome }), (0, class_validator_1.IsEnum)(reliability_enum_1.TransactionOutcome)];
            _transactionHash_decorators = [(0, swagger_1.ApiPropertyOptional)({ example: '0xabc123' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _failureReason_decorators = [(0, swagger_1.ApiPropertyOptional)({ example: 'RPC timeout after 30s' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _durationMs_decorators = [(0, swagger_1.ApiPropertyOptional)({ example: 12000 }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsNumber)(), (0, class_validator_1.Min)(0)];
            __esDecorate(null, null, _bridgeName_decorators, { kind: "field", name: "bridgeName", static: false, private: false, access: { has: obj => "bridgeName" in obj, get: obj => obj.bridgeName, set: (obj, value) => { obj.bridgeName = value; } }, metadata: _metadata }, _bridgeName_initializers, _bridgeName_extraInitializers);
            __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
            __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
            __esDecorate(null, null, _outcome_decorators, { kind: "field", name: "outcome", static: false, private: false, access: { has: obj => "outcome" in obj, get: obj => obj.outcome, set: (obj, value) => { obj.outcome = value; } }, metadata: _metadata }, _outcome_initializers, _outcome_extraInitializers);
            __esDecorate(null, null, _transactionHash_decorators, { kind: "field", name: "transactionHash", static: false, private: false, access: { has: obj => "transactionHash" in obj, get: obj => obj.transactionHash, set: (obj, value) => { obj.transactionHash = value; } }, metadata: _metadata }, _transactionHash_initializers, _transactionHash_extraInitializers);
            __esDecorate(null, null, _failureReason_decorators, { kind: "field", name: "failureReason", static: false, private: false, access: { has: obj => "failureReason" in obj, get: obj => obj.failureReason, set: (obj, value) => { obj.failureReason = value; } }, metadata: _metadata }, _failureReason_initializers, _failureReason_extraInitializers);
            __esDecorate(null, null, _durationMs_decorators, { kind: "field", name: "durationMs", static: false, private: false, access: { has: obj => "durationMs" in obj, get: obj => obj.durationMs, set: (obj, value) => { obj.durationMs = value; } }, metadata: _metadata }, _durationMs_initializers, _durationMs_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.RecordBridgeEventDto = RecordBridgeEventDto;
// ─── Query Reliability ────────────────────────────────────────────────────────
let GetReliabilityDto = (() => {
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
    let _windowMode_decorators;
    let _windowMode_initializers = [];
    let _windowMode_extraInitializers = [];
    let _windowSize_decorators;
    let _windowSize_initializers = [];
    let _windowSize_extraInitializers = [];
    return _a = class GetReliabilityDto {
            constructor() {
                this.bridgeName = __runInitializers(this, _bridgeName_initializers, void 0);
                this.sourceChain = (__runInitializers(this, _bridgeName_extraInitializers), __runInitializers(this, _sourceChain_initializers, void 0));
                this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
                this.windowMode = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _windowMode_initializers, void 0));
                this.windowSize = (__runInitializers(this, _windowMode_extraInitializers), __runInitializers(this, _windowSize_initializers, void 0));
                __runInitializers(this, _windowSize_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _bridgeName_decorators = [(0, swagger_1.ApiProperty)({ example: 'Stargate' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _sourceChain_decorators = [(0, swagger_1.ApiProperty)({ example: 'ethereum' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _destinationChain_decorators = [(0, swagger_1.ApiProperty)({ example: 'polygon' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _windowMode_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    enum: reliability_enum_1.WindowMode,
                    default: reliability_enum_1.WindowMode.TRANSACTION_COUNT,
                }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsEnum)(reliability_enum_1.WindowMode)];
            _windowSize_decorators = [(0, swagger_1.ApiPropertyOptional)({ example: 100 }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsNumber)(), (0, class_validator_1.Min)(1), (0, class_validator_1.Max)(10000)];
            __esDecorate(null, null, _bridgeName_decorators, { kind: "field", name: "bridgeName", static: false, private: false, access: { has: obj => "bridgeName" in obj, get: obj => obj.bridgeName, set: (obj, value) => { obj.bridgeName = value; } }, metadata: _metadata }, _bridgeName_initializers, _bridgeName_extraInitializers);
            __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
            __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
            __esDecorate(null, null, _windowMode_decorators, { kind: "field", name: "windowMode", static: false, private: false, access: { has: obj => "windowMode" in obj, get: obj => obj.windowMode, set: (obj, value) => { obj.windowMode = value; } }, metadata: _metadata }, _windowMode_initializers, _windowMode_extraInitializers);
            __esDecorate(null, null, _windowSize_decorators, { kind: "field", name: "windowSize", static: false, private: false, access: { has: obj => "windowSize" in obj, get: obj => obj.windowSize, set: (obj, value) => { obj.windowSize = value; } }, metadata: _metadata }, _windowSize_initializers, _windowSize_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.GetReliabilityDto = GetReliabilityDto;
// ─── Response ─────────────────────────────────────────────────────────────────
let ReliabilityBadgeDto = (() => {
    var _a;
    let _tier_decorators;
    let _tier_initializers = [];
    let _tier_extraInitializers = [];
    let _label_decorators;
    let _label_initializers = [];
    let _label_extraInitializers = [];
    let _color_decorators;
    let _color_initializers = [];
    let _color_extraInitializers = [];
    let _tooltip_decorators;
    let _tooltip_initializers = [];
    let _tooltip_extraInitializers = [];
    return _a = class ReliabilityBadgeDto {
            constructor() {
                this.tier = __runInitializers(this, _tier_initializers, void 0);
                this.label = (__runInitializers(this, _tier_extraInitializers), __runInitializers(this, _label_initializers, void 0));
                this.color = (__runInitializers(this, _label_extraInitializers), __runInitializers(this, _color_initializers, void 0));
                this.tooltip = (__runInitializers(this, _color_extraInitializers), __runInitializers(this, _tooltip_initializers, void 0));
                __runInitializers(this, _tooltip_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _tier_decorators = [(0, swagger_1.ApiProperty)({ enum: reliability_enum_1.ReliabilityTier })];
            _label_decorators = [(0, swagger_1.ApiProperty)({ example: 'High Reliability' })];
            _color_decorators = [(0, swagger_1.ApiProperty)({ example: '#22c55e' })];
            _tooltip_decorators = [(0, swagger_1.ApiProperty)({
                    example: 'Score based on last 100 transactions. Excludes user-cancelled events.',
                })];
            __esDecorate(null, null, _tier_decorators, { kind: "field", name: "tier", static: false, private: false, access: { has: obj => "tier" in obj, get: obj => obj.tier, set: (obj, value) => { obj.tier = value; } }, metadata: _metadata }, _tier_initializers, _tier_extraInitializers);
            __esDecorate(null, null, _label_decorators, { kind: "field", name: "label", static: false, private: false, access: { has: obj => "label" in obj, get: obj => obj.label, set: (obj, value) => { obj.label = value; } }, metadata: _metadata }, _label_initializers, _label_extraInitializers);
            __esDecorate(null, null, _color_decorators, { kind: "field", name: "color", static: false, private: false, access: { has: obj => "color" in obj, get: obj => obj.color, set: (obj, value) => { obj.color = value; } }, metadata: _metadata }, _color_initializers, _color_extraInitializers);
            __esDecorate(null, null, _tooltip_decorators, { kind: "field", name: "tooltip", static: false, private: false, access: { has: obj => "tooltip" in obj, get: obj => obj.tooltip, set: (obj, value) => { obj.tooltip = value; } }, metadata: _metadata }, _tooltip_initializers, _tooltip_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.ReliabilityBadgeDto = ReliabilityBadgeDto;
let BridgeReliabilityResponseDto = (() => {
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
    let _totalAttempts_decorators;
    let _totalAttempts_initializers = [];
    let _totalAttempts_extraInitializers = [];
    let _successfulTransfers_decorators;
    let _successfulTransfers_initializers = [];
    let _successfulTransfers_extraInitializers = [];
    let _failedTransfers_decorators;
    let _failedTransfers_initializers = [];
    let _failedTransfers_extraInitializers = [];
    let _timeoutCount_decorators;
    let _timeoutCount_initializers = [];
    let _timeoutCount_extraInitializers = [];
    let _reliabilityPercent_decorators;
    let _reliabilityPercent_initializers = [];
    let _reliabilityPercent_extraInitializers = [];
    let _reliabilityScore_decorators;
    let _reliabilityScore_initializers = [];
    let _reliabilityScore_extraInitializers = [];
    let _badge_decorators;
    let _badge_initializers = [];
    let _badge_extraInitializers = [];
    let _lastComputedAt_decorators;
    let _lastComputedAt_initializers = [];
    let _lastComputedAt_extraInitializers = [];
    return _a = class BridgeReliabilityResponseDto {
            constructor() {
                this.bridgeName = __runInitializers(this, _bridgeName_initializers, void 0);
                this.sourceChain = (__runInitializers(this, _bridgeName_extraInitializers), __runInitializers(this, _sourceChain_initializers, void 0));
                this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
                this.totalAttempts = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _totalAttempts_initializers, void 0));
                this.successfulTransfers = (__runInitializers(this, _totalAttempts_extraInitializers), __runInitializers(this, _successfulTransfers_initializers, void 0));
                this.failedTransfers = (__runInitializers(this, _successfulTransfers_extraInitializers), __runInitializers(this, _failedTransfers_initializers, void 0));
                this.timeoutCount = (__runInitializers(this, _failedTransfers_extraInitializers), __runInitializers(this, _timeoutCount_initializers, void 0));
                this.reliabilityPercent = (__runInitializers(this, _timeoutCount_extraInitializers), __runInitializers(this, _reliabilityPercent_initializers, void 0));
                this.reliabilityScore = (__runInitializers(this, _reliabilityPercent_extraInitializers), __runInitializers(this, _reliabilityScore_initializers, void 0));
                this.badge = (__runInitializers(this, _reliabilityScore_extraInitializers), __runInitializers(this, _badge_initializers, void 0));
                this.lastComputedAt = (__runInitializers(this, _badge_extraInitializers), __runInitializers(this, _lastComputedAt_initializers, void 0));
                __runInitializers(this, _lastComputedAt_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _bridgeName_decorators = [(0, swagger_1.ApiProperty)({ example: 'Stargate' })];
            _sourceChain_decorators = [(0, swagger_1.ApiProperty)({ example: 'ethereum' })];
            _destinationChain_decorators = [(0, swagger_1.ApiProperty)({ example: 'polygon' })];
            _totalAttempts_decorators = [(0, swagger_1.ApiProperty)({ example: 240 })];
            _successfulTransfers_decorators = [(0, swagger_1.ApiProperty)({ example: 235 })];
            _failedTransfers_decorators = [(0, swagger_1.ApiProperty)({ example: 3 })];
            _timeoutCount_decorators = [(0, swagger_1.ApiProperty)({ example: 2 })];
            _reliabilityPercent_decorators = [(0, swagger_1.ApiProperty)({ example: 97.92 })];
            _reliabilityScore_decorators = [(0, swagger_1.ApiProperty)({ example: 97.92 })];
            _badge_decorators = [(0, swagger_1.ApiProperty)({ type: ReliabilityBadgeDto })];
            _lastComputedAt_decorators = [(0, swagger_1.ApiProperty)({ example: '2024-01-15T10:30:00.000Z' })];
            __esDecorate(null, null, _bridgeName_decorators, { kind: "field", name: "bridgeName", static: false, private: false, access: { has: obj => "bridgeName" in obj, get: obj => obj.bridgeName, set: (obj, value) => { obj.bridgeName = value; } }, metadata: _metadata }, _bridgeName_initializers, _bridgeName_extraInitializers);
            __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
            __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
            __esDecorate(null, null, _totalAttempts_decorators, { kind: "field", name: "totalAttempts", static: false, private: false, access: { has: obj => "totalAttempts" in obj, get: obj => obj.totalAttempts, set: (obj, value) => { obj.totalAttempts = value; } }, metadata: _metadata }, _totalAttempts_initializers, _totalAttempts_extraInitializers);
            __esDecorate(null, null, _successfulTransfers_decorators, { kind: "field", name: "successfulTransfers", static: false, private: false, access: { has: obj => "successfulTransfers" in obj, get: obj => obj.successfulTransfers, set: (obj, value) => { obj.successfulTransfers = value; } }, metadata: _metadata }, _successfulTransfers_initializers, _successfulTransfers_extraInitializers);
            __esDecorate(null, null, _failedTransfers_decorators, { kind: "field", name: "failedTransfers", static: false, private: false, access: { has: obj => "failedTransfers" in obj, get: obj => obj.failedTransfers, set: (obj, value) => { obj.failedTransfers = value; } }, metadata: _metadata }, _failedTransfers_initializers, _failedTransfers_extraInitializers);
            __esDecorate(null, null, _timeoutCount_decorators, { kind: "field", name: "timeoutCount", static: false, private: false, access: { has: obj => "timeoutCount" in obj, get: obj => obj.timeoutCount, set: (obj, value) => { obj.timeoutCount = value; } }, metadata: _metadata }, _timeoutCount_initializers, _timeoutCount_extraInitializers);
            __esDecorate(null, null, _reliabilityPercent_decorators, { kind: "field", name: "reliabilityPercent", static: false, private: false, access: { has: obj => "reliabilityPercent" in obj, get: obj => obj.reliabilityPercent, set: (obj, value) => { obj.reliabilityPercent = value; } }, metadata: _metadata }, _reliabilityPercent_initializers, _reliabilityPercent_extraInitializers);
            __esDecorate(null, null, _reliabilityScore_decorators, { kind: "field", name: "reliabilityScore", static: false, private: false, access: { has: obj => "reliabilityScore" in obj, get: obj => obj.reliabilityScore, set: (obj, value) => { obj.reliabilityScore = value; } }, metadata: _metadata }, _reliabilityScore_initializers, _reliabilityScore_extraInitializers);
            __esDecorate(null, null, _badge_decorators, { kind: "field", name: "badge", static: false, private: false, access: { has: obj => "badge" in obj, get: obj => obj.badge, set: (obj, value) => { obj.badge = value; } }, metadata: _metadata }, _badge_initializers, _badge_extraInitializers);
            __esDecorate(null, null, _lastComputedAt_decorators, { kind: "field", name: "lastComputedAt", static: false, private: false, access: { has: obj => "lastComputedAt" in obj, get: obj => obj.lastComputedAt, set: (obj, value) => { obj.lastComputedAt = value; } }, metadata: _metadata }, _lastComputedAt_initializers, _lastComputedAt_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.BridgeReliabilityResponseDto = BridgeReliabilityResponseDto;
// ─── Ranking Integration ──────────────────────────────────────────────────────
class ReliabilityRankingFactorDto {
}
exports.ReliabilityRankingFactorDto = ReliabilityRankingFactorDto;
//# sourceMappingURL=reliability.dto.js.map