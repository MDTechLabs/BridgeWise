/**
 * Fee & Slippage Benchmarking Service
 * Collects, stores, and provides access to historical fee and slippage data
 */

import type {
  BridgeRoute,
  ChainId,
  BridgeProvider,
  FeeSlippageBenchmark,
} from './types';

export interface BenchmarkStorage {
  /**
   * Store a new benchmark record
   */
  save(benchmark: FeeSlippageBenchmark): Promise<void>;

  /**
   * Retrieve benchmarks by criteria
   */
  getByCriteria(
    bridgeName: BridgeProvider,
    sourceChain: ChainId,
    destinationChain: ChainId,
    token: string,
    limit?: number,
  ): Promise<FeeSlippageBenchmark[]>;

  /**
   * Get the most recent benchmark for a specific route
   */
  getLatest(
    bridgeName: BridgeProvider,
    sourceChain: ChainId,
    destinationChain: ChainId,
    token: string,
  ): Promise<FeeSlippageBenchmark | null>;

  /**
   * Get historical average for a specific route
   */
  getAverage(
    bridgeName: BridgeProvider,
    sourceChain: ChainId,
    destinationChain: ChainId,
    token: string,
  ): Promise<{
    avgFee: number;
    avgSlippagePercent: number;
    sampleSize: number;
  } | null>;
}

/**
 * In-memory benchmark storage for development/testing
 */
export class InMemoryBenchmarkStorage implements BenchmarkStorage {
  private benchmarks: FeeSlippageBenchmark[] = [];

  async save(benchmark: FeeSlippageBenchmark): Promise<void> {
    this.benchmarks.push(benchmark);
    // Keep only last 100 records per route to prevent memory bloat
    this.cleanupOldRecords();
  }

  async getByCriteria(
    bridgeName: BridgeProvider,
    sourceChain: ChainId,
    destinationChain: ChainId,
    token: string,
    limit: number = 10,
  ): Promise<FeeSlippageBenchmark[]> {
    const filtered = this.benchmarks
      .filter(
        (b) =>
          b.bridgeName === bridgeName &&
          b.sourceChain === sourceChain &&
          b.destinationChain === destinationChain &&
          b.token === token,
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return filtered.slice(0, limit);
  }

  async getLatest(
    bridgeName: BridgeProvider,
    sourceChain: ChainId,
    destinationChain: ChainId,
    token: string,
  ): Promise<FeeSlippageBenchmark | null> {
    const records = await this.getByCriteria(
      bridgeName,
      sourceChain,
      destinationChain,
      token,
      1,
    );
    return records.length > 0 ? records[0] : null;
  }

  async getAverage(
    bridgeName: BridgeProvider,
    sourceChain: ChainId,
    destinationChain: ChainId,
    token: string,
  ): Promise<{
    avgFee: number;
    avgSlippagePercent: number;
    sampleSize: number;
  } | null> {
    const records = await this.getByCriteria(
      bridgeName,
      sourceChain,
      destinationChain,
      token,
      100,
    );

    if (records.length === 0) {
      return null;
    }

    const sumFee = records.reduce((sum, record) => sum + record.avgFee, 0);
    const sumSlippage = records.reduce(
      (sum, record) => sum + record.avgSlippagePercent,
      0,
    );

    return {
      avgFee: sumFee / records.length,
      avgSlippagePercent: sumSlippage / records.length,
      sampleSize: records.length,
    };
  }

  private cleanupOldRecords(): void {
    // Group by route criteria
    const grouped = new Map<string, FeeSlippageBenchmark[]>();

    for (const benchmark of this.benchmarks) {
      const key = `${benchmark.bridgeName}-${benchmark.sourceChain}-${benchmark.destinationChain}-${benchmark.token}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(benchmark);
    }

    // Keep only last 100 records per group
    const kept: FeeSlippageBenchmark[] = [];
    for (const records of grouped.values()) {
      const sorted = records.sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
      );
      kept.push(...sorted.slice(0, 100));
    }

    this.benchmarks = kept;
  }
}

/**
 * Benchmarking service that collects data from executed transactions
 */
export class BenchmarkService {
  private storage: BenchmarkStorage;

  constructor(storage: BenchmarkStorage = new InMemoryBenchmarkStorage()) {
    this.storage = storage;
  }

  /**
   * Process a completed bridge route to extract benchmark data
   */
  async processRoute(route: BridgeRoute, inputAmount: string): Promise<void> {
    try {
      // Extract fee percentage from the route
      const feePercentage = route.feePercentage;

      // Calculate slippage percentage
      const inputNum = parseFloat(inputAmount);
      const outputNum = parseFloat(route.outputAmount);
      const expectedOutput = inputNum - (inputNum * feePercentage) / 100;
      const slippagePercent =
        expectedOutput > 0
          ? Math.abs(((expectedOutput - outputNum) / expectedOutput) * 100)
          : 0;

      // Create benchmark record
      const benchmark: FeeSlippageBenchmark = {
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
    } catch (error) {
      console.error('Error processing route for benchmark:', error);
    }
  }

  /**
   * Get benchmark data for a specific route
   */
  async getBenchmarks(
    bridgeName: BridgeProvider,
    sourceChain: ChainId,
    destinationChain: ChainId,
    token: string,
  ): Promise<FeeSlippageBenchmark[]> {
    return await this.storage.getByCriteria(
      bridgeName,
      sourceChain,
      destinationChain,
      token,
    );
  }

  /**
   * Get the latest benchmark for a specific route
   */
  async getLatestBenchmark(
    bridgeName: BridgeProvider,
    sourceChain: ChainId,
    destinationChain: ChainId,
    token: string,
  ): Promise<FeeSlippageBenchmark | null> {
    return await this.storage.getLatest(
      bridgeName,
      sourceChain,
      destinationChain,
      token,
    );
  }

  /**
   * Get historical averages for a specific route
   */
  async getAverageBenchmark(
    bridgeName: BridgeProvider,
    sourceChain: ChainId,
    destinationChain: ChainId,
    token: string,
  ): Promise<{
    avgFee: number;
    avgSlippagePercent: number;
    sampleSize: number;
  } | null> {
    return await this.storage.getAverage(
      bridgeName,
      sourceChain,
      destinationChain,
      token,
    );
  }

  /**
   * Normalize benchmark data across different chains and tokens
   */
  normalizeBenchmark(
    benchmark: FeeSlippageBenchmark,
    baseToken: string = 'USDC',
  ): number {
    // In a real implementation, this would convert different tokens to a common base
    // For now, we'll just return the fee percentage as-is
    return benchmark.avgFee;
  }
}
