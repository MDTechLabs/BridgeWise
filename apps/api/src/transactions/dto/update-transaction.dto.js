"use strict";
// import { PartialType } from '@nestjs/mapped-types';
// import { CreateTransactionDto } from './create-transaction.dto';
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
exports.UpdateTransactionDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const transaction_entity_1 = require("../entities/transaction.entity");
// export class UpdateTransactionDto extends PartialType(CreateTransactionDto) {}
let UpdateTransactionDto = (() => {
    var _a;
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    let _state_decorators;
    let _state_initializers = [];
    let _state_extraInitializers = [];
    let _currentStep_decorators;
    let _currentStep_initializers = [];
    let _currentStep_extraInitializers = [];
    let _error_decorators;
    let _error_initializers = [];
    let _error_extraInitializers = [];
    return _a = class UpdateTransactionDto {
            constructor() {
                this.status = __runInitializers(this, _status_initializers, void 0);
                this.state = (__runInitializers(this, _status_extraInitializers), __runInitializers(this, _state_initializers, void 0));
                this.currentStep = (__runInitializers(this, _state_extraInitializers), __runInitializers(this, _currentStep_initializers, void 0));
                this.error = (__runInitializers(this, _currentStep_extraInitializers), __runInitializers(this, _error_initializers, void 0));
                __runInitializers(this, _error_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _status_decorators = [(0, swagger_1.ApiProperty)({
                    enum: transaction_entity_1.TransactionStatus,
                    description: 'Updated transaction status',
                    required: false,
                    example: 'completed',
                }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsEnum)(transaction_entity_1.TransactionStatus)];
            _state_decorators = [(0, swagger_1.ApiProperty)({
                    type: Object,
                    description: 'Updated internal state object. Typically contains boolean flags for transaction milestones (validated, submitted, confirmed).',
                    required: false,
                    example: {
                        validated: true,
                        submitted: true,
                        confirmed: true,
                    },
                }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsObject)()];
            _currentStep_decorators = [(0, swagger_1.ApiProperty)({
                    type: Number,
                    description: 'Current step number in the transaction workflow. Should be incremented as transaction progresses.',
                    required: false,
                    example: 2,
                    minimum: 0,
                }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsNumber)()];
            _error_decorators = [(0, swagger_1.ApiProperty)({
                    type: String,
                    description: 'Error message if transaction has failed. Populated when status is "failed" or "error".',
                    required: false,
                    example: 'Insufficient balance for transaction',
                }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
            __esDecorate(null, null, _state_decorators, { kind: "field", name: "state", static: false, private: false, access: { has: obj => "state" in obj, get: obj => obj.state, set: (obj, value) => { obj.state = value; } }, metadata: _metadata }, _state_initializers, _state_extraInitializers);
            __esDecorate(null, null, _currentStep_decorators, { kind: "field", name: "currentStep", static: false, private: false, access: { has: obj => "currentStep" in obj, get: obj => obj.currentStep, set: (obj, value) => { obj.currentStep = value; } }, metadata: _metadata }, _currentStep_initializers, _currentStep_extraInitializers);
            __esDecorate(null, null, _error_decorators, { kind: "field", name: "error", static: false, private: false, access: { has: obj => "error" in obj, get: obj => obj.error, set: (obj, value) => { obj.error = value; } }, metadata: _metadata }, _error_initializers, _error_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.UpdateTransactionDto = UpdateTransactionDto;
//# sourceMappingURL=update-transaction.dto.js.map