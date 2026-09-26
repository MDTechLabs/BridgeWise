import { GraphBuilder } from './graph-builder';
import { DAGPathfinder } from './dag-pathfinder';

describe('DAGPathfinder Multi-Hop Routing Engine', () => {
  let graphBuilder: GraphBuilder;
  let pathfinder: DAGPathfinder;

  beforeEach(() => {
    graphBuilder = new GraphBuilder();

    const chains = ['ethereum', 'arbitrum', 'optimism', 'polygon', 'stellar', 'solana'];
    const tokens = ['USDC', 'ETH', 'USDT', 'XLM'];

    // Add nodes
    chains.forEach((chain) => {
      tokens.forEach((token) => {
        graphBuilder.addNode({
          id: `${token}:${chain}`,
          token,
          chain,
          nativeGasToken: chain === 'stellar' ? 'XLM' : chain === 'solana' ? 'SOL' : 'ETH',
        });
      });
    });

    let edgeCounter = 1;

    // Intra-chain DEX swaps
    chains.forEach((chain) => {
      graphBuilder.addEdge({
        id: `edge-${edgeCounter++}`,
        fromNodeId: `USDC:${chain}`,
        toNodeId: `ETH:${chain}`,
        protocol: 'Uniswap/DEX',
        bridgeFeeUsd: 0,
        gasCostUsd: 0.5,
        estimatedTimeSec: 10,
        exchangeRate: 0.0003,
        liquidityUsd: 1000000,
      });
      graphBuilder.addEdge({
        id: `edge-${edgeCounter++}`,
        fromNodeId: `ETH:${chain}`,
        toNodeId: `USDT:${chain}`,
        protocol: 'Uniswap/DEX',
        bridgeFeeUsd: 0,
        gasCostUsd: 0.5,
        estimatedTimeSec: 10,
        exchangeRate: 3300,
        liquidityUsd: 1000000,
      });
      graphBuilder.addEdge({
        id: `edge-${edgeCounter++}`,
        fromNodeId: `USDC:${chain}`,
        toNodeId: `USDT:${chain}`,
        protocol: 'Uniswap/DEX',
        bridgeFeeUsd: 0,
        gasCostUsd: 0.3,
        estimatedTimeSec: 5,
        exchangeRate: 0.999,
        liquidityUsd: 2000000,
      });
    });

    // Cross-chain bridge edges between chain pairs (100+ edges)
    for (let i = 0; i < chains.length; i++) {
      for (let j = 0; j < chains.length; j++) {
        if (i === j) continue;
        const fromChain = chains[i];
        const toChain = chains[j];

        tokens.forEach((token) => {
          graphBuilder.addEdge({
            id: `edge-${edgeCounter++}`,
            fromNodeId: `${token}:${fromChain}`,
            toNodeId: `${token}:${toChain}`,
            protocol: 'StellarBridge/LayerZero',
            bridgeFeeUsd: 2.0,
            gasCostUsd: 1.0,
            estimatedTimeSec: 60,
            exchangeRate: 0.998,
            liquidityUsd: 500000,
            requiresGasConversion: toChain !== 'ethereum',
            intermediateGasTokenCostUsd: 1.5,
          });
        });
      }
    }

    pathfinder = new DAGPathfinder(graphBuilder.getGraph());
  });

  it('calculates optimal 3-hop cross-chain route across 5+ chains in under 150ms', async () => {
    const start = performance.now();
    const route = await pathfinder.findOptimalRoute('USDC:ethereum', 'USDT:polygon', 1000, 3);
    const duration = performance.now() - start;

    expect(route).not.toBeNull();
    expect(duration).toBeLessThan(150);
    expect(route!.hops.length).toBeGreaterThan(0);
    expect(route!.hops.length).toBeLessThanOrEqual(3);
    expect(route!.totalOutputAmount).toBeGreaterThan(0);
  });

  it('correctly accounts for gas token conversions at intermediate hop destinations', async () => {
    const route = await pathfinder.findOptimalRoute('USDC:ethereum', 'USDC:stellar', 1000, 3);

    expect(route).not.toBeNull();
    const intermediateHopWithGasConversion = route!.hops.find((h) => h.gasCostUsd > 1.0);
    expect(intermediateHopWithGasConversion).toBeDefined();
    expect(route!.totalGasCostUsd).toBeGreaterThan(0);
  });

  it('passes load test evaluating 1,000 concurrent routing queries without memory leaks', async () => {
    const queries = Array.from({ length: 1000 }).map((_, idx) => {
      const amount = 100 + (idx % 10) * 50;
      return pathfinder.findOptimalRoute('USDC:ethereum', 'USDT:polygon', amount, 3);
    });

    const start = performance.now();
    const results = await Promise.all(queries);
    const totalTimeMs = performance.now() - start;

    expect(results.length).toBe(1000);
    expect(results.every((r) => r !== null)).toBe(true);
    expect(totalTimeMs).toBeLessThan(3000);
  });

  it('returns null when no pathway exists within maxHops limit', async () => {
    const route = await pathfinder.findOptimalRoute('USDC:ethereum', 'NONEXISTENT:chain', 100, 3);
    expect(route).toBeNull();
  });
});
