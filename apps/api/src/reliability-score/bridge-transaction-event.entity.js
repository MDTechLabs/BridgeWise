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
exports.BridgeTransactionEvent = void 0;
const typeorm_1 = require("typeorm");
const reliability_enum_1 = require("./reliability.enum");
let BridgeTransactionEvent = (() => {
    let _classDecorators = [(0, typeorm_1.Entity)('bridge_transaction_events'), (0, typeorm_1.Index)(['bridgeName', 'sourceChain', 'destinationChain', 'createdAt'])];
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
    let _createdAt_decorators;
    let _createdAt_initializers = [];
    let _createdAt_extraInitializers = [];
    var BridgeTransactionEvent = _classThis = class {
        constructor() {
            this.id = __runInitializers(this, _id_initializers, void 0);
            this.bridgeName = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _bridgeName_initializers, void 0));
            this.sourceChain = (__runInitializers(this, _bridgeName_extraInitializers), __runInitializers(this, _sourceChain_initializers, void 0));
            this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
            this.outcome = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _outcome_initializers, void 0));
            this.transactionHash = (__runInitializers(this, _outcome_extraInitializers), __runInitializers(this, _transactionHash_initializers, void 0));
            this.failureReason = (__runInitializers(this, _transactionHash_extraInitializers), __runInitializers(this, _failureReason_initializers, void 0));
            this.durationMs = (__runInitializers(this, _failureReason_extraInitializers), __runInitializers(this, _durationMs_initializers, void 0));
            this.createdAt = (__runInitializers(this, _durationMs_extraInitializers), __runInitializers(this, _createdAt_initializers, void 0));
            __runInitializers(this, _createdAt_extraInitializers);
        }
    };
    __setFunctionName(_classThis, "BridgeTransactionEvent");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _id_decorators = [(0, typeorm_1.PrimaryGeneratedColumn)('uuid')];
        _bridgeName_decorators = [(0, typeorm_1.Column)({ length: 100 }), (0, typeorm_1.Index)()];
        _sourceChain_decorators = [(0, typeorm_1.Column)({ length: 50 })];
        _destinationChain_decorators = [(0, typeorm_1.Column)({ length: 50 })];
        _outcome_decorators = [(0, typeorm_1.Column)({ type: 'enum', enum: reliability_enum_1.TransactionOutcome })];
        _transactionHash_decorators = [(0, typeorm_1.Column)({ nullable: true, type: 'varchar', length: 255 })];
        _failureReason_decorators = [(0, typeorm_1.Column)({ nullable: true, type: 'text' })];
        _durationMs_decorators = [(0, typeorm_1.Column)({ type: 'int', default: 0, comment: 'ms to settlement or timeout' })];
        _createdAt_decorators = [(0, typeorm_1.CreateDateColumn)()];
        __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
        __esDecorate(null, null, _bridgeName_decorators, { kind: "field", name: "bridgeName", static: false, private: false, access: { has: obj => "bridgeName" in obj, get: obj => obj.bridgeName, set: (obj, value) => { obj.bridgeName = value; } }, metadata: _metadata }, _bridgeName_initializers, _bridgeName_extraInitializers);
        __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
        __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
        __esDecorate(null, null, _outcome_decorators, { kind: "field", name: "outcome", static: false, private: false, access: { has: obj => "outcome" in obj, get: obj => obj.outcome, set: (obj, value) => { obj.outcome = value; } }, metadata: _metadata }, _outcome_initializers, _outcome_extraInitializers);
        __esDecorate(null, null, _transactionHash_decorators, { kind: "field", name: "transactionHash", static: false, private: false, access: { has: obj => "transactionHash" in obj, get: obj => obj.transactionHash, set: (obj, value) => { obj.transactionHash = value; } }, metadata: _metadata }, _transactionHash_initializers, _transactionHash_extraInitializers);
        __esDecorate(null, null, _failureReason_decorators, { kind: "field", name: "failureReason", static: false, private: false, access: { has: obj => "failureReason" in obj, get: obj => obj.failureReason, set: (obj, value) => { obj.failureReason = value; } }, metadata: _metadata }, _failureReason_initializers, _failureReason_extraInitializers);
        __esDecorate(null, null, _durationMs_decorators, { kind: "field", name: "durationMs", static: false, private: false, access: { has: obj => "durationMs" in obj, get: obj => obj.durationMs, set: (obj, value) => { obj.durationMs = value; } }, metadata: _metadata }, _durationMs_initializers, _durationMs_extraInitializers);
        __esDecorate(null, null, _createdAt_decorators, { kind: "field", name: "createdAt", static: false, private: false, access: { has: obj => "createdAt" in obj, get: obj => obj.createdAt, set: (obj, value) => { obj.createdAt = value; } }, metadata: _metadata }, _createdAt_initializers, _createdAt_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        BridgeTransactionEvent = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return BridgeTransactionEvent = _classThis;
})();
exports.BridgeTransactionEvent = BridgeTransactionEvent;
//# sourceMappingURL=bridge-transaction-event.entity.js.map