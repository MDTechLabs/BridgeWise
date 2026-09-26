interface BenchmarkScenario {
  id: string;
  name: string;
  sourceChain: string;
  destChain: string;
  asset: string;
  amount: string;
  providers: string[];
  expectedLatencyMs: number;
  expectedFeeUsd: number;
  tags: string[];
}

interface BenchmarkDataset {
  name: string;
  description: string;
  version: string;
  scenarios: BenchmarkScenario[];
}

const STELLAR_ROUTE_BENCHMARK_DATASET: BenchmarkDataset = {
  name: 'Stellar Route Benchmark Dataset',
  description: 'Standardized benchmark scenarios for evaluating Soroban route recommendation algorithms across multiple providers and chains.',
  version: '1.0.0',
  scenarios: [
    {
      id: 'stellar-eth-usdc-large',
      name: 'Large USDC transfer Stellar to Ethereum',
      sourceChain: 'Stellar',
      destChain: 'Ethereum',
      asset: 'USDC',
      amount: '100000.00',
      providers: ['AllBridge', 'Squid', 'Wormhole'],
      expectedLatencyMs: 4200,
      expectedFeeUsd: 1.50,
      tags: ['large', 'stablecoin', 'high-value'],
    },
    {
      id: 'stellar-polygon-usdc-small',
      name: 'Small USDC transfer Stellar to Polygon',
      sourceChain: 'Stellar',
      destChain: 'Polygon',
      asset: 'USDC',
      amount: '50.00',
      providers: ['AllBridge', 'Stargate'],
      expectedLatencyMs: 3100,
      expectedFeeUsd: 0.80,
      tags: ['small', 'stablecoin', 'low-value'],
    },
    {
      id: 'stellar-base-xlm',
      name: 'XLM transfer Stellar to Base',
      sourceChain: 'Stellar',
      destChain: 'Base',
      asset: 'XLM',
      amount: '10000.00',
      providers: ['AllBridge'],
      expectedLatencyMs: 2800,
      expectedFeeUsd: 0.30,
      tags: ['native', 'medium-value'],
    },
    {
      id: 'eth-stellar-usdc',
      name: 'USDC transfer Ethereum to Stellar',
      sourceChain: 'Ethereum',
      destChain: 'Stellar',
      asset: 'USDC',
      amount: '25000.00',
      providers: ['Squid', 'Wormhole'],
      expectedLatencyMs: 6700,
      expectedFeeUsd: 2.10,
      tags: ['stablecoin', 'high-value', 'eth'],
    },
    {
      id: 'polygon-stellar-usdt',
      name: 'USDT transfer Polygon to Stellar',
      sourceChain: 'Polygon',
      destChain: 'Stellar',
      asset: 'USDT',
      amount: '5000.00',
      providers: ['Stargate'],
      expectedLatencyMs: 3500,
      expectedFeeUsd: 0.60,
      tags: ['stablecoin', 'medium-value'],
    },
    {
      id: 'stellar-solana-usdc',
      name: 'USDC transfer Stellar to Solana',
      sourceChain: 'Stellar',
      destChain: 'Solana',
      asset: 'USDC',
      amount: '15000.00',
      providers: ['Wormhole'],
      expectedLatencyMs: 5100,
      expectedFeeUsd: 1.20,
      tags: ['stablecoin', 'high-value', 'solana'],
    },
    {
      id: 'stellar-eth-eth-small',
      name: 'Small ETH transfer Stellar to Ethereum',
      sourceChain: 'Stellar',
      destChain: 'Ethereum',
      asset: 'ETH',
      amount: '1.50',
      providers: ['AllBridge', 'Wormhole'],
      expectedLatencyMs: 4800,
      expectedFeeUsd: 3.50,
      tags: ['native', 'low-value', 'eth'],
    },
    {
      id: 'base-stellar-usdc',
      name: 'USDC transfer Base to Stellar',
      sourceChain: 'Base',
      destChain: 'Stellar',
      asset: 'USDC',
      amount: '8000.00',
      providers: ['AllBridge'],
      expectedLatencyMs: 3200,
      expectedFeeUsd: 0.90,
      tags: ['stablecoin', 'medium-value', 'l2'],
    },
  ],
};

function validateDataset(dataset: BenchmarkDataset): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const scenario of dataset.scenarios) {
    if (!scenario.id.trim()) errors.push('Scenario has empty id');
    if (ids.has(scenario.id)) errors.push(`Duplicate scenario id: ${scenario.id}`);
    ids.add(scenario.id);

    if (!scenario.name.trim()) errors.push(`Scenario "${scenario.id}" has empty name`);
    if (!scenario.sourceChain.trim()) errors.push(`Scenario "${scenario.id}" has empty sourceChain`);
    if (!scenario.destChain.trim()) errors.push(`Scenario "${scenario.id}" has empty destChain`);
    if (!scenario.asset.trim()) errors.push(`Scenario "${scenario.id}" has empty asset`);
    if (!scenario.amount.trim()) errors.push(`Scenario "${scenario.id}" has empty amount`);
    if (!scenario.providers || scenario.providers.length === 0) errors.push(`Scenario "${scenario.id}" has no providers`);
    if (scenario.expectedLatencyMs < 0) errors.push(`Scenario "${scenario.id}" has negative expectedLatencyMs`);
    if (scenario.expectedFeeUsd < 0) errors.push(`Scenario "${scenario.id}" has negative expectedFeeUsd`);
  }

  return errors;
}

function countByTag(dataset: BenchmarkDataset): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const scenario of dataset.scenarios) {
    for (const tag of scenario.tags) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  return counts;
}

const validationErrors = validateDataset(STELLAR_ROUTE_BENCHMARK_DATASET);
const tagCounts = countByTag(STELLAR_ROUTE_BENCHMARK_DATASET);

function printDatasetReport(): void {
  console.log(`Dataset: ${STELLAR_ROUTE_BENCHMARK_DATASET.name} v${STELLAR_ROUTE_BENCHMARK_DATASET.version}`);
  console.log(`Description: ${STELLAR_ROUTE_BENCHMARK_DATASET.description}`);
  console.log(`Total scenarios: ${STELLAR_ROUTE_BENCHMARK_DATASET.scenarios.length}`);
  console.log(`Validation errors: ${validationErrors.length === 0 ? 'None' : validationErrors.join(', ')}`);
  console.log('\nTag distribution:');
  for (const [tag, count] of Object.entries(tagCounts).sort()) {
    console.log(`  ${tag}: ${count} scenarios`);
  }
  console.log('\nScenarios:');
  for (const s of STELLAR_ROUTE_BENCHMARK_DATASET.scenarios) {
    console.log(`  [${s.id}] ${s.sourceChain} -> ${s.destChain} | ${s.amount} ${s.asset} | providers: ${s.providers.join(', ')}`);
  }
}

printDatasetReport();
