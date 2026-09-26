interface RouteBenchmark {
  routeId: string;
  sourceChain: string;
  destChain: string;
  asset: string;
  totalTransfers: number;
  successCount: number;
  avgLatencyMs: number;
}

interface BenchmarkReport {
  route: RouteBenchmark;
  successRate: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

function runBenchmark(route: RouteBenchmark): BenchmarkReport {
  const successRate = route.totalTransfers > 0 ? route.successCount / route.totalTransfers : 0;
  const grade = successRate >= 0.99 ? 'A' : successRate >= 0.97 ? 'B' : successRate >= 0.95 ? 'C' : successRate >= 0.90 ? 'D' : 'F';
  return { route, successRate, grade };
}

const ROUTES: RouteBenchmark[] = [
  { routeId: 'stellar-eth-usdc', sourceChain: 'Stellar', destChain: 'Ethereum', asset: 'USDC', totalTransfers: 5000, successCount: 4935, avgLatencyMs: 4200 },
  { routeId: 'stellar-polygon-usdc', sourceChain: 'Stellar', destChain: 'Polygon', asset: 'USDC', totalTransfers: 3200, successCount: 3088, avgLatencyMs: 3100 },
  { routeId: 'stellar-base-xlm', sourceChain: 'Stellar', destChain: 'Base', asset: 'XLM', totalTransfers: 1500, successCount: 1491, avgLatencyMs: 2800 },
  { routeId: 'eth-stellar-usdc', sourceChain: 'Ethereum', destChain: 'Stellar', asset: 'USDC', totalTransfers: 4100, successCount: 3858, avgLatencyMs: 6700 },
  { routeId: 'polygon-stellar-usdt', sourceChain: 'Polygon', destChain: 'Stellar', asset: 'USDT', totalTransfers: 2800, successCount: 2716, avgLatencyMs: 3500 },
];

const reports = ROUTES.map(runBenchmark);

function printReport(): void {
  for (const r of reports) {
    console.log(`${r.route.routeId}: ${(r.successRate * 100).toFixed(2)}% success (Grade ${r.grade})`);
  }
}

printReport();
