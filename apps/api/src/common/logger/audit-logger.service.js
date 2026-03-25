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
exports.AuditLoggerService = exports.AuditEventType = void 0;
const common_1 = require("@nestjs/common");
var AuditEventType;
(function (AuditEventType) {
    AuditEventType["ROUTE_SELECTION"] = "ROUTE_SELECTION";
    AuditEventType["ROUTE_EXECUTION"] = "ROUTE_EXECUTION";
    AuditEventType["TRANSACTION_CREATED"] = "TRANSACTION_CREATED";
    AuditEventType["TRANSACTION_UPDATED"] = "TRANSACTION_UPDATED";
    AuditEventType["FEE_ESTIMATION"] = "FEE_ESTIMATION";
    AuditEventType["BRIDGE_TRANSFER"] = "BRIDGE_TRANSFER";
})(AuditEventType || (exports.AuditEventType = AuditEventType = {}));
let AuditLoggerService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var AuditLoggerService = _classThis = class {
        constructor() {
            this.logger = new common_1.Logger('AuditLogger');
        }
        logRouteSelection(data) {
            const entry = {
                eventType: AuditEventType.ROUTE_SELECTION,
                timestamp: new Date().toISOString(),
                requestId: data.requestId,
                metadata: {
                    sourceChain: data.sourceChain,
                    destinationChain: data.destinationChain,
                    amount: this.sanitizeAmount(data.amount),
                    selectedAdapter: data.selectedAdapter,
                    routeScore: data.routeScore,
                    alternativeCount: data.alternativeCount,
                },
            };
            this.logger.log(JSON.stringify(entry));
        }
        logRouteExecution(data) {
            const entry = {
                eventType: AuditEventType.ROUTE_EXECUTION,
                timestamp: new Date().toISOString(),
                requestId: data.requestId,
                metadata: {
                    transactionId: data.transactionId,
                    adapter: data.adapter,
                    sourceChain: data.sourceChain,
                    destinationChain: data.destinationChain,
                    status: data.status,
                    executionTimeMs: data.executionTimeMs,
                },
            };
            this.logger.log(JSON.stringify(entry));
        }
        logTransactionCreated(data) {
            const entry = {
                eventType: AuditEventType.TRANSACTION_CREATED,
                timestamp: new Date().toISOString(),
                requestId: data.requestId,
                metadata: {
                    transactionId: data.transactionId,
                    type: data.type,
                    totalSteps: data.totalSteps,
                },
            };
            this.logger.log(JSON.stringify(entry));
        }
        logTransactionUpdated(data) {
            const entry = {
                eventType: AuditEventType.TRANSACTION_UPDATED,
                timestamp: new Date().toISOString(),
                requestId: data.requestId,
                metadata: {
                    transactionId: data.transactionId,
                    previousStatus: data.previousStatus,
                    newStatus: data.newStatus,
                    currentStep: data.currentStep,
                },
            };
            this.logger.log(JSON.stringify(entry));
        }
        logFeeEstimation(data) {
            const entry = {
                eventType: AuditEventType.FEE_ESTIMATION,
                timestamp: new Date().toISOString(),
                requestId: data.requestId,
                metadata: {
                    adapter: data.adapter,
                    sourceChain: data.sourceChain,
                    destinationChain: data.destinationChain,
                    estimatedFee: this.sanitizeAmount(data.estimatedFee),
                    responseTimeMs: data.responseTimeMs,
                },
            };
            this.logger.log(JSON.stringify(entry));
        }
        logBridgeTransfer(data) {
            const entry = {
                eventType: AuditEventType.BRIDGE_TRANSFER,
                timestamp: new Date().toISOString(),
                requestId: data.requestId,
                metadata: {
                    transactionId: data.transactionId,
                    adapter: data.adapter,
                    txHash: data.txHash ? this.sanitizeTxHash(data.txHash) : undefined,
                    status: data.status,
                    errorCode: data.errorCode,
                },
            };
            this.logger.log(JSON.stringify(entry));
        }
        sanitizeAmount(amount) {
            // Only log first 4 and last 4 characters for large amounts
            if (amount.length > 12) {
                return `${amount.slice(0, 4)}...${amount.slice(-4)}`;
            }
            return amount;
        }
        sanitizeTxHash(hash) {
            // Only log first 8 and last 8 characters of transaction hash
            if (hash.length > 20) {
                return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
            }
            return hash;
        }
    };
    __setFunctionName(_classThis, "AuditLoggerService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        AuditLoggerService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return AuditLoggerService = _classThis;
})();
exports.AuditLoggerService = AuditLoggerService;
//# sourceMappingURL=audit-logger.service.js.map