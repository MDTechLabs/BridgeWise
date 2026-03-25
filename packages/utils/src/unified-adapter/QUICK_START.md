# Quick Start Guide - Unified Bridge Adapter

Get started with the BridgeWise Unified Bridge Adapter Interface in minutes.

## 5-Minute Quick Start

### 1. Install (if using as separate package)

```bash
npm install @bridgewise/bridge-core
```

### 2. Basic Setup

```typescript
import { getAdapterFactory, AdapterFactory } from '@bridgewise/bridge-core';

// Get the factory
const factory = getAdapterFactory();

// Check registered adapters
console.log(factory.getRegisteredProviders());
// Output: ['hop', 'layerzero', 'stellar', ...]
```

### 3. Query Routes

```typescript
import { getAdapterFactory } from '@bridgewise/bridge-core';

const factory = getAdapterFactory();

// Get adapters supporting this chain pair
const adapters = factory.getAdaptersForChainPair('ethereum', 'polygon');

// Fetch routes
const routes = await adapters[0].fetchRoutes({
  sourceChain: 'ethereum',
  targetChain: 'polygon',
  assetAmount: '1000000000000000000', // 1 ETH in wei
  slippageTolerance: 0.5,
});

// Show results
routes.forEach(route => {
  console.log(`Fee: ${route.feePercentage}% | Time: ${route.estimatedTime}s`);
});
```

## 10-Minute Integration

### Comparing Multiple Bridges

```typescript
import { FeeNormalizer } from '@bridgewise/bridge-core';

async function findBestRoute(sourceChain, targetChain, amount) {
  const factory = getAdapterFactory();
  const adapters = factory.getAdaptersForChainPair(sourceChain, targetChain);

  // Fetch from all adapters
  const allRoutes = await Promise.all(
    adapters.map(adapter => adapter.fetchRoutes({
      sourceChain,
      targetChain,
      assetAmount: amount,
    }))
  );

  const routes = allRoutes.flat();

  // Sort by fee (cheapest first)
  const cheapest = FeeNormalizer.normalizeRoutesByFees(routes)[0];

  return cheapest;
}

// Use it
const route = await findBestRoute('ethereum', 'polygon', '1000000000000000000');
console.log(`Cheapest: ${route.provider} (${route.feePercentage}% fee)`);
```

### Token Mapping Lookup

```typescript
import { TokenRegistry } from '@bridgewise/bridge-core';

const registry = new TokenRegistry();

// Register USDC on Ethereum
await registry.registerToken({
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  chain: 'ethereum',
});

// Register USDC on Polygon
await registry.registerToken({
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  chain: 'polygon',
});

// Check if bridgeable
const supported = await registry.isBridgeable(
  'ethereum',
  'polygon',
  'USDC',
  'hop'
);

console.log(`Hop supports USDC bridge: ${supported}`);
```

## Building Your Own Bridge Adapter

### 1. Create Adapter Class

```typescript
import { BaseBridgeAdapter, BridgeRoute, RouteRequest, ChainId } from '@bridgewise/bridge-core';

export class MyBridgeAdapter extends BaseBridgeAdapter {
  readonly provider = 'mybridge';

  getName(): string {
    return 'My Bridge Protocol';
  }

  supportsChainPair(sourceChain: ChainId, targetChain: ChainId): boolean {
    const chains = ['ethereum', 'polygon', 'arbitrum'];
    return chains.includes(sourceChain) && chains.includes(targetChain);
  }

  async fetchRoutes(request: RouteRequest): Promise<BridgeRoute[]> {
    // Your bridge logic here
    return [{
      id: this.generateRouteId(request.sourceChain, request.targetChain, 0),
      provider: this.provider,
      sourceChain: request.sourceChain,
      targetChain: request.targetChain,
      inputAmount: request.assetAmount,
      outputAmount: '990000000000000000', // After 1% fee
      fee: '10000000000000000',
      feePercentage: 1.0,
      estimatedTime: 180,
      reliability: 0.95,
      minAmountOut: '980000000000000000',
      maxAmountOut: '990000000000000000',
    }];
  }

  getSupportedSourceChains(): ChainId[] {
    return ['ethereum', 'polygon', 'arbitrum'];
  }

  getSupportedDestinationChains(sourceChain: ChainId): ChainId[] {
    return this.getSupportedSourceChains().filter(c => c !== sourceChain);
  }

  async getSupportedTokens(chain: ChainId): Promise<string[]> {
    // Return your supported tokens
    return ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48']; // USDC
  }
}
```

### 2. Register Your Adapter

```typescript
import { getAdapterFactory, BridgeAdapterConfig } from '@bridgewise/bridge-core';

const config: BridgeAdapterConfig = {
  provider: 'mybridge',
  name: 'My Bridge',
  endpoints: {
    primary: 'https://api.mybridge.io',
  },
  timeout: 30000,
};

const factory = getAdapterFactory();
factory.registerAdapter('mybridge', MyBridgeAdapter, config);

// Now you can use it!
const adapter = factory.getAdapter('mybridge');
console.log(adapter.getName()); // "My Bridge"
```

### 3. Initialize and Use

```typescript
// Initialize
await adapter.initialize();

// Check if ready
if (adapter.isReady()) {
  const routes = await adapter.fetchRoutes({
    sourceChain: 'ethereum',
    targetChain: 'polygon',
    assetAmount: '1000000000000000000',
  });

  console.log(`Found ${routes.length} routes`);
}

// Cleanup
await adapter.shutdown();
```

## Common Tasks

### Get All Adapters for a Chain Pair

```typescript
const adapters = factory.getAdaptersForChainPair('ethereum', 'polygon');
console.log(`${adapters.length} bridges support Ethereum→Polygon`);
```

### Check Adapter Status

```typescript
const health = await adapter.getHealth();
console.log(`Health: ${health.healthy ? '✅' : '❌'}`);
console.log(`Uptime: ${health.uptime}%`);
```

### Handle Errors Gracefully

```typescript
import { AdapterError, AdapterErrorCode } from '@bridgewise/bridge-core';

try {
  const routes = await adapter.fetchRoutes({...});
} catch (error) {
  if (error instanceof AdapterError) {
    if (error.code === AdapterErrorCode.RATE_LIMITED) {
      console.log('Rate limited, retrying later...');
    } else if (error.code === AdapterErrorCode.UNSUPPORTED_CHAIN_PAIR) {
      console.log('Chain pair not supported');
    }
  }
}
```

### Compare Fees Across Routes

```typescript
import { FeeNormalizer } from '@bridgewise/bridge-core';

// Get routes from multiple adapters
const routes = await Promise.all(
  adapters.map(a => a.fetchRoutes({...}))
).then(r => r.flat());

// Sort by fee
const sorted = FeeNormalizer.normalizeRoutesByFees(routes);

// Print fee comparison
sorted.forEach((route, i) => {
  console.log(`${i + 1}. ${route.provider}: ${route.feePercentage.toFixed(3)}%`);
});

// Calculate savings
if (sorted.length > 1) {
  const savings = FeeNormalizer.calculateFeeSavings(sorted[0], sorted[1]);
  console.log(`Savings: ${savings.percentageSavings.toFixed(2)}%`);
}
```

### Batch Register Tokens

```typescript
import { TokenRegistry } from '@bridgewise/bridge-core';

const registry = new TokenRegistry();

const tokens = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    chain: 'ethereum' as const,
  },
  {
    symbol: 'USDT',
    name: 'Tether',
    decimals: 6,
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    chain: 'ethereum' as const,
  },
];

await registry.registerTokensBatch(tokens);
console.log('✅ Tokens registered');
```

## Troubleshooting

### Problem: Adapter not found

```typescript
// Check if registered
if (!factory.hasAdapter('mybridge')) {
  console.log('Adapter not registered!');
  console.log('Registered:', factory.getRegisteredProviders());
}
```

### Problem: Routes not returning

```typescript
// Check adapter support
const supports = adapter.supportsChainPair('ethereum', 'polygon');
console.log(`Supports chain pair: ${supports}`);

// Check if ready
console.log(`Adapter ready: ${adapter.isReady()}`);

// Check health
const health = await adapter.getHealth();
console.log(`Health: ${health.healthy}, Message: ${health.message}`);
```

### Problem: API timeout

```typescript
// Increase timeout in config
const config = factory.getAdapterConfig('mybridge');
config.timeout = 60000; // 60 seconds
factory.updateAdapterConfig('mybridge', config);
```

### Problem: Rate limiting

```typescript
// Handle retry after
try {
  await adapter.fetchRoutes({...});
} catch (error) {
  if (error instanceof AdapterError && error.code === AdapterErrorCode.RATE_LIMITED) {
    const retryAfter = error.details?.retryAfter || 60;
    console.log(`Retry after ${retryAfter} seconds`);
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    // retry...
  }
}
```

## Next Steps

- Read the [Full Guide](./UNIFIED_ADAPTER_GUIDE.md)
- Check [API Reference](./API_REFERENCE.md)
- Review [Examples](./examples.ts)
- Look at existing adapters: `libs/bridge-core/src/adapters/`

## Performance Tips

1. **Cache adapters** - Use the factory to cache instances
2. **Batch requests** - Use `Promise.all()` for parallel adapter calls
3. **Fee caching** - Cache normalized fees with appropriate TTL
4. **Token registry** - Use registry for fast token lookups

## Resources

- [BridgeWise Documentation](../../docs/README.md)
- [API Documentation](../../docs/API_DOCUMENTATION.md)
- [Error Handling](../../docs/API_ERRORS.md)
