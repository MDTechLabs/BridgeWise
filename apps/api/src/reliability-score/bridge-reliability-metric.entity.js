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
exports.BridgeReliabilityMetric = void 0;
const typeorm_1 = require("typeorm");
const reliability_enum_1 = require("./reliability.enum");
let BridgeReliabilityMetric = (() => {
    let _classDecorators = [(0, typeorm_1.Entity)('bridge_reliability_metrics'), (0, typeorm_1.Unique)(['bridgeName', 'sourceChain', 'destinationChain'])];
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
    let _reliabilityTier_decorators;
    let _reliabilityTier_initializers = [];
    let _reliabilityTier_extraInitializers = [];
    let _windowConfig_decorators;
    let _windowConfig_initializers = [];
    let _windowConfig_extraInitializers = [];
    let _lastComputedAt_decorators;
    let _lastComputedAt_initializers = [];
    let _lastComputedAt_extraInitializers = [];
    var BridgeReliabilityMetric = _classThis = class {
        constructor() {
            this.id = __runInitializers(this, _id_initializers, void 0);
            this.bridgeName = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _bridgeName_initializers, void 0));
            this.sourceChain = (__runInitializers(this, _bridgeName_extraInitializers), __runInitializers(this, _sourceChain_initializers, void 0));
            this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
            this.totalAttempts = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _totalAttempts_initializers, void 0));
            this.successfulTransfers = (__runInitializers(this, _totalAttempts_extraInitializers), __runInitializers(this, _successfulTransfers_initializers, void 0));
            this.failedTransfers = (__runInitializers(this, _successfulTransfers_extraInitializers), __runInitializers(this, _failedTransfers_initializers, void 0));
            this.timeoutCount = (__runInitializers(this, _failedTransfers_extraInitializers), __runInitializers(this, _timeoutCount_initializers, void 0));
            this.reliabilityPercent = (__runInitializers(this, _timeoutCount_extraInitializers), __runInitializers(this, _reliabilityPercent_initializers, void 0));
            this.reliabilityScore = (__runInitializers(this, _reliabilityPercent_extraInitializers), __runInitializers(this, _reliabilityScore_initializers, void 0));
            this.reliabilityTier = (__runInitializers(this, _reliabilityScore_extraInitializers), __runInitializers(this, _reliabilityTier_initializers, void 0));
            this.windowConfig = (__runInitializers(this, _reliabilityTier_extraInitializers), __runInitializers(this, _windowConfig_initializers, void 0));
            this.lastComputedAt = (__runInitializers(this, _windowConfig_extraInitializers), __runInitializers(this, _lastComputedAt_initializers, void 0));
            __runInitializers(this, _lastComputedAt_extraInitializers);
        }
    };
    __setFunctionName(_classThis, "BridgeReliabilityMetric");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _id_decorators = [(0, typeorm_1.PrimaryGeneratedColumn)('uuid')];
        _bridgeName_decorators = [(0, typeorm_1.Column)({ length: 100 }), (0, typeorm_1.Index)()];
        _sourceChain_decorators = [(0, typeorm_1.Column)({ length: 50 })];
        _destinationChain_decorators = [(0, typeorm_1.Column)({ length: 50 })];
        _totalAttempts_decorators = [(0, typeorm_1.Column)({ type: 'int', default: 0 })];
        _successfulTransfers_decorators = [(0, typeorm_1.Column)({ type: 'int', default: 0 })];
        _failedTransfers_decorators = [(0, typeorm_1.Column)({ type: 'int', default: 0 })];
        _timeoutCount_decorators = [(0, typeorm_1.Column)({ type: 'int', default: 0 })];
        _reliabilityPercent_decorators = [(0, typeorm_1.Column)({ type: 'decimal', precision: 5, scale: 2, default: 0 })];
        _reliabilityScore_decorators = [(0, typeorm_1.Column)({ type: 'decimal', precision: 5, scale: 2, default: 0 })];
        _reliabilityTier_decorators = [(0, typeorm_1.Column)({ type: 'enum', enum: reliability_enum_1.ReliabilityTier, default: reliability_enum_1.ReliabilityTier.LOW })];
        _windowConfig_decorators = [(0, typeorm_1.Column)({ type: 'jsonb', nullable: true })];
        _lastComputedAt_decorators = [(0, typeorm_1.UpdateDateColumn)()];
        __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
        __esDecorate(null, null, _bridgeName_decorators, { kind: "field", name: "bridgeName", static: false, private: false, access: { has: obj => "bridgeName" in obj, get: obj => obj.bridgeName, set: (obj, value) => { obj.bridgeName = value; } }, metadata: _metadata }, _bridgeName_initializers, _bridgeName_extraInitializers);
        __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
        __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
        __esDecorate(null, null, _totalAttempts_decorators, { kind: "field", name: "totalAttempts", static: false, private: false, access: { has: obj => "totalAttempts" in obj, get: obj => obj.totalAttempts, set: (obj, value) => { obj.totalAttempts = value; } }, metadata: _metadata }, _totalAttempts_initializers, _totalAttempts_extraInitializers);
        __esDecorate(null, null, _successfulTransfers_decorators, { kind: "field", name: "successfulTransfers", static: false, private: false, access: { has: obj => "successfulTransfers" in obj, get: obj => obj.successfulTransfers, set: (obj, value) => { obj.successfulTransfers = value; } }, metadata: _metadata }, _successfulTransfers_initializers, _successfulTransfers_extraInitializers);
        __esDecorate(null, null, _failedTransfers_decorators, { kind: "field", name: "failedTransfers", static: false, private: false, access: { has: obj => "failedTransfers" in obj, get: obj => obj.failedTransfers, set: (obj, value) => { obj.failedTransfers = value; } }, metadata: _metadata }, _failedTransfers_initializers, _failedTransfers_extraInitializers);
        __esDecorate(null, null, _timeoutCount_decorators, { kind: "field", name: "timeoutCount", static: false, private: false, access: { has: obj => "timeoutCount" in obj, get: obj => obj.timeoutCount, set: (obj, value) => { obj.timeoutCount = value; } }, metadata: _metadata }, _timeoutCount_initializers, _timeoutCount_extraInitializers);
        __esDecorate(null, null, _reliabilityPercent_decorators, { kind: "field", name: "reliabilityPercent", static: false, private: false, access: { has: obj => "reliabilityPercent" in obj, get: obj => obj.reliabilityPercent, set: (obj, value) => { obj.reliabilityPercent = value; } }, metadata: _metadata }, _reliabilityPercent_initializers, _reliabilityPercent_extraInitializers);
        __esDecorate(null, null, _reliabilityScore_decorators, { kind: "field", name: "reliabilityScore", static: false, private: false, access: { has: obj => "reliabilityScore" in obj, get: obj => obj.reliabilityScore, set: (obj, value) => { obj.reliabilityScore = value; } }, metadata: _metadata }, _reliabilityScore_initializers, _reliabilityScore_extraInitializers);
        __esDecorate(null, null, _reliabilityTier_decorators, { kind: "field", name: "reliabilityTier", static: false, private: false, access: { has: obj => "reliabilityTier" in obj, get: obj => obj.reliabilityTier, set: (obj, value) => { obj.reliabilityTier = value; } }, metadata: _metadata }, _reliabilityTier_initializers, _reliabilityTier_extraInitializers);
        __esDecorate(null, null, _windowConfig_decorators, { kind: "field", name: "windowConfig", static: false, private: false, access: { has: obj => "windowConfig" in obj, get: obj => obj.windowConfig, set: (obj, value) => { obj.windowConfig = value; } }, metadata: _metadata }, _windowConfig_initializers, _windowConfig_extraInitializers);
        __esDecorate(null, null, _lastComputedAt_decorators, { kind: "field", name: "lastComputedAt", static: false, private: false, access: { has: obj => "lastComputedAt" in obj, get: obj => obj.lastComputedAt, set: (obj, value) => { obj.lastComputedAt = value; } }, metadata: _metadata }, _lastComputedAt_initializers, _lastComputedAt_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        BridgeReliabilityMetric = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return BridgeReliabilityMetric = _classThis;
})();
exports.BridgeReliabilityMetric = BridgeReliabilityMetric;
//# sourceMappingURL=bridge-reliability-metric.entity.js.map