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
exports.BridgeReliabilityService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const reliability_enum_1 = require("./reliability.enum");
const reliability_constants_1 = require("./reliability.constants");
let BridgeReliabilityService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var BridgeReliabilityService = _classThis = class {
        constructor(eventRepo, metricRepo, calculator) {
            this.eventRepo = eventRepo;
            this.metricRepo = metricRepo;
            this.calculator = calculator;
            this.logger = new common_1.Logger(BridgeReliabilityService.name);
        }
        // ─── Record Event ──────────────────────────────────────────────────────────
        async recordEvent(dto) {
            const event = this.eventRepo.create({
                bridgeName: dto.bridgeName,
                sourceChain: dto.sourceChain.toLowerCase(),
                destinationChain: dto.destinationChain.toLowerCase(),
                outcome: dto.outcome,
                transactionHash: dto.transactionHash ?? null,
                failureReason: dto.failureReason ?? null,
                durationMs: dto.durationMs ?? 0,
            });
            const saved = await this.eventRepo.save(event);
            this.logger.log(`Recorded ${dto.outcome} event for ${dto.bridgeName} [${dto.sourceChain} → ${dto.destinationChain}]`);
            // Invalidate cached metric so next query recalculates
            await this.invalidateCachedMetric(dto.bridgeName, dto.sourceChain, dto.destinationChain);
            return saved;
        }
        // ─── Rolling Window Queries ────────────────────────────────────────────────
        async getRollingCounts(bridgeName, sourceChain, destinationChain, windowMode, windowSize) {
            const baseWhere = {
                bridgeName,
                sourceChain: sourceChain.toLowerCase(),
                destinationChain: destinationChain.toLowerCase(),
            };
            // Exclude cancelled transactions
            const excludedOutcomes = [reliability_enum_1.TransactionOutcome.CANCELLED];
            if (windowMode === reliability_enum_1.WindowMode.TIME_BASED) {
                const since = new Date();
                since.setDate(since.getDate() - windowSize);
                const events = await this.eventRepo.find({
                    where: {
                        ...baseWhere,
                        createdAt: (0, typeorm_1.MoreThanOrEqual)(since),
                    },
                    select: ['outcome'],
                });
                return this.aggregateCounts(events.filter((e) => !excludedOutcomes.includes(e.outcome)));
            }
            // TRANSACTION_COUNT mode: last N non-cancelled events
            const events = await this.eventRepo.find({
                where: baseWhere,
                order: { createdAt: 'DESC' },
                take: windowSize + 200, // over-fetch to account for cancelled
                select: ['outcome'],
            });
            const filtered = events
                .filter((e) => !excludedOutcomes.includes(e.outcome))
                .slice(0, windowSize);
            return this.aggregateCounts(filtered);
        }
        aggregateCounts(events) {
            const counts = {
                totalAttempts: events.length,
                successfulTransfers: 0,
                failedTransfers: 0,
                timeoutCount: 0,
            };
            for (const event of events) {
                if (event.outcome === reliability_enum_1.TransactionOutcome.SUCCESS)
                    counts.successfulTransfers++;
                else if (event.outcome === reliability_enum_1.TransactionOutcome.FAILED)
                    counts.failedTransfers++;
                else if (event.outcome === reliability_enum_1.TransactionOutcome.TIMEOUT)
                    counts.timeoutCount++;
            }
            return counts;
        }
        // ─── Compute & Cache Reliability ──────────────────────────────────────────
        async getReliability(dto) {
            const windowMode = dto.windowMode ?? reliability_enum_1.WindowMode.TRANSACTION_COUNT;
            const windowSize = dto.windowSize ??
                (windowMode === reliability_enum_1.WindowMode.TIME_BASED
                    ? reliability_constants_1.RELIABILITY_CONSTANTS.DEFAULT_WINDOW_DAYS
                    : reliability_constants_1.RELIABILITY_CONSTANTS.DEFAULT_WINDOW_SIZE);
            const counts = await this.getRollingCounts(dto.bridgeName, dto.sourceChain, dto.destinationChain, windowMode, windowSize);
            const reliabilityPercent = this.calculator.computeReliabilityPercent(counts);
            const reliabilityScore = this.calculator.computeReliabilityScore(counts);
            const tier = this.calculator.computeTier(reliabilityPercent);
            const badge = this.calculator.buildBadge(reliabilityPercent, windowSize, windowMode);
            // Upsert cached metric for ranking engine access
            const metric = await this.upsertMetric({
                bridgeName: dto.bridgeName,
                sourceChain: dto.sourceChain.toLowerCase(),
                destinationChain: dto.destinationChain.toLowerCase(),
                ...counts,
                reliabilityPercent,
                reliabilityScore,
                reliabilityTier: tier,
                windowMode,
                windowSize,
            });
            return {
                bridgeName: dto.bridgeName,
                sourceChain: dto.sourceChain.toLowerCase(),
                destinationChain: dto.destinationChain.toLowerCase(),
                totalAttempts: counts.totalAttempts,
                successfulTransfers: counts.successfulTransfers,
                failedTransfers: counts.failedTransfers,
                timeoutCount: counts.timeoutCount,
                reliabilityPercent,
                reliabilityScore,
                badge,
                lastComputedAt: metric.lastComputedAt,
            };
        }
        // ─── Ranking Engine Integration ───────────────────────────────────────────
        async getReliabilityRankingFactor(bridgeName, sourceChain, destinationChain, options = {}) {
            const metric = await this.metricRepo.findOne({
                where: {
                    bridgeName,
                    sourceChain: sourceChain.toLowerCase(),
                    destinationChain: destinationChain.toLowerCase(),
                },
            });
            const reliabilityScore = metric?.reliabilityScore ?? 0;
            const threshold = options.threshold ?? reliability_constants_1.RELIABILITY_CONSTANTS.MEDIUM_THRESHOLD;
            const penaltyApplied = !options.ignoreReliability && reliabilityScore < threshold;
            const adjustedScore = options.ignoreReliability
                ? reliabilityScore
                : reliabilityScore -
                    (penaltyApplied ? reliability_constants_1.RELIABILITY_CONSTANTS.PENALTY_BELOW_THRESHOLD : 0);
            return {
                bridgeName,
                sourceChain: sourceChain.toLowerCase(),
                destinationChain: destinationChain.toLowerCase(),
                reliabilityScore,
                penaltyApplied,
                adjustedScore: Math.max(0, adjustedScore),
            };
        }
        /**
         * Bulk fetch reliability factors for all bridges on a route.
         * Used by the Smart Bridge Ranking engine to sort bridges.
         */
        async getBulkReliabilityFactors(sourceChain, destinationChain, options = {}) {
            const metrics = await this.metricRepo.find({
                where: {
                    sourceChain: sourceChain.toLowerCase(),
                    destinationChain: destinationChain.toLowerCase(),
                },
            });
            return metrics.map((m) => {
                const threshold = options.threshold ?? reliability_constants_1.RELIABILITY_CONSTANTS.MEDIUM_THRESHOLD;
                const penaltyApplied = !options.ignoreReliability && Number(m.reliabilityScore) < threshold;
                return {
                    bridgeName: m.bridgeName,
                    sourceChain: m.sourceChain,
                    destinationChain: m.destinationChain,
                    reliabilityScore: Number(m.reliabilityScore),
                    penaltyApplied,
                    adjustedScore: Math.max(0, Number(m.reliabilityScore) -
                        (penaltyApplied
                            ? reliability_constants_1.RELIABILITY_CONSTANTS.PENALTY_BELOW_THRESHOLD
                            : 0)),
                };
            });
        }
        // ─── Admin / Maintenance ──────────────────────────────────────────────────
        async getAllMetrics() {
            return this.metricRepo.find({ order: { reliabilityScore: 'DESC' } });
        }
        // ─── Private Helpers ──────────────────────────────────────────────────────
        async upsertMetric(data) {
            let metric = await this.metricRepo.findOne({
                where: {
                    bridgeName: data.bridgeName,
                    sourceChain: data.sourceChain,
                    destinationChain: data.destinationChain,
                },
            });
            if (!metric) {
                metric = this.metricRepo.create({
                    bridgeName: data.bridgeName,
                    sourceChain: data.sourceChain,
                    destinationChain: data.destinationChain,
                });
            }
            Object.assign(metric, {
                totalAttempts: data.totalAttempts,
                successfulTransfers: data.successfulTransfers,
                failedTransfers: data.failedTransfers,
                timeoutCount: data.timeoutCount,
                reliabilityPercent: data.reliabilityPercent,
                reliabilityScore: data.reliabilityScore,
                reliabilityTier: data.reliabilityTier,
                windowConfig: { mode: data.windowMode, size: data.windowSize },
            });
            return this.metricRepo.save(metric);
        }
        async invalidateCachedMetric(bridgeName, sourceChain, destinationChain) {
            // Simply sets score to stale; actual recompute happens on next getReliability call
            await this.metricRepo.update({
                bridgeName,
                sourceChain: sourceChain.toLowerCase(),
                destinationChain: destinationChain.toLowerCase(),
            }, { totalAttempts: () => '"totalAttempts"' });
        }
    };
    __setFunctionName(_classThis, "BridgeReliabilityService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        BridgeReliabilityService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return BridgeReliabilityService = _classThis;
})();
exports.BridgeReliabilityService = BridgeReliabilityService;
//# sourceMappingURL=bridge-reliability.service.js.map