"use strict";
// Simplified Benchmark Controller for BridgeWise
// This is a placeholder implementation that will be enhanced when dependencies are properly configured
Object.defineProperty(exports, "__esModule", { value: true });
exports.BenchmarkController = void 0;
// This is a simplified implementation without decorators for now
class BenchmarkController {
    constructor(benchmarkService) {
        this.benchmarkService = benchmarkService;
    }
    async processTransaction(transactionData) {
        await this.benchmarkService.processTransaction(transactionData);
        return { success: true };
    }
    async getBenchmarks(bridgeName, sourceChain, destinationChain, token, limit = 50) {
        const query = { bridgeName, sourceChain, destinationChain, token };
        return await this.benchmarkService.getBenchmarks(query, limit);
    }
    async getLatestBenchmark(bridgeName, sourceChain, destinationChain, token) {
        const query = { bridgeName, sourceChain, destinationChain, token };
        return await this.benchmarkService.getLatestBenchmark(query);
    }
    async getAverageBenchmark(bridgeName, sourceChain, destinationChain, token) {
        const query = { bridgeName, sourceChain, destinationChain, token };
        return await this.benchmarkService.getAverageBenchmark(query);
    }
}
exports.BenchmarkController = BenchmarkController;
//# sourceMappingURL=benchmark.controller.js.map