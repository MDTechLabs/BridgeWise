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
exports.ReliabilityService = void 0;
const common_1 = require("@nestjs/common");
let ReliabilityService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ReliabilityService = _classThis = class {
        constructor() {
            this.logger = new common_1.Logger(ReliabilityService.name);
            // Weights for composite reliability score
            this.WEIGHTS = {
                uptime: 0.35,
                successRate: 0.4,
                delayPenalty: 0.15,
                incidentPenalty: 0.1,
            };
            // Simulated historical metrics — in production, fetched from monitoring DB
            this.MOCK_METRICS = {
                stargate: {
                    uptime24h: 99.8,
                    successRate7d: 98.5,
                    avgDelayPercent: 5,
                    incidentCount30d: 1,
                    reliabilityScore: 0,
                },
                squid: {
                    uptime24h: 99.5,
                    successRate7d: 97.2,
                    avgDelayPercent: 12,
                    incidentCount30d: 2,
                    reliabilityScore: 0,
                },
                hop: {
                    uptime24h: 98.9,
                    successRate7d: 96.8,
                    avgDelayPercent: 8,
                    incidentCount30d: 3,
                    reliabilityScore: 0,
                },
                cbridge: {
                    uptime24h: 99.1,
                    successRate7d: 97.5,
                    avgDelayPercent: 10,
                    incidentCount30d: 2,
                    reliabilityScore: 0,
                },
                soroswap: {
                    uptime24h: 97.5,
                    successRate7d: 95.0,
                    avgDelayPercent: 15,
                    incidentCount30d: 5,
                    reliabilityScore: 0,
                },
            };
        }
        /**
         * Calculate a 0-100 reliability score for a bridge provider.
         */
        calculateReliabilityScore(bridgeId) {
            const metrics = this.MOCK_METRICS[bridgeId.toLowerCase()];
            if (!metrics) {
                this.logger.warn(`No reliability metrics for bridge: ${bridgeId}, using default score`);
                return 70; // conservative default
            }
            const score = this.computeScore(metrics);
            this.logger.debug(`Reliability score for ${bridgeId}: ${score}`);
            return score;
        }
        /**
         * Get full reliability metrics for a bridge.
         */
        getMetrics(bridgeId) {
            const metrics = this.MOCK_METRICS[bridgeId.toLowerCase()];
            if (!metrics) {
                return {
                    uptime24h: 0,
                    successRate7d: 0,
                    avgDelayPercent: 100,
                    incidentCount30d: 99,
                    reliabilityScore: 50,
                };
            }
            return { ...metrics, reliabilityScore: this.computeScore(metrics) };
        }
        /**
         * Batch compute scores for multiple bridges.
         */
        batchCalculateScores(bridgeIds) {
            const results = new Map();
            for (const id of bridgeIds) {
                results.set(id, this.calculateReliabilityScore(id));
            }
            return results;
        }
        computeScore(metrics) {
            const uptimeScore = metrics.uptime24h; // 0-100
            const successScore = metrics.successRate7d; // 0-100
            const delayScore = Math.max(0, 100 - metrics.avgDelayPercent * 2); // penalize delays
            const incidentScore = Math.max(0, 100 - metrics.incidentCount30d * 5); // penalize incidents
            const composite = uptimeScore * this.WEIGHTS.uptime +
                successScore * this.WEIGHTS.successRate +
                delayScore * this.WEIGHTS.delayPenalty +
                incidentScore * this.WEIGHTS.incidentPenalty;
            return parseFloat(Math.min(100, Math.max(0, composite)).toFixed(2));
        }
    };
    __setFunctionName(_classThis, "ReliabilityService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ReliabilityService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ReliabilityService = _classThis;
})();
exports.ReliabilityService = ReliabilityService;
//# sourceMappingURL=reliability.service.js.map