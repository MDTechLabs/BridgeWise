/**
 * Mock Bridge Adapter Examples
 *
 * This file demonstrates how to use the MockBridgeAdapter for local testing
 * and development without connecting to real bridge APIs.
 *
 * Run these examples:
 * ```bash
 * npx ts-node libs/bridge-core/src/adapters/mock.example.ts
 * ```
 */

import { MockBridgeAdapter, createMockAdapter } from './mock';
import { RouteRequest } from '../types';

// ============================================================================
// Example 1: Basic Usage
// ============================================================================

async function basicUsageExample() {
  console.log('\n=== Example 1: Basic Usage ===\n');

  // Create a mock adapter with default settings
  const adapter = new MockBridgeAdapter();

  // Initialize the adapter
  await adapter.initialize();

  console.log('Adapter Name:', adapter.getName());
  console.log('Is Ready:', adapter.isReady());

  // Fetch routes
  const request: RouteRequest = {
    sourceChain: 'ethereum',
    targetChain: 'polygon',
    assetAmount: '1000000000000000000', // 1 ETH
    tokenAddress: '0xA0b86a33E6441e6C7D3D4B4f6c7E8f9a0B1c2D3e',
    slippageTolerance: 0.5,
  };

  const routes = await adapter.fetchRoutes(request);
  console.log('\nFound Routes:', routes.length);

  if (routes.length > 0) {
    const route = routes[0];
    console.log('Route ID:', route.id);
    console.log('Provider:', route.provider);
    console.log('Input Amount:', route.inputAmount);
    console.log('Output Amount:', route.outputAmount);
    console.log('Fee:', route.fee);
    console.log('Fee Percentage:', route.feePercentage, '%');
    console.log('Estimated Time:', route.estimatedTime, 'seconds');
    console.log('Reliability:', route.reliability);
  }

  // Cleanup
  await adapter.shutdown();
}

// ============================================================================
// Example 2: Testing Different Scenarios
// ============================================================================

async function scenarioTestingExample() {
  console.log('\n=== Example 2: Scenario Testing ===\n');

  // Test different scenarios using the factory function
  const scenarios = ['happy-path', 'slow-network', 'unreliable', 'empty-routes'] as const;

  for (const scenario of scenarios) {
    console.log(`\n--- Testing ${scenario} scenario ---`);

    const adapter = createMockAdapter(scenario);
    await adapter.initialize();

    const startTime = Date.now();

    try {
      const routes = await adapter.fetchRoutes({
        sourceChain: 'ethereum',
        targetChain: 'polygon',
        assetAmount: '1000000000000000000',
      });

      const elapsed = Date.now() - startTime;
      console.log(`  Routes found: ${routes.length}`);
      console.log(`  Time elapsed: ${elapsed}ms`);
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.log(`  Time elapsed: ${elapsed}ms`);
    }

    await adapter.shutdown();
  }
}

// ============================================================================
// Example 3: Custom Configuration
// ============================================================================

async function customConfigurationExample() {
  console.log('\n=== Example 3: Custom Configuration ===\n');

  // Create adapter with custom settings
  const adapter = new MockBridgeAdapter({
    networkDelay: 500, // 500ms delay
    failureRate: 0.2, // 20% failure rate
    sandboxMode: true,
    supportedChainPairs: [
      ['ethereum', 'arbitrum'],
      ['arbitrum', 'ethereum'],
    ],
    supportedTokens: {
      ethereum: ['ETH', 'USDC', 'USDT'],
      arbitrum: ['ETH', 'USDC', 'USDT'],
      polygon: ['MATIC', 'USDC', 'USDT'],
      optimism: ['ETH', 'USDC', 'USDT'],
      base: ['ETH', 'USDC', 'USDT'],
      gnosis: ['XDAI', 'USDC', 'USDT'],
      nova: ['ETH', 'USDC'],
      stellar: ['native', 'USDC', 'USDT'],
      bsc: ['BNB', 'USDC', 'USDT'],
      avalanche: ['AVAX', 'USDC', 'USDT'],
    },
  });

  await adapter.initialize();

  // Test supported chain
  console.log('Supports ethereum -> arbitrum:', adapter.supportsChainPair('ethereum', 'arbitrum'));
  console.log('Supports ethereum -> polygon:', adapter.supportsChainPair('ethereum', 'polygon'));

  // Get supported tokens
  const ethTokens = await adapter.getSupportedTokens('ethereum');
  console.log('Ethereum tokens:', ethTokens);

  // Get token mapping
  const mapping = await adapter.getTokenMapping('ethereum', 'arbitrum', 'USDC');
  console.log('Token Mapping:', mapping);

  await adapter.shutdown();
}

// ============================================================================
// Example 4: Custom Responses
// ============================================================================

async function customResponsesExample() {
  console.log('\n=== Example 4: Custom Responses ===\n');

  // Create adapter with custom responses
  const adapter = new MockBridgeAdapter({
    customResponses: {
      routes: [
        {
          id: 'custom-route-001',
          provider: 'hop',
          sourceChain: 'ethereum',
          targetChain: 'polygon',
          inputAmount: '1000000000000000000',
          outputAmount: '995000000000000000',
          fee: '5000000000000000',
          feePercentage: 0.5,
          estimatedTime: 300,
          reliability: 0.99,
          minAmountOut: '990000000000000000',
          maxAmountOut: '995000000000000000',
          deadline: Math.floor(Date.now() / 1000) + 3600,
          transactionData: {
            contractAddress: '0xCustomContract',
            calldata: '0xCustomCalldata',
            value: '0',
            gasEstimate: '150000',
          },
          metadata: {
            description: 'Custom mock route',
            riskLevel: 1,
          },
        },
      ],
      fees: {
        total: '5000000000000000',
        percentage: 0.5,
        breakdown: {
          network: '2000000000000000',
          protocol: '2000000000000000',
          slippage: '1000000000000000',
        },
        currency: 'ETH',
        lastUpdated: Date.now(),
      },
      health: {
        healthy: true,
        uptime: 99.99,
        message: 'Custom health status',
      },
    },
  });

  await adapter.initialize();

  // Fetch custom routes
  const routes = await adapter.fetchRoutes({
    sourceChain: 'ethereum',
    targetChain: 'polygon',
    assetAmount: '1000000000000000000',
  });

  console.log('Custom Route ID:', routes[0]?.id);
  console.log('Custom Route Description:', routes[0]?.metadata?.description);

  // Get custom fee
  const fee = await adapter.getNormalizedFee('ethereum', 'polygon');
  console.log('Custom Fee Total:', fee.total);

  // Get custom health
  const health = await adapter.getHealth();
  console.log('Custom Health Message:', health.message);

  await adapter.shutdown();
}

// ============================================================================
// Example 5: Runtime Configuration Updates
// ============================================================================

async function runtimeUpdatesExample() {
  console.log('\n=== Example 5: Runtime Configuration Updates ===\n');

  const adapter = new MockBridgeAdapter();
  await adapter.initialize();

  // Initial state - should return routes
  console.log('Initial request:');
  const routes1 = await adapter.fetchRoutes({
    sourceChain: 'ethereum',
    targetChain: 'polygon',
    assetAmount: '1000000000000000000',
  });
  console.log(`  Routes: ${routes1.length}`);

  // Update to return empty routes
  console.log('\nAfter updating to empty routes:');
  adapter.updateConfig({
    customResponses: { routes: [] },
  });

  const routes2 = await adapter.fetchRoutes({
    sourceChain: 'ethereum',
    targetChain: 'polygon',
    assetAmount: '1000000000000000000',
  });
  console.log(`  Routes: ${routes2.length}`);

  // Update to simulate failures
  console.log('\nAfter updating to simulate failures:');
  adapter.updateConfig({ failureRate: 1 });

  try {
    await adapter.fetchRoutes({
      sourceChain: 'ethereum',
      targetChain: 'polygon',
      assetAmount: '1000000000000000000',
    });
  } catch (error) {
    console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }

  await adapter.shutdown();
}

// ============================================================================
// Example 6: Unit Testing Pattern
// ============================================================================

async function unitTestingPatternExample() {
  console.log('\n=== Example 6: Unit Testing Pattern ===\n');

  // This example shows how to use the mock adapter in unit tests

  // Create a test helper function
  async function testBridgeService(adapter: MockBridgeAdapter) {
    await adapter.initialize();

    const health = await adapter.getHealth();
    if (!health.healthy) {
      throw new Error('Adapter not healthy');
    }

    const routes = await adapter.fetchRoutes({
      sourceChain: 'ethereum',
      targetChain: 'polygon',
      assetAmount: '1000000000000000000',
    });

    return routes.length > 0;
  }

  // Test with happy path
  console.log('Testing with happy-path adapter:');
  const happyAdapter = createMockAdapter('happy-path');
  const happyResult = await testBridgeService(happyAdapter);
  console.log(`  Service available: ${happyResult}`);
  await happyAdapter.shutdown();

  // Test with unreliable adapter
  console.log('\nTesting with unreliable adapter (may fail):');
  const unreliableAdapter = createMockAdapter('unreliable');

  try {
    const unreliableResult = await testBridgeService(unreliableAdapter);
    console.log(`  Service available: ${unreliableResult}`);
  } catch (error) {
    console.log(`  Service failed: ${error instanceof Error ? error.message : 'Unknown'}`);
  }

  await unreliableAdapter.shutdown();
}

// ============================================================================
// Main execution
// ============================================================================

async function runAllExamples() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       Mock Bridge Adapter - Usage Examples                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await basicUsageExample();
    await scenarioTestingExample();
    await customConfigurationExample();
    await customResponsesExample();
    await runtimeUpdatesExample();
    await unitTestingPatternExample();

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║              All examples completed!                       ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('Error running examples:', error);
    process.exit(1);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples();
}

export { runAllExamples };
