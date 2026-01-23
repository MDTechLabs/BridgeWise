/**
 * Example usage of @bridgewise/bridge-core
 * 
 * This file demonstrates how to use the bridge aggregation library
 * to fetch and compare routes from multiple bridge providers.
 */

import { getBridgeRoutes, BridgeAggregator, BridgeValidator } from './index';

/**
 * Example 1: Simple route discovery
 */
async function exampleSimple() {
  console.log('=== Example 1: Simple Route Discovery ===\n');
  
  const routes = await getBridgeRoutes({
    sourceChain: 'ethereum',
    targetChain: 'polygon',
    assetAmount: '1000000000000000000', // 1 ETH in wei
    slippageTolerance: 0.5,
  });
  
  console.log(`Found ${routes.routes.length} routes from ${routes.providersResponded}/${routes.providersQueried} providers\n`);
  
  routes.routes.forEach((route, index) => {
    console.log(`Route ${index + 1}: ${route.provider}`);
    console.log(`  Fee: ${route.feePercentage}%`);
    console.log(`  Estimated Time: ${route.estimatedTime}s`);
    console.log(`  Output Amount: ${route.outputAmount}`);
    console.log(`  Min Amount Out: ${route.minAmountOut}`);
    console.log('');
  });
}

/**
 * Example 2: Validation before bridge execution
 */
async function exampleValidation() {
  console.log('=== Example 2: Validation Before Bridge Execution ===\n');
  
  const aggregator = new BridgeAggregator();
  const validator = new BridgeValidator();
  
  // Prepare execution request with user details
  const executionRequest = {
    sourceChain: 'ethereum' as const,
    targetChain: 'polygon' as const,
    assetAmount: '1000000000000000000', // 1 ETH
    walletAddress: '0x1234...',
    userBalance: '500000000000000000', // 0.5 ETH (insufficient)
    tokenAllowance: '0', // No allowance
    connectedChain: 'ethereum' as const,
  };
  
  // Validate the request before fetching routes
  const validationResult = aggregator.validateRequest(executionRequest);
  
  if (!validationResult.isValid) {
    console.log('Validation Failed:');
    validationResult.errors.forEach(error => {
      console.log(`  ❌ [${error.code}] ${error.message}`);
    });
  } else {
    console.log('✅ Validation passed! Safe to proceed with route fetching.');
  }
  
  if (validationResult.warnings.length > 0) {
    console.log('\nWarnings:');
    validationResult.warnings.forEach(warning => {
      console.log(`  ⚠️  [${warning.code}] ${warning.message}`);
    });
  }
}

/**
 * Example 3: Using the Aggregator class with custom configuration
 */
async function exampleAdvanced() {
  console.log('=== Example 3: Advanced Configuration ===\n');
  
  const aggregator = new BridgeAggregator({
    providers: {
      hop: true,
      layerzero: true,
      stellar: true,
    },
    layerZeroApiKey: process.env.LAYERZERO_API_KEY, // Optional
    timeout: 20000, // 20 seconds
  });
  
  const routes = await aggregator.getRoutes({
    sourceChain: 'stellar',
    targetChain: 'ethereum',
    assetAmount: '1000000000', // Amount in smallest unit
    tokenAddress: '0x...', // Optional token address
    slippageTolerance: 1.0,
    recipientAddress: '0x...', // Optional recipient
  });
  
  if (routes.routes.length > 0) {
    const bestRoute = routes.routes[0];
    console.log(`Best Route: ${bestRoute.provider}`);
    console.log(`  Fee: ${bestRoute.feePercentage}%`);
    console.log(`  Time: ${bestRoute.estimatedTime}s`);
    
    if (bestRoute.transactionData) {
      console.log(`  Contract: ${bestRoute.transactionData.contractAddress}`);
      console.log(`  Gas Estimate: ${bestRoute.transactionData.gasEstimate}`);
    }
  } else {
    console.log('No routes found');
  }
}

/**
 * Example 4: Validate selected route before execution
 */
async function exampleRouteValidation() {
  console.log('=== Example 4: Route Validation Before Execution ===\n');
  
  const aggregator = new BridgeAggregator();
  
  // Get routes
  const routes = await aggregator.getRoutes({
    sourceChain: 'ethereum',
    targetChain: 'polygon',
    assetAmount: '1000000000000000000',
  });
  
  if (routes.routes.length === 0) {
    console.log('No routes available');
    return;
  }
  
  const selectedRoute = routes.routes[0];
  const executionRequest = {
    sourceChain: 'ethereum' as const,
    targetChain: 'polygon' as const,
    assetAmount: '1000000000000000000',
    walletAddress: '0x1234...',
    userBalance: '2000000000000000000',
    tokenAllowance: '1000000000000000000',
    connectedChain: 'ethereum' as const,
  };
  
  // Validate the selected route
  const routeValidation = aggregator.validateRoute(selectedRoute, executionRequest);
  
  if (routeValidation.isValid) {
    console.log('✅ Route validated successfully!');
    console.log(`Provider: ${selectedRoute.provider}`);
    console.log(`Fee: ${selectedRoute.feePercentage}%`);
  } else {
    console.log('❌ Route validation failed:');
    routeValidation.errors.forEach(error => {
      console.log(`  [${error.code}] ${error.message}`);
    });
  }
}

/**
 * Example 5: Filtering routes by criteria
 */
async function exampleFiltering() {
  console.log('=== Example 5: Filtering Routes ===\n');
  
  const routes = await getBridgeRoutes({
    sourceChain: 'arbitrum',
    targetChain: 'optimism',
    assetAmount: '500000000000000000', // 0.5 ETH
  });
  
  // Filter routes with fee < 1%
  const lowFeeRoutes = routes.routes.filter(route => route.feePercentage < 1);
  console.log(`Routes with fee < 1%: ${lowFeeRoutes.length}`);
  
  // Filter routes with time < 5 minutes
  const fastRoutes = routes.routes.filter(route => route.estimatedTime < 300);
  console.log(`Routes faster than 5 minutes: ${fastRoutes.length}`);
  
  // Find route with highest output amount
  const bestOutputRoute = routes.routes.reduce((best, current) => {
    return BigInt(current.outputAmount) > BigInt(best.outputAmount) ? current : best;
  }, routes.routes[0]);
  
  console.log(`Best output route: ${bestOutputRoute.provider} with ${bestOutputRoute.outputAmount}`);
}

// Run examples (commented out to avoid execution during build)
// Uncomment to run:
// exampleSimple().catch(console.error);
// exampleValidation().catch(console.error);
// exampleAdvanced().catch(console.error);
// exampleRouteValidation().catch(console.error);
// exampleFiltering().catch(console.error);
