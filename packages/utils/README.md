# @bridgewise/bridge-core

Central aggregation logic for multi-chain bridge route discovery. Provides a unified interface to query routes from multiple bridge providers including Stellar/Soroban, LayerZero, and Hop Protocol.

## Features

- 🚀 **High Performance**: Parallel fetching from all bridge providers
- 🔄 **Unified Interface**: Single API for multiple bridge providers
- 📊 **Normalized Data**: Consistent route format across all providers
- ⚡ **Fast Aggregation**: Optimized sorting and comparison of routes
- 🛡️ **Error Handling**: Graceful degradation when providers fail

## Installation

```bash
npm install @bridgewise/bridge-core
# or
yarn add @bridgewise/bridge-core
```

## Quick Start

```typescript
import { getBridgeRoutes } from '@bridgewise/bridge-core';

const routes = await getBridgeRoutes({
  sourceChain: 'ethereum',
  targetChain: 'polygon',
  assetAmount: '1000000000000000000', // 1 ETH in wei
  slippageTolerance: 0.5
});

console.log(`Found ${routes.routes.length} routes`);
routes.routes.forEach(route => {
  console.log(`${route.provider}: ${route.feePercentage}% fee, ${route.estimatedTime}s`);
});
```

## Advanced Usage

### Using the Aggregator Class

```typescript
import { BridgeAggregator } from '@bridgewise/bridge-core';

const aggregator = new BridgeAggregator({
  providers: {
    hop: true,
    layerzero: true,
    stellar: true,
  },
  layerZeroApiKey: 'your-api-key', // Optional but recommended
  timeout: 15000, // 15 seconds
});

const routes = await aggregator.getRoutes({
  sourceChain: 'ethereum',
  targetChain: 'arbitrum',
  assetAmount: '1000000000000000000',
  tokenAddress: '0x...', // Optional: token contract address
  slippageTolerance: 0.5,
  recipientAddress: '0x...', // Optional
});
```

### Custom Adapters

```typescript
import { BridgeAggregator, BridgeAdapter } from '@bridgewise/bridge-core';

class CustomAdapter extends BaseBridgeAdapter {
  readonly provider = 'custom' as const;
  
  supportsChainPair(sourceChain: string, targetChain: string): boolean {
    // Your logic here
    return true;
  }
  
  async fetchRoutes(request: RouteRequest): Promise<BridgeRoute[]> {
    // Your implementation
    return [];
  }
  
  getName(): string {
    return 'Custom Bridge';
  }
}

const aggregator = new BridgeAggregator({
  adapters: [new CustomAdapter()],
});
```

## API Reference

### `getBridgeRoutes(request, config?)`

Main function to get aggregated bridge routes.

**Parameters:**

- `request.sourceChain`: Source chain identifier (e.g., 'ethereum', 'polygon')
- `request.targetChain`: Target chain identifier
- `request.assetAmount`: Amount to bridge (in smallest unit, e.g., wei)
- `request.tokenAddress?`: Optional token contract address
- `request.slippageTolerance?`: Optional slippage tolerance (0-100, default: 0.5)
- `request.recipientAddress?`: Optional recipient address

- `config.providers?`: Enable/disable specific providers
- `config.layerZeroApiKey?`: LayerZero API key for better quotes
- `config.timeout?`: Request timeout in milliseconds (default: 15000)

**Returns:**

```typescript
{
  routes: BridgeRoute[];
  timestamp: number;
  providersQueried: number;
  providersResponded: number;
}
```

### `BridgeRoute`

Unified route structure:

```typescript
{
  id: string;
  provider: 'stellar' | 'layerzero' | 'hop';
  sourceChain: ChainId;
  targetChain: ChainId;
  inputAmount: string;
  outputAmount: string;
  fee: string;
  feePercentage: number;
  estimatedTime: number; // seconds
  minAmountOut: string;
  maxAmountOut: string;
  deadline?: number;
  transactionData?: {
    contractAddress?: string;
    calldata?: string;
    value?: string;
    gasEstimate?: string;
  };
  metadata?: Record<string, unknown>;
}
```

## Supported Chains

- Ethereum
- Stellar
- Polygon
- Arbitrum
- Optimism
- Base
- Gnosis
- Nova
- BSC
- Avalanche

## Supported Bridge Providers

### Hop Protocol
- Supports: Ethereum, Polygon, Arbitrum, Optimism, Base, Gnosis, Nova
- API: https://docs.hop.exchange/developer-docs/api/api

### LayerZero
- Supports: Ethereum, Polygon, Arbitrum, Optimism, Base, BSC, Avalanche
- API: https://docs.layerzero.network/v2/tools/api/oft

### Stellar/Soroban
- Supports: Stellar ↔ Ethereum, Polygon, Arbitrum, Optimism, Base
- Uses Soroban smart contracts for bridging

## Performance

The aggregator fetches routes from all providers in parallel, ensuring high performance even when querying multiple bridges. Routes are automatically sorted by:
1. Fee percentage (lowest first)
2. Estimated time (fastest first)
3. Output amount (highest first)

## Error Handling

The aggregator gracefully handles provider failures. If one provider fails, others will still return results. Errors are logged but don't interrupt the aggregation process.

## License

MIT
