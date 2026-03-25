"use strict";
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
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
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsCollector = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
/**
 * Analytics Collector
 *
 * Listens to transaction and benchmark events to update analytics in real-time.
 * Integrates with the existing EventEmitter2 system.
 */
let AnalyticsCollector = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _handleTransactionUpdate_decorators;
    let _handleBenchmarkCompleted_decorators;
    let _handleSlippageAlert_decorators;
    var AnalyticsCollector = _classThis = class {
        constructor(analyticsService, eventEmitter) {
            this.analyticsService = (__runInitializers(this, _instanceExtraInitializers), analyticsService);
            this.eventEmitter = eventEmitter;
            this.logger = new common_1.Logger(AnalyticsCollector.name);
            this.batchQueue = [];
            this.batchTimeout = null;
            this.BATCH_SIZE = 100;
            this.BATCH_INTERVAL_MS = 5000; // 5 seconds
        }
        onModuleInit() {
            this.logger.log('AnalyticsCollector initialized');
        }
        /**
         * Listen for transaction updates
         */
        async handleTransactionUpdate(event) {
            this.logger.debug(`Received transaction update: ${event.id} - ${event.status}`);
            // Only process completed or failed transactions
            if (event.status !== 'completed' && event.status !== 'failed') {
                return;
            }
            const payload = this.buildPayloadFromTransaction(event);
            if (payload) {
                await this.processUpdate(payload);
            }
        }
        /**
         * Listen for benchmark completion events
         */
        async handleBenchmarkCompleted(event) {
            this.logger.debug(`Received benchmark completion: ${event.id}`);
            const payload = {
                route: {
                    bridgeName: event.bridgeName,
                    sourceChain: event.sourceChain,
                    destinationChain: event.destinationChain,
                    token: event.token,
                },
                settlementTimeMs: event.durationMs,
                fee: event.fee,
                slippagePercent: event.slippagePercent,
                volume: event.amount,
                status: event.status === 'confirmed' ? 'success' : 'failed',
                timestamp: event.completedAt,
            };
            await this.processUpdate(payload);
        }
        /**
         * Listen for slippage alert events
         */
        async handleSlippageAlert(event) {
            this.logger.debug(`Received slippage alert: ${event.bridge} - ${event.slippage}%`);
            // Could track high slippage events separately for alerting
        }
        /**
         * Process a single analytics update
         */
        async processUpdate(payload) {
            // Add to batch queue
            this.batchQueue.push(payload);
            // Process immediately if batch size reached
            if (this.batchQueue.length >= this.BATCH_SIZE) {
                await this.flushBatch();
            }
            else {
                // Schedule batch flush
                this.scheduleBatchFlush();
            }
        }
        /**
         * Schedule a batch flush
         */
        scheduleBatchFlush() {
            if (this.batchTimeout) {
                return; // Already scheduled
            }
            this.batchTimeout = setTimeout(() => {
                this.flushBatch();
            }, this.BATCH_INTERVAL_MS);
        }
        /**
         * Flush the batch queue
         */
        async flushBatch() {
            if (this.batchQueue.length === 0) {
                return;
            }
            // Clear timeout if exists
            if (this.batchTimeout) {
                clearTimeout(this.batchTimeout);
                this.batchTimeout = null;
            }
            // Get current batch and clear queue
            const batch = [...this.batchQueue];
            this.batchQueue = [];
            this.logger.debug(`Flushing analytics batch: ${batch.length} updates`);
            // Process each update
            for (const payload of batch) {
                try {
                    await this.analyticsService.updateAnalytics(payload);
                }
                catch (error) {
                    this.logger.error(`Failed to update analytics for ${payload.route.bridgeName}: ${error.message}`, error.stack);
                }
            }
            this.logger.debug(`Batch flush complete: ${batch.length} updates processed`);
        }
        /**
         * Build analytics payload from transaction event
         */
        buildPayloadFromTransaction(event) {
            // Extract route information from metadata
            const metadata = event.metadata || {};
            const state = event.state || {};
            const bridgeName = metadata.bridge ||
                metadata.bridgeName ||
                state.bridge;
            const sourceChain = metadata.sourceChain ||
                metadata.fromChain ||
                state.sourceChain;
            const destinationChain = metadata.destinationChain ||
                metadata.toChain ||
                state.destinationChain;
            const token = metadata.token || state.token;
            if (!bridgeName || !sourceChain || !destinationChain) {
                this.logger.warn(`Cannot build analytics payload: missing route info for transaction ${event.id}`);
                return null;
            }
            // Calculate settlement time if available
            let settlementTimeMs;
            if (event.completedAt && event.createdAt) {
                settlementTimeMs =
                    new Date(event.completedAt).getTime() -
                        new Date(event.createdAt).getTime();
            }
            return {
                route: {
                    bridgeName,
                    sourceChain,
                    destinationChain,
                    token,
                },
                settlementTimeMs,
                fee: state.fee,
                slippagePercent: state.slippage,
                volume: metadata.amount,
                status: event.status === 'completed' ? 'success' : 'failed',
                timestamp: event.completedAt || new Date(),
            };
        }
        /**
         * Force immediate batch flush
         * Useful for graceful shutdown
         */
        async forceFlush() {
            this.logger.log('Forcing analytics batch flush...');
            await this.flushBatch();
        }
        /**
         * Get current batch queue size
         */
        getQueueSize() {
            return this.batchQueue.length;
        }
    };
    __setFunctionName(_classThis, "AnalyticsCollector");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _handleTransactionUpdate_decorators = [(0, event_emitter_1.OnEvent)('transaction.updated')];
        _handleBenchmarkCompleted_decorators = [(0, event_emitter_1.OnEvent)('benchmark.completed')];
        _handleSlippageAlert_decorators = [(0, event_emitter_1.OnEvent)('slippage.alert')];
        __esDecorate(_classThis, null, _handleTransactionUpdate_decorators, { kind: "method", name: "handleTransactionUpdate", static: false, private: false, access: { has: obj => "handleTransactionUpdate" in obj, get: obj => obj.handleTransactionUpdate }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _handleBenchmarkCompleted_decorators, { kind: "method", name: "handleBenchmarkCompleted", static: false, private: false, access: { has: obj => "handleBenchmarkCompleted" in obj, get: obj => obj.handleBenchmarkCompleted }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _handleSlippageAlert_decorators, { kind: "method", name: "handleSlippageAlert", static: false, private: false, access: { has: obj => "handleSlippageAlert" in obj, get: obj => obj.handleSlippageAlert }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        AnalyticsCollector = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return AnalyticsCollector = _classThis;
})();
exports.AnalyticsCollector = AnalyticsCollector;
//# sourceMappingURL=analytics.collector.js.map