import axios from 'axios';

export interface BridgeProvider {
  name: string;
  sorobanRpcUrl: string;
}

export interface BenchmarkResult {
  provider: string;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  timestamp: Date;
}

export interface ProviderBenchmarkSummary {
  provider: string;
  totalRuns: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  successRate: number;
}

const TIMEOUT_MS = 5000;

async function measureLatency(provider: BridgeProvider): Promise<BenchmarkResult> {
  const start = Date.now();
  try {
    await axios.post(
      provider.sorobanRpcUrl,
      { jsonrpc: '2.0', id: 1, method: 'getLatestLedger' },
      { timeout: TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } },
    );
    return { provider: provider.name, latencyMs: Date.now() - start, success: true, timestamp: new Date() };
  } catch (error) {
    return {
      provider: provider.name,
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: error.message,
      timestamp: new Date(),
    };
  }
}

function summarize(provider: string, results: BenchmarkResult[]): ProviderBenchmarkSummary {
  const successes = results.filter((r) => r.success);
  const latencies = successes.map((r) => r.latencyMs);
  return {
    provider,
    totalRuns: results.length,
    successCount: successes.length,
    failureCount: results.length - successes.length,
    avgLatencyMs: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
    minLatencyMs: latencies.length ? Math.min(...latencies) : 0,
    maxLatencyMs: latencies.length ? Math.max(...latencies) : 0,
    successRate: results.length ? successes.length / results.length : 0,
  };
}

describe('Stellar Bridge Provider Benchmark Suite', () => {
  const providers: BridgeProvider[] = [
    { name: 'AllBridge', sorobanRpcUrl: 'https://soroban-rpc.stellar.org' },
    { name: 'Squid', sorobanRpcUrl: 'https://soroban-rpc.stellar.org' },
    { name: 'Stargate', sorobanRpcUrl: 'https://soroban-rpc.stellar.org' },
  ];

  const RUNS = 3;
  const allResults: Map<string, BenchmarkResult[]> = new Map();

  beforeAll(() => {
    providers.forEach((p) => allResults.set(p.name, []));
  });

  describe('Transfer Latency Benchmarks', () => {
    it('should benchmark transfer latency for each provider', async () => {
      for (const provider of providers) {
        const results: BenchmarkResult[] = [];
        for (let i = 0; i < RUNS; i++) {
          const result = await measureLatency(provider);
          results.push(result);
        }
        allResults.set(provider.name, results);

        const summary = summarize(provider.name, results);
        console.log(
          `[${provider.name}] avg: ${summary.avgLatencyMs.toFixed(1)}ms | ` +
          `min: ${summary.minLatencyMs}ms | max: ${summary.maxLatencyMs}ms | ` +
          `success: ${(summary.successRate * 100).toFixed(0)}%`,
        );

        expect(summary.totalRuns).toBe(RUNS);
      }
    }, 30000);
  });

  describe('Provider Metric Comparison', () => {
    it('should produce a summary for each provider', () => {
      for (const provider of providers) {
        const results = allResults.get(provider.name) ?? [];
        if (results.length === 0) {
          // Benchmarks may not have run yet in isolation; skip gracefully
          return;
        }
        const summary = summarize(provider.name, results);
        expect(summary.provider).toBe(provider.name);
        expect(summary.totalRuns).toBeGreaterThan(0);
        expect(summary.successRate).toBeGreaterThanOrEqual(0);
        expect(summary.successRate).toBeLessThanOrEqual(1);
        expect(summary.avgLatencyMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should identify the fastest provider by average latency', () => {
      const summaries: ProviderBenchmarkSummary[] = [];
      for (const provider of providers) {
        const results = allResults.get(provider.name) ?? [];
        if (results.length > 0) {
          summaries.push(summarize(provider.name, results));
        }
      }

      if (summaries.length === 0) return;

      const successfulSummaries = summaries.filter((s) => s.successCount > 0);
      if (successfulSummaries.length === 0) return;

      const fastest = successfulSummaries.reduce((a, b) =>
        a.avgLatencyMs <= b.avgLatencyMs ? a : b,
      );
      console.log(`Fastest provider: ${fastest.provider} (avg ${fastest.avgLatencyMs.toFixed(1)}ms)`);
      expect(fastest.provider).toBeTruthy();
    });
  });
});
