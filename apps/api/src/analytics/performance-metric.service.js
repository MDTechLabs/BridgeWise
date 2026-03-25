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
exports.PerformanceMetricService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
/**
 * Performance Metric Service
 *
 * Manages historical performance metrics aggregation and retrieval.
 * Provides time-series data for trend analysis and bridge comparisons.
 */
let PerformanceMetricService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var PerformanceMetricService = _classThis = class {
        constructor(metricRepository, benchmarkRepository) {
            this.metricRepository = metricRepository;
            this.benchmarkRepository = benchmarkRepository;
            this.logger = new common_1.Logger(PerformanceMetricService.name);
        }
        /**
         * Get paginated performance metrics with optional filters
         */
        async getMetrics(query) {
            const where = {
                timeInterval: query.timeInterval,
            };
            if (query.bridgeName) {
                where.bridgeName = query.bridgeName;
            }
            if (query.sourceChain) {
                where.sourceChain = query.sourceChain;
            }
            if (query.destinationChain) {
                where.destinationChain = query.destinationChain;
            }
            if (query.token) {
                where.token = query.token;
            }
            if (query.startDate && query.endDate) {
                where.timestamp = (0, typeorm_1.Between)(new Date(query.startDate), new Date(query.endDate));
            }
            const [data, total] = await this.metricRepository.findAndCount({
                where,
                order: { timestamp: 'DESC' },
                skip: (query.page - 1) * query.limit,
                take: query.limit,
            });
            const metrics = data.map((entity) => this.mapToMetricDto(entity));
            return {
                data: metrics,
                total,
                page: query.page,
                limit: query.limit,
                totalPages: Math.ceil(total / query.limit),
                timeInterval: query.timeInterval,
                generatedAt: new Date(),
            };
        }
        /**
         * Get historical trends for a specific route
         */
        async getHistoricalTrends(bridgeName, sourceChain, destinationChain, timeInterval, startDate, endDate, token) {
            const where = {
                bridgeName,
                sourceChain,
                destinationChain,
                timeInterval,
                timestamp: (0, typeorm_1.Between)(startDate, endDate),
            };
            if (token) {
                where.token = token;
            }
            const data = await this.metricRepository.find({
                where,
                order: { timestamp: 'ASC' },
            });
            const trends = data.map((entity) => this.mapToMetricDto(entity));
            return {
                bridgeName,
                sourceChain,
                destinationChain,
                token,
                timeInterval,
                trends,
                generatedAt: new Date(),
            };
        }
        /**
         * Compare performance across multiple bridges
         */
        async compareBridgePerformance(bridgeNames, timeInterval, startDate, endDate, sourceChain, destinationChain, token) {
            const comparisons = [];
            for (const bridgeName of bridgeNames) {
                const where = {
                    bridgeName,
                    timeInterval,
                    timestamp: (0, typeorm_1.Between)(startDate, endDate),
                };
                if (sourceChain)
                    where.sourceChain = sourceChain;
                if (destinationChain)
                    where.destinationChain = destinationChain;
                if (token)
                    where.token = token;
                const metrics = await this.metricRepository.find({ where });
                if (metrics.length === 0)
                    continue;
                // Aggregate across all routes for this bridge
                const totalTransfers = metrics.reduce((sum, m) => sum + m.totalTransfers, 0);
                const successfulTransfers = metrics.reduce((sum, m) => sum + m.successfulTransfers, 0);
                const avgSuccessRate = totalTransfers > 0 ? (successfulTransfers / totalTransfers) * 100 : 0;
                const settlementTimes = metrics
                    .filter((m) => m.averageSettlementTimeMs)
                    .map((m) => m.averageSettlementTimeMs);
                const avgSettlementTimeMs = settlementTimes.length > 0
                    ? settlementTimes.reduce((a, b) => a + b, 0) / settlementTimes.length
                    : 0;
                const fees = metrics.filter((m) => m.averageFee).map((m) => m.averageFee);
                const avgFee = fees.length > 0 ? fees.reduce((a, b) => a + b, 0) / fees.length : 0;
                const slippages = metrics
                    .filter((m) => m.averageSlippagePercent)
                    .map((m) => m.averageSlippagePercent);
                const avgSlippagePercent = slippages.length > 0
                    ? slippages.reduce((a, b) => a + b, 0) / slippages.length
                    : 0;
                const totalVolume = metrics.reduce((sum, m) => sum + m.totalVolume, 0);
                // Determine trend direction based on success rate changes
                const sortedByTime = [...metrics].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
                let trendDirection = 'stable';
                if (sortedByTime.length >= 2) {
                    const firstHalf = sortedByTime.slice(0, Math.floor(sortedByTime.length / 2));
                    const secondHalf = sortedByTime.slice(Math.floor(sortedByTime.length / 2));
                    const firstRate = firstHalf.reduce((sum, m) => sum + m.successRate, 0) /
                        firstHalf.length;
                    const secondRate = secondHalf.reduce((sum, m) => sum + m.successRate, 0) /
                        secondHalf.length;
                    if (secondRate > firstRate + 2)
                        trendDirection = 'improving';
                    else if (secondRate < firstRate - 2)
                        trendDirection = 'declining';
                }
                comparisons.push({
                    bridgeName,
                    sourceChain: sourceChain || 'all',
                    destinationChain: destinationChain || 'all',
                    timeInterval,
                    dataPoints: metrics.length,
                    avgSuccessRate,
                    avgSettlementTimeMs,
                    avgFee,
                    avgSlippagePercent,
                    totalVolume,
                    totalTransfers,
                    trendDirection,
                });
            }
            return {
                comparisons,
                timeInterval,
                startDate,
                endDate,
                generatedAt: new Date(),
            };
        }
        /**
         * Aggregate metrics for a specific time period
         */
        async aggregateMetrics(timeInterval, date, bridgeName) {
            const { startTime, endTime } = this.getTimeRange(timeInterval, date);
            this.logger.log(`Aggregating ${timeInterval} metrics for ${date.toISOString()}${bridgeName ? ` (${bridgeName})` : ''}`);
            // Build query for raw benchmark data
            let query = this.benchmarkRepository
                .createQueryBuilder('b')
                .where('b.created_at >= :startTime', { startTime })
                .andWhere('b.created_at < :endTime', { endTime });
            if (bridgeName) {
                query = query.andWhere('b.bridge_name = :bridgeName', { bridgeName });
            }
            const benchmarks = await query.getMany();
            if (benchmarks.length === 0) {
                this.logger.debug(`No benchmarks found for period`);
                return { processed: 0, inserted: 0 };
            }
            // Group by route
            const grouped = this.groupByRoute(benchmarks);
            let inserted = 0;
            for (const [key, group] of grouped.entries()) {
                const metric = this.calculateMetrics(group, timeInterval, startTime);
                // Check for existing metric
                const existing = await this.metricRepository.findOne({
                    where: {
                        bridgeName: metric.bridgeName,
                        sourceChain: metric.sourceChain,
                        destinationChain: metric.destinationChain,
                        token: metric.token,
                        timeInterval,
                        timestamp: startTime,
                    },
                });
                if (existing) {
                    // Update existing
                    Object.assign(existing, metric);
                    await this.metricRepository.save(existing);
                }
                else {
                    // Create new
                    const entity = this.metricRepository.create(metric);
                    await this.metricRepository.save(entity);
                    inserted++;
                }
            }
            this.logger.log(`Aggregated ${benchmarks.length} benchmarks into ${inserted} metrics`);
            return { processed: benchmarks.length, inserted };
        }
        /**
         * Run aggregation for all bridges for a date range
         */
        async aggregateDateRange(timeInterval, startDate, endDate) {
            let totalProcessed = 0;
            let totalInserted = 0;
            const current = new Date(startDate);
            while (current < endDate) {
                const result = await this.aggregateMetrics(timeInterval, new Date(current));
                totalProcessed += result.processed;
                totalInserted += result.inserted;
                // Advance to next period
                switch (timeInterval) {
                    case 'hourly':
                        current.setHours(current.getHours() + 1);
                        break;
                    case 'daily':
                        current.setDate(current.getDate() + 1);
                        break;
                    case 'weekly':
                        current.setDate(current.getDate() + 7);
                        break;
                    case 'monthly':
                        current.setMonth(current.getMonth() + 1);
                        break;
                }
            }
            return { processed: totalProcessed, inserted: totalInserted };
        }
        /**
         * Get the latest aggregated metrics
         */
        async getLatestMetrics(timeInterval, limit = 10) {
            return this.metricRepository.find({
                where: { timeInterval },
                order: { timestamp: 'DESC' },
                take: limit,
            });
        }
        /**
         * Get metric summary for a route
         */
        async getMetricSummary(bridgeName, sourceChain, destinationChain, token) {
            const where = {
                bridgeName,
                sourceChain,
                destinationChain,
            };
            if (token)
                where.token = token;
            const metrics = await this.metricRepository.find({ where });
            if (metrics.length === 0)
                return null;
            const timestamps = metrics.map((m) => m.timestamp);
            const totalTransfers = metrics.reduce((sum, m) => sum + m.totalTransfers, 0);
            const successfulTransfers = metrics.reduce((sum, m) => sum + m.successfulTransfers, 0);
            const settlementTimes = metrics
                .filter((m) => m.averageSettlementTimeMs)
                .map((m) => m.averageSettlementTimeMs);
            const fees = metrics.filter((m) => m.averageFee).map((m) => m.averageFee);
            const slippages = metrics
                .filter((m) => m.averageSlippagePercent)
                .map((m) => m.averageSlippagePercent);
            return {
                totalDataPoints: metrics.length,
                dateRange: {
                    start: new Date(Math.min(...timestamps.map((t) => t.getTime()))),
                    end: new Date(Math.max(...timestamps.map((t) => t.getTime()))),
                },
                overallStats: {
                    totalTransfers,
                    avgSuccessRate: totalTransfers > 0 ? (successfulTransfers / totalTransfers) * 100 : 0,
                    avgSettlementTimeMs: settlementTimes.length > 0
                        ? settlementTimes.reduce((a, b) => a + b, 0) /
                            settlementTimes.length
                        : 0,
                    avgFee: fees.length > 0 ? fees.reduce((a, b) => a + b, 0) / fees.length : 0,
                    avgSlippagePercent: slippages.length > 0
                        ? slippages.reduce((a, b) => a + b, 0) / slippages.length
                        : 0,
                    totalVolume: metrics.reduce((sum, m) => sum + m.totalVolume, 0),
                },
            };
        }
        /**
         * Delete old metrics to save storage
         */
        async pruneOldMetrics(timeInterval, olderThan) {
            const result = await this.metricRepository.delete({
                timeInterval,
                timestamp: (0, typeorm_1.LessThan)(olderThan),
            });
            return result.affected || 0;
        }
        /**
         * Group benchmarks by route
         */
        groupByRoute(benchmarks) {
            const grouped = new Map();
            for (const benchmark of benchmarks) {
                const key = `${benchmark.bridgeName}:${benchmark.sourceChain}:${benchmark.destinationChain}:${benchmark.token || 'null'}`;
                if (!grouped.has(key)) {
                    grouped.set(key, []);
                }
                grouped.get(key).push(benchmark);
            }
            return grouped;
        }
        /**
         * Calculate metrics from a group of benchmarks
         */
        calculateMetrics(benchmarks, timeInterval, timestamp) {
            const first = benchmarks[0];
            const totalTransfers = benchmarks.length;
            const successful = benchmarks.filter((b) => b.status === 'confirmed').length;
            const failed = benchmarks.filter((b) => b.status === 'failed').length;
            // Settlement times
            const settlementTimes = benchmarks
                .filter((b) => b.durationMs && b.status === 'confirmed')
                .map((b) => b.durationMs);
            // Amounts for volume
            const amounts = benchmarks
                .filter((b) => b.amount)
                .map((b) => parseFloat(b.amount?.toString() || '0'));
            return {
                bridgeName: first.bridgeName,
                sourceChain: first.sourceChain,
                destinationChain: first.destinationChain,
                token: first.token,
                timeInterval,
                timestamp,
                totalTransfers,
                successfulTransfers: successful,
                failedTransfers: failed,
                averageSettlementTimeMs: settlementTimes.length > 0
                    ? settlementTimes.reduce((a, b) => a + b, 0) / settlementTimes.length
                    : null,
                minSettlementTimeMs: settlementTimes.length > 0 ? Math.min(...settlementTimes) : null,
                maxSettlementTimeMs: settlementTimes.length > 0 ? Math.max(...settlementTimes) : null,
                totalVolume: amounts.reduce((a, b) => a + b, 0),
                // Fees and slippage would come from additional data sources
                averageFee: null,
                minFee: null,
                maxFee: null,
                averageSlippagePercent: null,
                minSlippagePercent: null,
                maxSlippagePercent: null,
                totalFees: 0,
            };
        }
        /**
         * Get time range for a time interval
         */
        getTimeRange(timeInterval, date) {
            const start = new Date(date);
            const end = new Date(date);
            switch (timeInterval) {
                case 'hourly':
                    start.setMinutes(0, 0, 0);
                    end.setMinutes(0, 0, 0);
                    end.setHours(end.getHours() + 1);
                    break;
                case 'daily':
                    start.setHours(0, 0, 0, 0);
                    end.setHours(0, 0, 0, 0);
                    end.setDate(end.getDate() + 1);
                    break;
                case 'weekly': {
                    // Start of week (Sunday)
                    const dayOfWeek = start.getDay();
                    start.setDate(start.getDate() - dayOfWeek);
                    start.setHours(0, 0, 0, 0);
                    end.setTime(start.getTime());
                    end.setDate(end.getDate() + 7);
                    break;
                }
                case 'monthly':
                    start.setDate(1);
                    start.setHours(0, 0, 0, 0);
                    end.setTime(start.getTime());
                    end.setMonth(end.getMonth() + 1);
                    break;
            }
            return { startTime: start, endTime: end };
        }
        /**
         * Map entity to DTO
         */
        mapToMetricDto(entity) {
            return {
                bridgeName: entity.bridgeName,
                sourceChain: entity.sourceChain,
                destinationChain: entity.destinationChain,
                token: entity.token || undefined,
                timeInterval: entity.timeInterval,
                timestamp: entity.timestamp,
                totalTransfers: entity.totalTransfers,
                successfulTransfers: entity.successfulTransfers,
                failedTransfers: entity.failedTransfers,
                successRate: entity.successRate,
                failureRate: entity.failureRate,
                averageSettlementTimeMs: entity.averageSettlementTimeMs || undefined,
                minSettlementTimeMs: entity.minSettlementTimeMs || undefined,
                maxSettlementTimeMs: entity.maxSettlementTimeMs || undefined,
                averageFee: entity.averageFee || undefined,
                minFee: entity.minFee || undefined,
                maxFee: entity.maxFee || undefined,
                averageSlippagePercent: entity.averageSlippagePercent || undefined,
                minSlippagePercent: entity.minSlippagePercent || undefined,
                maxSlippagePercent: entity.maxSlippagePercent || undefined,
                totalVolume: entity.totalVolume,
                totalFees: entity.totalFees,
            };
        }
    };
    __setFunctionName(_classThis, "PerformanceMetricService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        PerformanceMetricService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return PerformanceMetricService = _classThis;
})();
exports.PerformanceMetricService = PerformanceMetricService;
//# sourceMappingURL=performance-metric.service.js.map