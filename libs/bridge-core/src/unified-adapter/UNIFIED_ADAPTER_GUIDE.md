# Unified Bridge Adapter Interface

Complete guide for implementing and using the Unified Bridge Adapter Interface in BridgeWise.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Concepts](#core-concepts)
4. [Implementation Guide](#implementation-guide)
5. [Token Registry](#token-registry)
6. [Adapter Factory](#adapter-factory)
7. [Fee Normalization](#fee-normalization)
8. [Error Handling](#error-handling)
9. [Examples](#examples)
10. [Best Practices](#best-practices)

## Overview

The Unified Bridge Adapter Interface provides a standardized way to integrate any blockchain bridge into BridgeWise. It abstracts away bridge-specific complexities while enabling:

- **Plug-and-play integration** - Add new bridges with minimal code
- **Standardized data** - Normalized fees, token mappings, and routes
- **Type safety** - Full TypeScript support
- **Extensibility** - Custom implementations for bridge-specific features
- **Easy testing** - Mock adapters and in-memory registries

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Application Layer                          │
│         (Wallets, dApps, Analytics)                    │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│         Bridge Route Aggregator                         │
│    (Queries all adapters & ranks routes)               │
└────────────────────┬────────────────────────────────────┘
                     │
       ┌─────────────┼─────────────┐
       │             │             │
┌──────▼──────┐ ┌────▼─────┐ ┌────▼──────┐
│   Adapter   │ │  Adapter │ │  Adapter  │
│  (Stellar)  │ │ (LayerZero)│ (Hop)    │
└──────┬──────┘ └────┬─────┘ └────┬──────┘
       │             │             │
       └─────────────┼─────────────┘
                     │
    ┌────────────────┴────────────────┐
    │                                  │
┌───▼──────────┐            ┌─────────▼──────┐
│ Token        │            │  Fee           │
│ Registry     │            │ Normalizer     │
└──────────────┘            └────────────────┘
```

## Core Concepts

### BridgeAdapter Interface

All bridge implementations must implement the `BridgeAdapter` interface:

```typescript
interface BridgeAdapter {
  // Identification
  readonly provider: BridgeProvider;
  getName(): string;

  // Chain Support
  supportsChainPair(sourceChain: ChainId, targetChain: ChainId): boolean;
  getSupportedSourceChains(): ChainId[];
  getSupportedDestinationChains(sourceChain: ChainId): ChainId[];

  // Token Support
  supportsTokenPair(
    sourceChain: ChainId,
    targetChain: ChainId,
    sourceToken: string,
    destinationToken: string
  ): Promise<boolean>;
  getTokenMapping(...): Promise<BridgeTokenMapping | null>;
  getSupportedTokens(chain: ChainId): Promise<string[]>;

  // Route Discovery
  fetchRoutes(request: RouteRequest): Promise<BridgeRoute[]>;
  getNormalizedFee(...): Promise<NormalizedFee>;

  // Lifecycle
  initialize?(): Promise<void>;
  shutdown?(): Promise<void>;
  isReady(): boolean;
  getHealth(): Promise<HealthStatus>;
}
```

### Token Mapping

Each bridge can map tokens differently across chains. The registry handles:

```typescript
interface BridgeTokenMapping {
  sourceToken: string;           // Source chain token
  destinationToken: string;      // Destination chain token
  sourceDecimals: number;        // Source chain decimals
  destinationDecimals: number;   // Destination chain decimals
  conversionMultiplier: string;  // Decimal-adjusted multiplier
  isSupported: boolean;
  minAmount?: string;            // Minimum bridgeable amount
  maxAmount?: string;            // Maximum bridgeable amount
  bridgeTokenId?: string;        // Bridge-specific ID
}
```

### Normalized Fees

All fees are standardized through the `NormalizedFee` interface:

```typescript
interface NormalizedFee {
  total: string;                 // Total fee in smallest unit
  percentage: number;            // Fee as percentage (0-100)
  breakdown?: {
    network?: string;            // Network/gas fee
    protocol?: string;           // Bridge protocol fee
    slippage?: string;          // Slippage fee
  };
  lastUpdated: number;          // Timestamp
}
```

## Implementation Guide

### Step 1: Create Your Bridge Adapter

```typescript
import { BaseBridgeAdapter, BridgeAdapterConfig } from '@bridgewise/bridge-core';
import { BridgeRoute, RouteRequest, ChainId } from '@bridgewise/bridge-core';

export class MyBridgeAdapter extends BaseBridgeAdapter {
  readonly provider = 'mybridge'; // Unique identifier
  
  constructor(config: BridgeAdapterConfig) {
    super(config);
  }

  getName(): string {
    return 'My Awesome Bridge';
  }

  supportsChainPair(
    sourceChain: ChainId,
    targetChain: ChainId
  ): boolean {
    // Implement your chain support logic
    const supportedChains = ['ethereum', 'polygon', 'arbitrum'];
    return (
      supportedChains.includes(sourceChain) &&
      supportedChains.includes(targetChain)
    );
  }

  async fetchRoutes(request: RouteRequest): Promise<BridgeRoute[]> {
    // Validate support
    this.validateChainPair(request.sourceChain, request.targetChain);

    try {
      // Call your bridge API
      const quote = await fetch(`/api/quote?...`);
      
      // Transform to standardized format
      return [{
        id: this.generateRouteId(request.sourceChain, request.targetChain, 0),
        provider: this.provider,
        sourceChain: request.sourceChain,
        targetChain: request.targetChain,
        inputAmount: request.assetAmount,
        outputAmount: quote.outputAmount,
        fee: quote.fee,
        feePercentage: this.calculateFeePercentage(
          request.assetAmount,
          quote.outputAmount
        ),
        estimatedTime: this.estimateBridgeTime(
          request.sourceChain,
          request.targetChain
        ),
        reliability: 0.95,
        minAmountOut: quote.minAmountOut,
        maxAmountOut: quote.maxAmountOut,
      }];
    } catch (error) {
      this.handleApiError(error, 'fetchRoutes');
    }
  }

  async getNormalizedFee(
    sourceChain: ChainId,
    targetChain: ChainId,
    tokenAddress?: string,
    amount?: string
  ) {
    // Fetch and normalize fee data
    const fee = await fetch(`/api/fee?...`);
    return {
      total: fee.totalFee,
      percentage: this.calculateFeePercentage(amount || '1000000000000000000', fee.outputAmount),
      breakdown: {
        protocol: fee.protocolFee,
        network: fee.gasFee,
      },
      lastUpdated: Date.now(),
    };
  }

  getSupportedSourceChains(): ChainId[] {
    return ['ethereum', 'polygon', 'arbitrum'];
  }

  getSupportedDestinationChains(sourceChain: ChainId): ChainId[] {
    // Return available destinations for this source chain
    return ['ethereum', 'polygon', 'arbitrum'].filter(c => c !== sourceChain);
  }

  async getSupportedTokens(chain: ChainId): Promise<string[]> {
    // Return tokens supported on this chain
    return ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'];
  }

  async initialize(): Promise<void> {
    // Optional: Initialize resources
    // This is called before the adapter is used
    this._isReady = true;
  }

  async shutdown(): Promise<void> {
    // Optional: Cleanup resources
    this._isReady = false;
  }
}
```

### Step 2: Configure Your Adapter

```typescript
import { getAdapterFactory, BridgeAdapterConfig } from '@bridgewise/bridge-core';

const config: BridgeAdapterConfig = {
  provider: 'mybridge',
  name: 'My Awesome Bridge',
  endpoints: {
    primary: 'https://api.mybridge.com',
    fallback: 'https://fallback.mybridge.com',
    rpc: 'https://rpc.ethereum.org',
  },
  timeout: 30000,
  retry: {
    attempts: 3,
    initialDelayMs: 1000,
    backoffMultiplier: 2,
  },
  rateLimit: {
    requestsPerSecond: 100,
    windowMs: 1000,
  },
  auth: {
    apiKey: process.env.MYBRIDGE_API_KEY,
  },
  metadata: {
    version: '1.0.0',
  },
};

// Register your adapter
const factory = getAdapterFactory();
factory.registerAdapter('mybridge', MyBridgeAdapter, config);
```

### Step 3: Use Your Adapter

```typescript
// Get your adapter
const adapter = factory.getAdapter('mybridge');

// Initialize if needed
if (adapter.initialize) {
  await adapter.initialize();
}

// Query routes
const routes = await adapter.fetchRoutes({
  sourceChain: 'ethereum',
  targetChain: 'polygon',
  assetAmount: '1000000000000000000', // 1 ETH in wei
  slippageTolerance: 0.5,
});

console.log(`Found ${routes.length} routes`);
```

## Token Registry

Register tokens and their cross-chain mappings:

```typescript
import { TokenRegistry } from '@bridgewise/bridge-core';

const registry = new TokenRegistry();

// Register a token
await registry.registerToken({
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  chain: 'ethereum',
  coingeckoId: 'usd-coin',
});

// Register token mapping for a bridge
await registry.registerMapping({
  sourceToken: { /* USDC on Ethereum */ },
  destinationToken: { /* USDC on Polygon */ },
  provider: 'hop',
  isActive: true,
  conversionRate: '1000000000000000000', // 1:1
  minAmount: '100000000', // 100 USDC minimum
  maxAmount: '1000000000000000', // 1M USDC maximum
  bridgeTokenId: 'usdc_hop_eth_polygon',
});

// Query mappings
const mapping = await registry.getMapping(
  'ethereum',
  'polygon',
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  'hop'
);

// Check if token is bridgeable
const isBridgeable = await registry.isBridgeable(
  'ethereum',
  'arbitrum',
  'USDC',
  'layerzero'
);
```

## Adapter Factory

Manage multiple adapters centrally:

```typescript
import { getAdapterFactory, AdapterFactory } from '@bridgewise/bridge-core';

const factory = getAdapterFactory();

// Register multiple adapters
factory.registerAdaptersBatch([
  { provider: 'hop', adapter: HopAdapter, config: hopConfig },
  { provider: 'layerzero', adapter: LayerZeroAdapter, config: lzConfig },
  { provider: 'mybridge', adapter: MyBridgeAdapter, config: myConfig },
]);

// Initialize all
await factory.initializeAll();

// Get adapters for specific chain pair
const supportedAdapters = factory.getAdaptersForChainPair('ethereum', 'polygon');
console.log(`${supportedAdapters.length} adapters support Ethereum<->Polygon`);

// Get all adapters
const allAdapters = factory.getAllAdapters();
for (const [provider, adapter] of allAdapters) {
  console.log(`${provider}: ${adapter.getName()}`);
}

// Shutdown gracefully
await factory.shutdownAll();
```

## Fee Normalization

Standardize and analyze fees across bridges:

```typescript
import { FeeNormalizer } from '@bridgewise/bridge-core';

// Get fees for a route
const route1 = await adapter1.fetchRoutes(request);
const route2 = await adapter2.fetchRoutes(request);

// Normalize fees
const normalizedFees = FeeNormalizer.normalizeRoutes [
  ...route1,
  ...route2
];

// Find best route by fee
const bestByFee = FeeNormalizer.normalizeRoutesByFees([...route1, ...route2])[0];

// Compare fees
const comparison = FeeNormalizer.calculateFeeSavings(bestByFee, normalizedFees[1]);
console.log(`Save ${comparison.percentageSavings}% (${comparison.absoluteSavings} units)`);

// Calculate average fee
const avgFee = FeeNormalizer.calculateAverageFee([...route1, ...route2]);
console.log(`Average fee: ${avgFee}`);

// Group routes by fee range
const byFeeRange = FeeNormalizer.groupRoutesByFeeRange([...route1, ...route2], 5);
for (const [range, routes] of byFeeRange) {
  console.log(`${range}: ${routes.length} routes`);
}
```

## Error Handling

Standardized error handling across all adapters:

```typescript
import { AdapterError, ADAPTER_ERRORS, AdapterErrorCode } from '@bridgewise/bridge-core';

try {
  const routes = await adapter.fetchRoutes(request);
} catch (error) {
  if (error instanceof AdapterError) {
    switch (error.code) {
      case AdapterErrorCode.UNSUPPORTED_CHAIN_PAIR:
        console.error('Bridge does not support this chain pair');
        break;
      case AdapterErrorCode.RATE_LIMITED:
        console.error('Bridge API is rate limited, will retry');
        const retryAfter = error.details?.retryAfter || 60;
        setTimeout(() => { /* retry */ }, retryAfter * 1000);
        break;
      case AdapterErrorCode.INSUFFICIENT_LIQUIDITY:
        console.error('Not enough liquidity for this bridge route');
        break;
      case AdapterErrorCode.TIMEOUT:
        console.error('Bridge API timeout, trying fallback endpoint');
        break;
      default:
        console.error(`Adapter error: ${error.message}`);
    }
  }
}
```

## Examples

### Complete Bridge Integration

See [bridge-adapter-example.ts](./examples/bridge-adapter-example.ts) for a complete example of integrating a new bridge.

### Using with Route Aggregation

```typescript
import { getAdapterFactory, RouteRanker } from '@bridgewise/bridge-core';

async function findBestRoute(sourceChain, targetChain, amount) {
  const factory = getAdapterFactory();
  const adapters = factory.getAdaptersForChainPair(sourceChain, targetChain);

  // Fetch routes from all adapters
  const allRoutes = await Promise.all(
    adapters.map(adapter => adapter.fetchRoutes({
      sourceChain,
      targetChain,
      assetAmount: amount,
      slippageTolerance: 0.5,
    }))
  );

  const routes = allRoutes.flat();

  // Rank routes
  const ranker = new RouteRanker({
    costWeight: 0.5,
    latencyWeight: 0.3,
    reliabilityWeight: 0.2,
  });

  const ranked = ranker.rankRoutes(routes);
  
  return ranked[0]; // Best route
}

// Usage
const bestRoute = await findBestRoute('ethereum', 'polygon', '1000000000000000000');
console.log(`Best route: ${bestRoute.provider} with ${bestRoute.feePercentage}% fee`);
```

## Best Practices

### 1. **Configuration Management**
- Store sensitive data (API keys) in environment variables
- Use different configurations for dev/staging/prod
- Validate configuration on startup

### 2. **Error Handling**
- Always catch `AdapterError` exceptions
- Implement proper retry logic with exponential backoff
- Log errors with full context for debugging

### 3. **Performance**
- Cache adapter instances using the factory
- Implement circuit breakers for failing bridges
- Use timeouts to prevent hanging requests

### 4. **Testing**
- Create mock adapters that return test routes
- Use in-memory token registry for tests
- Mock external API calls

### 5. **Token Mappings**
- Keep mappings up-to-date
- Validate mappings on adapter initialization
- Support symbol-based and address-based token queries

### 6. **Fee Accuracy**
- Always fetch fresh fees from bridge APIs when possible
- Cache fees with appropriate TTL
- Handle dynamic fee updates

### 7. **Chain Support**
- Explicitly declare supported chains
- Validate chain pairs before API calls
- Provide clear error messages for unsupported pairs

## Troubleshooting

### Adapter Not Found
```typescript
// Error: Adapter not registered
const factory = getAdapterFactory();
console.log(factory.getRegisteredProviders()); // Check registered adapters
```

### Token Not in Registry
```typescript
// Manually register missing token
await registry.registerToken({
  symbol: 'TOKEN',
  name: 'Token Name',
  decimals: 18,
  address: '0x...',
  chain: 'ethereum',
});
```

### Rate Limiting
```typescript
// Implement backoff
catch (error) {
  if (error.code === AdapterErrorCode.RATE_LIMITED) {
    const delayMs = (error.details?.retryAfter || 1) * 1000;
    await new Promise(resolve => setTimeout(resolve, delayMs));
    // retry request
  }
}
```

## Additional Resources

- [API Documentation](../API_DOCUMENTATION.md)
- [Error Handling Guide](../API_ERRORS.md)
- [Fee Structure](../FEE_SLIPPAGE_BENCHMARKING.md)
- [Implementation Examples](./examples/)
