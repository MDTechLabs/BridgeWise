"use strict";
/**
 * Fee & Slippage Benchmarking Service
 * Collects, stores, and provides access to historical fee and slippage data
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BenchmarkService = exports.InMemoryBenchmarkStorage = void 0;
/**
 * In-memory benchmark storage for development/testing
 */
class InMemoryBenchmarkStorage {
    constructor() {
        this.benchmarks = [];
    }
    async save(benchmark) {
        this.benchmarks.push(benchmark);
        // Keep only last 100 records per route to prevent memory bloat
        await Promise.resolve(); // Added await to satisfy require-await
        this.cleanupOldRecords();
    }
    async getByCriteria(bridgeName, sourceChain, destinationChain, token, limit = 10) {
        await Promise.resolve(); // Added await to satisfy require-await
        const filtered = this.benchmarks
            .filter((b) => b.bridgeName === bridgeName &&
            b.sourceChain === sourceChain &&
            b.destinationChain === destinationChain &&
            b.token === token)
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        return filtered.slice(0, limit);
    }
    async getLatest(bridgeName, sourceChain, destinationChain, token) {
        const records = await this.getByCriteria(bridgeName, sourceChain, destinationChain, token, 1);
        return records.length > 0 ? records[0] : null;
    }
    async getAverage(bridgeName, sourceChain, destinationChain, token) {
        const records = await this.getByCriteria(bridgeName, sourceChain, destinationChain, token, 100);
        if (records.length === 0) {
            return null;
        }
        const sumFee = records.reduce((sum, record) => sum + record.avgFee, 0);
        const sumSlippage = records.reduce((sum, record) => sum + record.avgSlippagePercent, 0);
        return {
            avgFee: sumFee / records.length,
            avgSlippagePercent: sumSlippage / records.length,
            sampleSize: records.length,
        };
    }
    cleanupOldRecords() {
        // Group by route criteria
        const grouped = new Map();
        for (const benchmark of this.benchmarks) {
            const key = `${benchmark.bridgeName}-${benchmark.sourceChain}-${benchmark.destinationChain}-${benchmark.token}`;
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key).push(benchmark);
        }
        // Keep only last 100 records per group
        const kept = [];
        for (const records of grouped.values()) {
            const sorted = records.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
            kept.push(...sorted.slice(0, 100));
        }
        this.benchmarks = kept;
    }
}
exports.InMemoryBenchmarkStorage = InMemoryBenchmarkStorage;
/**
 * Benchmarking service that collects data from executed transactions
 */
class BenchmarkService {
    constructor(storage = new InMemoryBenchmarkStorage()) {
        this.storage = storage;
    }
    /**
     * Process a completed bridge route to extract benchmark data
     */
    async processRoute(route, inputAmount) {
        try {
            // Extract fee percentage from the route
            const feePercentage = route.feePercentage;
            // Calculate slippage percentage
            const inputNum = parseFloat(inputAmount);
            const outputNum = parseFloat(route.outputAmount);
            const expectedOutput = inputNum - (inputNum * feePercentage) / 100;
            const slippagePercent = expectedOutput > 0
                ? Math.abs(((expectedOutput - outputNum) / expectedOutput) * 100)
                : 0;
            // Create benchmark record
            const benchmark = {
                bridgeName: route.provider,
                sourceChain: route.sourceChain,
                destinationChain: route.targetChain,
                token: 'UNKNOWN', // We may need to enhance this to extract token from route
                avgFee: feePercentage,
                avgSlippagePercent: slippagePercent,
                timestamp: new Date(),
            };
            // Save to storage
            await this.storage.save(benchmark);
        }
        catch (error) {
            console.error('Error processing route for benchmark:', error);
        }
    }
    /**
     * Get benchmark data for a specific route
     */
    async getBenchmarks(bridgeName, sourceChain, destinationChain, token) {
        return await this.storage.getByCriteria(bridgeName, sourceChain, destinationChain, token);
    }
    /**
     * Get the latest benchmark for a specific route
     */
    async getLatestBenchmark(bridgeName, sourceChain, destinationChain, token) {
        return await this.storage.getLatest(bridgeName, sourceChain, destinationChain, token);
    }
    /**
     * Get historical averages for a specific route
     */
    async getAverageBenchmark(bridgeName, sourceChain, destinationChain, token) {
        return await this.storage.getAverage(bridgeName, sourceChain, destinationChain, token);
    }
    /**
     * Normalize benchmark data across different chains and tokens
     */
    normalizeBenchmark(benchmark) {
        // In a real implementation, this would convert different tokens to a common base
        // For now, we'll just return the fee percentage as-is
        return benchmark.avgFee;
    }
}
exports.BenchmarkService = BenchmarkService;
//# sourceMappingURL=benchmark.js.map