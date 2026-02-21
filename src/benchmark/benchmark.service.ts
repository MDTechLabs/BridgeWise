// Simplified Benchmark Service for BridgeWise
// This is a placeholder implementation that will be enhanced when dependencies are properly configured

export interface FeeSlippageBenchmark {
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  token: string;
  avgFee: number;
  avgSlippagePercent: number;
  timestamp: Date;
  minFee?: number;
  maxFee?: number;
  minSlippagePercent?: number;
  maxSlippagePercent?: number;
  sampleSize?: number;
}

interface BenchmarkQuery {
  bridgeName?: string;
  sourceChain?: string;
  destinationChain?: string;
  token?: string;
}

export class BenchmarkService {
  private benchmarks: FeeSlippageBenchmark[] = [];

  /**
   * Save benchmark data to storage
   */
  async saveBenchmark(benchmark: FeeSlippageBenchmark): Promise<void> {
    this.benchmarks.push(benchmark);
    // Keep only last 100 records per route to prevent memory bloat
    this.cleanupOldRecords();
  }

  /**
   * Get benchmarks by query criteria
   */
  async getBenchmarks(
    query: BenchmarkQuery,
    limit: number = 50,
  ): Promise<FeeSlippageBenchmark[]> {
    let results = this.benchmarks.filter((benchmark) => {
      if (query.bridgeName && benchmark.bridgeName !== query.bridgeName)
        return false;
      if (query.sourceChain && benchmark.sourceChain !== query.sourceChain)
        return false;
      if (
        query.destinationChain &&
        benchmark.destinationChain !== query.destinationChain
      )
        return false;
      if (query.token && benchmark.token !== query.token) return false;
      return true;
    });

    // Sort by timestamp descending and limit results
    results = results
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);

    return results;
  }

  /**
   * Get the latest benchmark for a specific route
   */
  async getLatestBenchmark(
    query: BenchmarkQuery,
  ): Promise<FeeSlippageBenchmark | null> {
    const benchmarks = await this.getBenchmarks(query, 1);
    return benchmarks.length > 0 ? benchmarks[0] : null;
  }

  /**
   * Get historical averages for a specific route
   */
  async getAverageBenchmark(query: BenchmarkQuery): Promise<{
    avgFee: number;
    avgSlippagePercent: number;
    sampleSize: number;
  } | null> {
    const benchmarks = await this.getBenchmarks(query, 1000); // Get all available records

    if (benchmarks.length === 0) {
      return null;
    }

    const sumFee = benchmarks.reduce((sum, b) => sum + b.avgFee, 0);
    const sumSlippage = benchmarks.reduce(
      (sum, b) => sum + b.avgSlippagePercent,
      0,
    );

    return {
      avgFee: sumFee / benchmarks.length,
      avgSlippagePercent: sumSlippage / benchmarks.length,
      sampleSize: benchmarks.length,
    };
  }

  /**
   * Process a completed transaction to extract benchmark data
   */
  async processTransaction(transactionData: any): Promise<void> {
    // Extract fee and slippage information from the transaction
    const {
      provider,
      sourceChain,
      destinationChain,
      token,
      feePercentage,
      slippage,
      inputAmount,
      outputAmount,
    } = transactionData;

    // Calculate actual slippage percentage
    const slippagePercent =
      slippage ||
      this.calculateSlippage(
        parseFloat(inputAmount),
        parseFloat(outputAmount),
        feePercentage,
      );

    // Create benchmark record
    const benchmark: FeeSlippageBenchmark = {
      bridgeName: provider,
      sourceChain,
      destinationChain,
      token,
      avgFee: feePercentage,
      avgSlippagePercent: slippagePercent,
      timestamp: new Date(),
      sampleSize: 1,
    };

    await this.saveBenchmark(benchmark);
  }

  /**
   * Calculate slippage percentage based on input/output amounts and fees
   */
  private calculateSlippage(
    inputAmount: number,
    outputAmount: number,
    feePercentage: number,
  ): number {
    // Calculate expected output after fees
    const expectedOutput = inputAmount * (1 - feePercentage / 100);

    // Calculate the actual slippage
    if (expectedOutput > 0) {
      return Math.abs(((expectedOutput - outputAmount) / expectedOutput) * 100);
    }

    return 0;
  }

  /**
   * Clean up old records to prevent memory bloat
   */
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
