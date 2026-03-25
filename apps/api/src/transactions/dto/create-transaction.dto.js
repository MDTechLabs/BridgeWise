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
exports.CreateTransactionDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
let CreateTransactionDto = (() => {
    var _a;
    let _type_decorators;
    let _type_initializers = [];
    let _type_extraInitializers = [];
    let _metadata_decorators;
    let _metadata_initializers = [];
    let _metadata_extraInitializers = [];
    let _totalSteps_decorators;
    let _totalSteps_initializers = [];
    let _totalSteps_extraInitializers = [];
    return _a = class CreateTransactionDto {
            constructor() {
                this.type = __runInitializers(this, _type_initializers, void 0);
                this.metadata = (__runInitializers(this, _type_extraInitializers), __runInitializers(this, _metadata_initializers, void 0));
                this.totalSteps = (__runInitializers(this, _metadata_extraInitializers), __runInitializers(this, _totalSteps_initializers, void 0));
                __runInitializers(this, _totalSteps_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _type_decorators = [(0, swagger_1.ApiProperty)({
                    type: String,
                    description: 'Type of transaction',
                    enum: [
                        'stellar-payment',
                        'stellar-path-payment',
                        'hop-bridge',
                        'layerzero-omnichain',
                    ],
                    example: 'stellar-payment',
                }), (0, class_validator_1.IsString)()];
            _metadata_decorators = [(0, swagger_1.ApiProperty)({
                    type: Object,
                    description: 'Transaction metadata containing network-specific parameters. Structure varies based on transaction type.',
                    required: false,
                    example: {
                        sourceAccount: 'GCXMWUAUF37IWOABB3GNXFZB7TBBBHL3IJKUSJUWVEKM3CXEGTHUMDSD',
                        destinationAccount: 'GBRPYHIL2CI3WHZSRJQEMQ5CPQIS2TCCQ7OXJGGUFR7XUWVEPSWR47U',
                        amount: '100',
                        asset: 'native',
                        memo: 'Cross-chain transfer',
                    },
                }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsObject)()];
            _totalSteps_decorators = [(0, swagger_1.ApiProperty)({
                    type: Number,
                    description: 'Total number of steps required to complete this transaction. Used for step-by-step transaction advancement.',
                    required: false,
                    example: 3,
                    minimum: 1,
                    maximum: 10,
                }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsNumber)()];
            __esDecorate(null, null, _type_decorators, { kind: "field", name: "type", static: false, private: false, access: { has: obj => "type" in obj, get: obj => obj.type, set: (obj, value) => { obj.type = value; } }, metadata: _metadata }, _type_initializers, _type_extraInitializers);
            __esDecorate(null, null, _metadata_decorators, { kind: "field", name: "metadata", static: false, private: false, access: { has: obj => "metadata" in obj, get: obj => obj.metadata, set: (obj, value) => { obj.metadata = value; } }, metadata: _metadata }, _metadata_initializers, _metadata_extraInitializers);
            __esDecorate(null, null, _totalSteps_decorators, { kind: "field", name: "totalSteps", static: false, private: false, access: { has: obj => "totalSteps" in obj, get: obj => obj.totalSteps, set: (obj, value) => { obj.totalSteps = value; } }, metadata: _metadata }, _totalSteps_initializers, _totalSteps_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.CreateTransactionDto = CreateTransactionDto;
//# sourceMappingURL=create-transaction.dto.js.map