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
exports.BridgeBenchmark = exports.ChainType = exports.TransactionStatus = void 0;
const typeorm_1 = require("typeorm");
var TransactionStatus;
(function (TransactionStatus) {
    TransactionStatus["PENDING"] = "pending";
    TransactionStatus["SUBMITTED"] = "submitted";
    TransactionStatus["CONFIRMED"] = "confirmed";
    TransactionStatus["FAILED"] = "failed";
})(TransactionStatus || (exports.TransactionStatus = TransactionStatus = {}));
var ChainType;
(function (ChainType) {
    ChainType["EVM"] = "evm";
    ChainType["STELLAR"] = "stellar";
})(ChainType || (exports.ChainType = ChainType = {}));
let BridgeBenchmark = (() => {
    let _classDecorators = [(0, typeorm_1.Entity)('bridge_benchmarks'), (0, typeorm_1.Index)(['bridgeName', 'sourceChain', 'destinationChain'])];
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
    let _sourceChainType_decorators;
    let _sourceChainType_initializers = [];
    let _sourceChainType_extraInitializers = [];
    let _destinationChainType_decorators;
    let _destinationChainType_initializers = [];
    let _destinationChainType_extraInitializers = [];
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    let _transactionHash_decorators;
    let _transactionHash_initializers = [];
    let _transactionHash_extraInitializers = [];
    let _destinationTxHash_decorators;
    let _destinationTxHash_initializers = [];
    let _destinationTxHash_extraInitializers = [];
    let _quoteRequestedAt_decorators;
    let _quoteRequestedAt_initializers = [];
    let _quoteRequestedAt_extraInitializers = [];
    let _startTime_decorators;
    let _startTime_initializers = [];
    let _startTime_extraInitializers = [];
    let _destinationConfirmedAt_decorators;
    let _destinationConfirmedAt_initializers = [];
    let _destinationConfirmedAt_extraInitializers = [];
    let _completionTime_decorators;
    let _completionTime_initializers = [];
    let _completionTime_extraInitializers = [];
    let _durationMs_decorators;
    let _durationMs_initializers = [];
    let _durationMs_extraInitializers = [];
    let _amount_decorators;
    let _amount_initializers = [];
    let _amount_extraInitializers = [];
    let _createdAt_decorators;
    let _createdAt_initializers = [];
    let _createdAt_extraInitializers = [];
    var BridgeBenchmark = _classThis = class {
        constructor() {
            this.id = __runInitializers(this, _id_initializers, void 0);
            this.bridgeName = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _bridgeName_initializers, void 0));
            this.sourceChain = (__runInitializers(this, _bridgeName_extraInitializers), __runInitializers(this, _sourceChain_initializers, void 0));
            this.destinationChain = (__runInitializers(this, _sourceChain_extraInitializers), __runInitializers(this, _destinationChain_initializers, void 0));
            this.token = (__runInitializers(this, _destinationChain_extraInitializers), __runInitializers(this, _token_initializers, void 0));
            this.sourceChainType = (__runInitializers(this, _token_extraInitializers), __runInitializers(this, _sourceChainType_initializers, void 0));
            this.destinationChainType = (__runInitializers(this, _sourceChainType_extraInitializers), __runInitializers(this, _destinationChainType_initializers, void 0));
            this.status = (__runInitializers(this, _destinationChainType_extraInitializers), __runInitializers(this, _status_initializers, void 0));
            this.transactionHash = (__runInitializers(this, _status_extraInitializers), __runInitializers(this, _transactionHash_initializers, void 0));
            this.destinationTxHash = (__runInitializers(this, _transactionHash_extraInitializers), __runInitializers(this, _destinationTxHash_initializers, void 0));
            this.quoteRequestedAt = (__runInitializers(this, _destinationTxHash_extraInitializers), __runInitializers(this, _quoteRequestedAt_initializers, void 0));
            this.startTime = (__runInitializers(this, _quoteRequestedAt_extraInitializers), __runInitializers(this, _startTime_initializers, void 0));
            this.destinationConfirmedAt = (__runInitializers(this, _startTime_extraInitializers), __runInitializers(this, _destinationConfirmedAt_initializers, void 0));
            this.completionTime = (__runInitializers(this, _destinationConfirmedAt_extraInitializers), __runInitializers(this, _completionTime_initializers, void 0));
            this.durationMs = (__runInitializers(this, _completionTime_extraInitializers), __runInitializers(this, _durationMs_initializers, void 0));
            this.amount = (__runInitializers(this, _durationMs_extraInitializers), __runInitializers(this, _amount_initializers, void 0));
            this.createdAt = (__runInitializers(this, _amount_extraInitializers), __runInitializers(this, _createdAt_initializers, void 0));
            __runInitializers(this, _createdAt_extraInitializers);
        }
    };
    __setFunctionName(_classThis, "BridgeBenchmark");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _id_decorators = [(0, typeorm_1.PrimaryGeneratedColumn)('uuid')];
        _bridgeName_decorators = [(0, typeorm_1.Column)({ name: 'bridge_name' })];
        _sourceChain_decorators = [(0, typeorm_1.Column)({ name: 'source_chain' })];
        _destinationChain_decorators = [(0, typeorm_1.Column)({ name: 'destination_chain' })];
        _token_decorators = [(0, typeorm_1.Column)()];
        _sourceChainType_decorators = [(0, typeorm_1.Column)({
                name: 'source_chain_type',
                type: 'enum',
                enum: ChainType,
                default: ChainType.EVM,
            })];
        _destinationChainType_decorators = [(0, typeorm_1.Column)({
                name: 'destination_chain_type',
                type: 'enum',
                enum: ChainType,
                default: ChainType.EVM,
            })];
        _status_decorators = [(0, typeorm_1.Column)({
                type: 'enum',
                enum: TransactionStatus,
                default: TransactionStatus.PENDING,
            })];
        _transactionHash_decorators = [(0, typeorm_1.Column)({ name: 'transaction_hash', nullable: true })];
        _destinationTxHash_decorators = [(0, typeorm_1.Column)({ name: 'destination_tx_hash', nullable: true })];
        _quoteRequestedAt_decorators = [(0, typeorm_1.Column)({ name: 'quote_requested_at', type: 'timestamptz', nullable: true })];
        _startTime_decorators = [(0, typeorm_1.Column)({ name: 'start_time', type: 'timestamptz' })];
        _destinationConfirmedAt_decorators = [(0, typeorm_1.Column)({
                name: 'destination_confirmed_at',
                type: 'timestamptz',
                nullable: true,
            })];
        _completionTime_decorators = [(0, typeorm_1.Column)({ name: 'completion_time', type: 'timestamptz', nullable: true })];
        _durationMs_decorators = [(0, typeorm_1.Column)({ name: 'duration_ms', type: 'bigint', nullable: true })];
        _amount_decorators = [(0, typeorm_1.Column)({
                name: 'amount',
                type: 'decimal',
                precision: 30,
                scale: 10,
                nullable: true,
            })];
        _createdAt_decorators = [(0, typeorm_1.CreateDateColumn)({ name: 'created_at' })];
        __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
        __esDecorate(null, null, _bridgeName_decorators, { kind: "field", name: "bridgeName", static: false, private: false, access: { has: obj => "bridgeName" in obj, get: obj => obj.bridgeName, set: (obj, value) => { obj.bridgeName = value; } }, metadata: _metadata }, _bridgeName_initializers, _bridgeName_extraInitializers);
        __esDecorate(null, null, _sourceChain_decorators, { kind: "field", name: "sourceChain", static: false, private: false, access: { has: obj => "sourceChain" in obj, get: obj => obj.sourceChain, set: (obj, value) => { obj.sourceChain = value; } }, metadata: _metadata }, _sourceChain_initializers, _sourceChain_extraInitializers);
        __esDecorate(null, null, _destinationChain_decorators, { kind: "field", name: "destinationChain", static: false, private: false, access: { has: obj => "destinationChain" in obj, get: obj => obj.destinationChain, set: (obj, value) => { obj.destinationChain = value; } }, metadata: _metadata }, _destinationChain_initializers, _destinationChain_extraInitializers);
        __esDecorate(null, null, _token_decorators, { kind: "field", name: "token", static: false, private: false, access: { has: obj => "token" in obj, get: obj => obj.token, set: (obj, value) => { obj.token = value; } }, metadata: _metadata }, _token_initializers, _token_extraInitializers);
        __esDecorate(null, null, _sourceChainType_decorators, { kind: "field", name: "sourceChainType", static: false, private: false, access: { has: obj => "sourceChainType" in obj, get: obj => obj.sourceChainType, set: (obj, value) => { obj.sourceChainType = value; } }, metadata: _metadata }, _sourceChainType_initializers, _sourceChainType_extraInitializers);
        __esDecorate(null, null, _destinationChainType_decorators, { kind: "field", name: "destinationChainType", static: false, private: false, access: { has: obj => "destinationChainType" in obj, get: obj => obj.destinationChainType, set: (obj, value) => { obj.destinationChainType = value; } }, metadata: _metadata }, _destinationChainType_initializers, _destinationChainType_extraInitializers);
        __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
        __esDecorate(null, null, _transactionHash_decorators, { kind: "field", name: "transactionHash", static: false, private: false, access: { has: obj => "transactionHash" in obj, get: obj => obj.transactionHash, set: (obj, value) => { obj.transactionHash = value; } }, metadata: _metadata }, _transactionHash_initializers, _transactionHash_extraInitializers);
        __esDecorate(null, null, _destinationTxHash_decorators, { kind: "field", name: "destinationTxHash", static: false, private: false, access: { has: obj => "destinationTxHash" in obj, get: obj => obj.destinationTxHash, set: (obj, value) => { obj.destinationTxHash = value; } }, metadata: _metadata }, _destinationTxHash_initializers, _destinationTxHash_extraInitializers);
        __esDecorate(null, null, _quoteRequestedAt_decorators, { kind: "field", name: "quoteRequestedAt", static: false, private: false, access: { has: obj => "quoteRequestedAt" in obj, get: obj => obj.quoteRequestedAt, set: (obj, value) => { obj.quoteRequestedAt = value; } }, metadata: _metadata }, _quoteRequestedAt_initializers, _quoteRequestedAt_extraInitializers);
        __esDecorate(null, null, _startTime_decorators, { kind: "field", name: "startTime", static: false, private: false, access: { has: obj => "startTime" in obj, get: obj => obj.startTime, set: (obj, value) => { obj.startTime = value; } }, metadata: _metadata }, _startTime_initializers, _startTime_extraInitializers);
        __esDecorate(null, null, _destinationConfirmedAt_decorators, { kind: "field", name: "destinationConfirmedAt", static: false, private: false, access: { has: obj => "destinationConfirmedAt" in obj, get: obj => obj.destinationConfirmedAt, set: (obj, value) => { obj.destinationConfirmedAt = value; } }, metadata: _metadata }, _destinationConfirmedAt_initializers, _destinationConfirmedAt_extraInitializers);
        __esDecorate(null, null, _completionTime_decorators, { kind: "field", name: "completionTime", static: false, private: false, access: { has: obj => "completionTime" in obj, get: obj => obj.completionTime, set: (obj, value) => { obj.completionTime = value; } }, metadata: _metadata }, _completionTime_initializers, _completionTime_extraInitializers);
        __esDecorate(null, null, _durationMs_decorators, { kind: "field", name: "durationMs", static: false, private: false, access: { has: obj => "durationMs" in obj, get: obj => obj.durationMs, set: (obj, value) => { obj.durationMs = value; } }, metadata: _metadata }, _durationMs_initializers, _durationMs_extraInitializers);
        __esDecorate(null, null, _amount_decorators, { kind: "field", name: "amount", static: false, private: false, access: { has: obj => "amount" in obj, get: obj => obj.amount, set: (obj, value) => { obj.amount = value; } }, metadata: _metadata }, _amount_initializers, _amount_extraInitializers);
        __esDecorate(null, null, _createdAt_decorators, { kind: "field", name: "createdAt", static: false, private: false, access: { has: obj => "createdAt" in obj, get: obj => obj.createdAt, set: (obj, value) => { obj.createdAt = value; } }, metadata: _metadata }, _createdAt_initializers, _createdAt_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        BridgeBenchmark = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return BridgeBenchmark = _classThis;
})();
exports.BridgeBenchmark = BridgeBenchmark;
//# sourceMappingURL=bridge-benchmark.entity.js.map