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
exports.BridgeBenchmarkService = void 0;
const common_1 = require("@nestjs/common");
const bridge_benchmark_entity_1 = require("./entities/bridge-benchmark.entity");
let BridgeBenchmarkService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var BridgeBenchmarkService = _classThis = class {
        constructor(benchmarkRepository, eventEmitter) {
            this.benchmarkRepository = benchmarkRepository;
            this.eventEmitter = eventEmitter;
            this.logger = new common_1.Logger(BridgeBenchmarkService.name);
        }
        async initiate(dto) {
            const benchmark = this.benchmarkRepository.create({
                bridgeName: dto.bridgeName,
                sourceChain: dto.sourceChain,
                destinationChain: dto.destinationChain,
                token: dto.token,
                sourceChainType: dto.sourceChainType,
                destinationChainType: dto.destinationChainType,
                amount: dto.amount,
                quoteRequestedAt: dto.quoteRequestedAt
                    ? new Date(dto.quoteRequestedAt)
                    : null,
                startTime: new Date(),
                status: bridge_benchmark_entity_1.TransactionStatus.SUBMITTED,
            });
            return this.benchmarkRepository.save(benchmark);
        }
        async confirm(id, dto) {
            const benchmark = await this.findOneOrFail(id);
            if (benchmark.status === bridge_benchmark_entity_1.TransactionStatus.CONFIRMED) {
                throw new common_1.BadRequestException('Benchmark already confirmed');
            }
            const now = new Date();
            const durationMs = now.getTime() - benchmark.startTime.getTime();
            benchmark.destinationConfirmedAt = now;
            benchmark.completionTime = now;
            benchmark.durationMs = durationMs;
            benchmark.status = bridge_benchmark_entity_1.TransactionStatus.CONFIRMED;
            if (dto.transactionHash) {
                benchmark.transactionHash = dto.transactionHash;
            }
            if (dto.destinationTxHash) {
                benchmark.destinationTxHash = dto.destinationTxHash;
            }
            const saved = await this.benchmarkRepository.save(benchmark);
            // Emit event for analytics collection
            const event = {
                id: saved.id,
                bridgeName: saved.bridgeName,
                sourceChain: saved.sourceChain,
                destinationChain: saved.destinationChain,
                token: saved.token,
                status: 'confirmed',
                durationMs,
                amount: saved.amount || undefined,
                completedAt: now,
            };
            this.eventEmitter.emit('benchmark.completed', event);
            this.logger.debug(`Emitted benchmark.completed event for ${id}`);
            return saved;
        }
        async updateStatus(id, dto) {
            const benchmark = await this.findOneOrFail(id);
            const previousStatus = benchmark.status;
            benchmark.status = dto.status;
            if (dto.transactionHash) {
                benchmark.transactionHash = dto.transactionHash;
            }
            const saved = await this.benchmarkRepository.save(benchmark);
            // Emit event if status changed to failed
            if (dto.status === bridge_benchmark_entity_1.TransactionStatus.FAILED &&
                previousStatus !== bridge_benchmark_entity_1.TransactionStatus.FAILED) {
                const now = new Date();
                const durationMs = benchmark.startTime
                    ? now.getTime() - benchmark.startTime.getTime()
                    : 0;
                const event = {
                    id: saved.id,
                    bridgeName: saved.bridgeName,
                    sourceChain: saved.sourceChain,
                    destinationChain: saved.destinationChain,
                    token: saved.token,
                    status: 'failed',
                    durationMs,
                    amount: saved.amount || undefined,
                    completedAt: now,
                };
                this.eventEmitter.emit('benchmark.completed', event);
                this.logger.debug(`Emitted benchmark.completed (failed) event for ${id}`);
            }
            return saved;
        }
        async getSpeedMetrics(query) {
            const rollingWindow = query.rollingWindow ?? 50;
            const qb = this.benchmarkRepository
                .createQueryBuilder('b')
                .select('b.bridge_name', 'bridgeName')
                .addSelect('b.source_chain', 'sourceChain')
                .addSelect('b.destination_chain', 'destinationChain')
                .addSelect('b.token', 'token')
                .addSelect('AVG(b.duration_ms)', 'avgDurationMs')
                .addSelect('MIN(b.duration_ms)', 'minDurationMs')
                .addSelect('MAX(b.duration_ms)', 'maxDurationMs')
                .addSelect('COUNT(*)', 'totalTransactions')
                .addSelect(`COUNT(*) FILTER (WHERE b.status = '${bridge_benchmark_entity_1.TransactionStatus.CONFIRMED}')`, 'successfulTransactions')
                .addSelect('MAX(b.completion_time)', 'lastUpdated')
                .where('b.status = :status', { status: bridge_benchmark_entity_1.TransactionStatus.CONFIRMED })
                .andWhere('b.duration_ms IS NOT NULL')
                .groupBy('b.bridge_name')
                .addGroupBy('b.source_chain')
                .addGroupBy('b.destination_chain')
                .addGroupBy('b.token');
            if (query.bridgeName) {
                qb.andWhere('b.bridge_name = :bridgeName', {
                    bridgeName: query.bridgeName,
                });
            }
            if (query.sourceChain) {
                qb.andWhere('b.source_chain = :sourceChain', {
                    sourceChain: query.sourceChain,
                });
            }
            if (query.destinationChain) {
                qb.andWhere('b.destination_chain = :destinationChain', {
                    destinationChain: query.destinationChain,
                });
            }
            if (query.token) {
                qb.andWhere('b.token = :token', { token: query.token });
            }
            const rawMetrics = await qb.getRawMany();
            const metrics = await Promise.all(rawMetrics.map(async (row) => {
                const rollingAvgDurationMs = await this.computeRollingAverage(row.bridgeName, row.sourceChain, row.destinationChain, row.token, rollingWindow);
                const total = parseInt(row.totalTransactions, 10);
                const successful = parseInt(row.successfulTransactions, 10);
                return {
                    bridgeName: row.bridgeName,
                    sourceChain: row.sourceChain,
                    destinationChain: row.destinationChain,
                    token: row.token,
                    avgDurationMs: parseFloat(row.avgDurationMs),
                    minDurationMs: parseInt(row.minDurationMs, 10),
                    maxDurationMs: parseInt(row.maxDurationMs, 10),
                    totalTransactions: total,
                    successfulTransactions: successful,
                    successRate: total > 0 ? (successful / total) * 100 : 0,
                    rollingAvgDurationMs,
                    lastUpdated: row.lastUpdated,
                };
            }));
            return {
                metrics,
                generatedAt: new Date(),
            };
        }
        async getRankingMetrics() {
            const result = await this.getSpeedMetrics({ rollingWindow: 50 });
            return result.metrics.map((m) => ({
                bridgeName: m.bridgeName,
                sourceChain: m.sourceChain,
                destinationChain: m.destinationChain,
                token: m.token,
                rollingAvgDurationMs: m.rollingAvgDurationMs,
                successRate: m.successRate,
            }));
        }
        async findOne(id) {
            return this.benchmarkRepository.findOne({ where: { id } });
        }
        async findOneOrFail(id) {
            const benchmark = await this.findOne(id);
            if (!benchmark) {
                throw new common_1.NotFoundException(`Benchmark with id ${id} not found`);
            }
            return benchmark;
        }
        async computeRollingAverage(bridgeName, sourceChain, destinationChain, token, windowSize) {
            const rows = await this.benchmarkRepository
                .createQueryBuilder('b')
                .select('b.duration_ms', 'durationMs')
                .where('b.bridge_name = :bridgeName', { bridgeName })
                .andWhere('b.source_chain = :sourceChain', { sourceChain })
                .andWhere('b.destination_chain = :destinationChain', { destinationChain })
                .andWhere('b.token = :token', { token })
                .andWhere('b.status = :status', { status: bridge_benchmark_entity_1.TransactionStatus.CONFIRMED })
                .andWhere('b.duration_ms IS NOT NULL')
                .orderBy('b.completion_time', 'DESC')
                .limit(windowSize)
                .getRawMany();
            if (rows.length === 0)
                return 0;
            const sum = rows.reduce((acc, r) => acc + parseInt(r.durationMs, 10), 0);
            return sum / rows.length;
        }
    };
    __setFunctionName(_classThis, "BridgeBenchmarkService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        BridgeBenchmarkService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return BridgeBenchmarkService = _classThis;
})();
exports.BridgeBenchmarkService = BridgeBenchmarkService;
//# sourceMappingURL=bridge-benchmark.service.js.map