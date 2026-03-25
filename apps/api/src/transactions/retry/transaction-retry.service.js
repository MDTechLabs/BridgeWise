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
exports.TransactionRetryService = void 0;
const common_1 = require("@nestjs/common");
const transaction_entity_1 = require("../entities/transaction.entity");
let TransactionRetryService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var TransactionRetryService = _classThis = class {
        constructor(transactionService) {
            this.transactionService = transactionService;
            this.retryLogs = [];
            this.retryPolicy = {
                maxRetries: 3,
                backoffMs: 1000,
                backoffStrategy: 'exponential',
            };
        }
        setPolicy(policy) {
            this.retryPolicy = { ...this.retryPolicy, ...policy };
        }
        async retryTransaction(transaction) {
            if (!this.isSafeToRetry(transaction))
                return null;
            let attempt = 0;
            let lastError = '';
            while (attempt < this.retryPolicy.maxRetries) {
                try {
                    // Custom retry logic: re-execute transaction
                    const updated = await this.transactionService.update(transaction.id, {
                        status: transaction_entity_1.TransactionStatus.IN_PROGRESS,
                    });
                    // Simulate execution (replace with actual execution logic)
                    // If successful:
                    return updated;
                }
                catch (err) {
                    lastError = err.message || String(err);
                    this.logRetryAttempt(transaction.id, attempt + 1, lastError);
                    attempt++;
                    await this.backoff(attempt);
                }
            }
            // Mark as failed after max retries
            await this.transactionService.markFailed(transaction.id, lastError);
            return null;
        }
        isSafeToRetry(transaction) {
            // Only retry if status is FAILED and not completed
            return (transaction.status === transaction_entity_1.TransactionStatus.FAILED &&
                !transaction.completedAt);
        }
        logRetryAttempt(transactionId, attempt, error) {
            this.retryLogs.push({
                transactionId,
                attempt,
                error,
                timestamp: new Date(),
            });
            // TODO: Integrate with analytics collector
        }
        async backoff(attempt) {
            let ms = this.retryPolicy.backoffMs;
            if (this.retryPolicy.backoffStrategy === 'exponential') {
                ms = ms * Math.pow(2, attempt - 1);
            }
            return new Promise((resolve) => setTimeout(resolve, ms));
        }
        getRetryLogs(transactionId) {
            if (!transactionId)
                return this.retryLogs;
            return this.retryLogs.filter((log) => log.transactionId === transactionId);
        }
    };
    __setFunctionName(_classThis, "TransactionRetryService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        TransactionRetryService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return TransactionRetryService = _classThis;
})();
exports.TransactionRetryService = TransactionRetryService;
//# sourceMappingURL=transaction-retry.service.js.map