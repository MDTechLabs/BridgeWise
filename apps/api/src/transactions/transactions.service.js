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
exports.TransactionService = void 0;
const common_1 = require("@nestjs/common");
const transaction_entity_1 = require("./entities/transaction.entity");
let TransactionService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var TransactionService = _classThis = class {
        constructor(transactionRepo, eventEmitter, auditLogger) {
            this.transactionRepo = transactionRepo;
            this.eventEmitter = eventEmitter;
            this.auditLogger = auditLogger;
        }
        async create(dto) {
            const transaction = this.transactionRepo.create({
                type: dto.type,
                metadata: dto.metadata || {},
                state: {},
                totalSteps: dto.totalSteps || 0,
                status: transaction_entity_1.TransactionStatus.PENDING,
            });
            const saved = await this.transactionRepo.save(transaction);
            this.auditLogger.logTransactionCreated({
                transactionId: saved.id,
                type: saved.type,
                totalSteps: saved.totalSteps,
            });
            this.emitStateChange(saved);
            return saved;
        }
        async findById(id) {
            const transaction = await this.transactionRepo.findOne({ where: { id } });
            if (!transaction) {
                throw new common_1.NotFoundException(`Transaction ${id} not found`);
            }
            return transaction;
        }
        async update(id, dto) {
            const transaction = await this.findById(id);
            const previousStatus = transaction.status;
            if (dto.status)
                transaction.status = dto.status;
            if (dto.state)
                transaction.state = { ...transaction.state, ...dto.state };
            if (dto.currentStep !== undefined)
                transaction.currentStep = dto.currentStep;
            if (dto.error)
                transaction.error = dto.error;
            if (dto.status === transaction_entity_1.TransactionStatus.COMPLETED) {
                transaction.completedAt = new Date();
            }
            const updated = await this.transactionRepo.save(transaction);
            if (dto.status && previousStatus !== dto.status) {
                this.auditLogger.logTransactionUpdated({
                    transactionId: updated.id,
                    previousStatus,
                    newStatus: updated.status,
                    currentStep: updated.currentStep,
                });
            }
            this.emitStateChange(updated);
            return updated;
        }
        async updateState(id, stateUpdate) {
            return this.update(id, { state: stateUpdate });
        }
        async advanceStep(id, stepData) {
            const transaction = await this.findById(id);
            const nextStep = transaction.currentStep + 1;
            const updates = {
                currentStep: nextStep,
                status: transaction_entity_1.TransactionStatus.IN_PROGRESS,
            };
            if (stepData) {
                updates.state = stepData;
            }
            // Check if completed
            if (nextStep >= transaction.totalSteps && transaction.totalSteps > 0) {
                updates.status = transaction_entity_1.TransactionStatus.COMPLETED;
            }
            return this.update(id, updates);
        }
        async markFailed(id, error) {
            return this.update(id, {
                status: transaction_entity_1.TransactionStatus.FAILED,
                error,
            });
        }
        async markPartial(id, error) {
            return this.update(id, {
                status: transaction_entity_1.TransactionStatus.PARTIAL,
                error,
            });
        }
        async getRecentTransactions(limit = 10) {
            return this.transactionRepo.find({
                order: { createdAt: 'DESC' },
                take: limit,
            });
        }
        emitStateChange(transaction) {
            this.eventEmitter.emit('transaction.updated', transaction);
        }
    };
    __setFunctionName(_classThis, "TransactionService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        TransactionService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return TransactionService = _classThis;
})();
exports.TransactionService = TransactionService;
//# sourceMappingURL=transactions.service.js.map