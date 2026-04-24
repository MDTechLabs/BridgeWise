# @bridgewise/config

Shared configuration management for BridgeWise, providing dynamic chain configuration loading and management utilities.

## Features

- **Dynamic Chain Loading**: Load chain configurations from JSON files and environment variables
- **Configuration Management**: Central configuration manager for all chains
- **Chain Registry**: Robust registry system with validation
- **Query Builder**: Fluent API for querying and filtering chains
- **Validation**: Comprehensive chain configuration validation
- **Type Safety**: Full TypeScript support with interfaces

## Installation

```bash
pnpm add @bridgewise/config
```

## Quick Start

### Load Chains Dynamically

```typescript
import { DynamicChainConfigLoader } from '@bridgewise/config';

// Load chains from JSON files and environment variables
const chains = DynamicChainConfigLoader.loadChains({
  fromJson: true,
  fromEnv: true,
  skipValidation: false,
});

console.log(`Loaded ${chains.length} chains`);
```

### Using Chain Configuration Manager

```typescript
import { ChainConfigManager } from '@bridgewise/config';

// Get all chains
const allChains = ChainConfigManager.getChains();

// Get specific chain
const ethereum = ChainConfigManager.getChainById('ethereum');

// Get bridgeable chains
const bridgeable = ChainConfigManager.getBridgeableChains();

// Get chains by type
const evmChains = ChainConfigManager.getChainsByType('EVM');
```

### Using Chain Registry

```typescript
import { ChainRegistry, ChainConfig } from '@bridgewise/config';

const registry = new ChainRegistry();

// Register chains
registry.register(ethereumConfig);
registry.registerBatch(chains);

// Query registry
const chain = registry.get('ethereum');
const evmChains = registry.getByType('EVM');

// Update chains
registry.update('ethereum', { rpcUrl: 'https://new-rpc.com' });
```

### Using Chain Query Builder

```typescript
import { createChainQuery } from '@bridgewise/config';

// Create and execute queries
const result = createChainQuery(chains)
  .byType('EVM')
  .bridgeable(true)
  .testnet(false)
  .sortByName()
  .toResult();

console.log(`Found ${result.total} EVM mainnet chains that support bridging`);
```

### Query Options

```typescript
import { createChainQuery } from '@bridgewise/config';

const result = createChainQuery.execute(chains, {
  type: ['EVM', 'Stellar'],
  bridgeable: true,
  testnet: false,
  excludeChainIds: ['ethereum'],
});
```

## Configuration Files

Chain configurations are stored in JSON files:

- `src/config/chains-config/chains.config.json` - Base configuration
- `src/config/chains-config/chains.config.development.json` - Development overrides
- `src/config/chains-config/chains.config.staging.json` - Staging overrides
- `src/config/chains-config/chains.config.production.json` - Production overrides

### Chain Configuration Format

```json
{
  "id": "ethereum",
  "name": "Ethereum",
  "symbol": "ETH",
  "chainId": 1,
  "rpcUrl": "https://eth.llamarpc.com",
  "explorerUrl": "https://etherscan.io",
  "type": "EVM",
  "isTestnet": false,
  "features": {
    "supportsBridging": true,
    "supportsQuotes": true,
    "nativeCurrencyDecimals": 18
  }
}
```

## Environment Variables

### Override RPC URLs

```bash
# Format: CHAIN_<CHAIN_ID>_<PROPERTY>=value
CHAIN_ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
CHAIN_POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY
```

### Add Dynamic Chains

```bash
CHAIN_AVALANCHE_NAME=Avalanche
CHAIN_AVALANCHE_SYMBOL=AVAX
CHAIN_AVALANCHE_CHAIN_ID=43114
CHAIN_AVALANCHE_RPC_URL=https://api.avax.network/ext/bc/C/rpc
CHAIN_AVALANCHE_EXPLORER_URL=https://snowtrace.io
CHAIN_AVALANCHE_TYPE=EVM
CHAIN_AVALANCHE_SUPPORTS_BRIDGING=true
CHAIN_AVALANCHE_SUPPORTS_QUOTES=true
CHAIN_AVALANCHE_NATIVE_DECIMALS=18
```

## Chain Types

- `EVM`: Ethereum Virtual Machine compatible chains
- `Stellar`: Stellar network
- `Cosmos`: Cosmos chains
- `Solana`: Solana blockchain

## API Documentation

### DynamicChainConfigLoader

Static class for loading chain configurations.

**Methods:**
- `loadChains(options)`: Load chains from all sources
- `getChainById(chainId)`: Get chain by ID
- `getEVMChainByChainId(numericChainId)`: Get EVM chain by numeric chain ID
- `getChainsByType(type)`: Get chains of a specific type
- `isBridgeable(chainId)`: Check if chain supports bridging
- `clearCache()`: Clear configuration cache
- `generateEnvFormat(chains)`: Generate environment variable format

### ChainConfigManager

Singleton manager for chain configurations.

**Methods:**
- `initialize(chains, version)`: Initialize with chains
- `getChains()`: Get all chains
- `getChainById(chainId)`: Get chain by ID
- `getChainByNumericId(numericChainId)`: Get chain by numeric ID
- `getChainsByType(type)`: Get chains by type
- `getBridgeableChains()`: Get bridgeable chains
- `getTestnetChains()`: Get testnet chains
- `getMainnetChains()`: Get mainnet chains
- `addChain(chain)`: Add or update chain
- `removeChain(chainId)`: Remove chain
- `updateChainRpcUrl(chainId, rpcUrl)`: Update RPC URL

### ChainRegistry

Registry class for managing chain configurations with validation.

**Methods:**
- `register(chain)`: Register a chain
- `registerBatch(chains)`: Register multiple chains
- `get(chainId)`: Get chain by ID
- `getByNumericId(numericChainId)`: Get chain by numeric ID
- `getAll()`: Get all chains
- `getByType(type)`: Get chains by type
- `has(chainId)`: Check if chain exists
- `unregister(chainId)`: Remove chain
- `update(chainId, updates)`: Update chain
- `clear()`: Clear all chains
- `size()`: Get total chains
- `toJSON()`: Export as JSON

### Chain Query Builder

Fluent API for querying chains.

**Methods:**
- `byType(type)`: Filter by type
- `bridgeable(enabled)`: Filter by bridgeable status
- `testnet(include)`: Filter by testnet status
- `bySymbol(symbol)`: Filter by symbol
- `byRpcUrl(rpcUrl)`: Filter by RPC URL
- `exclude(...chainIds)`: Exclude chains
- `filter(predicate)`: Custom filter
- `sortBy(comparator)`: Custom sort
- `sortByName()`: Sort by name
- `sortByChainId()`: Sort by chain ID
- `limit(count)`: Limit results
- `offset(count)`: Offset results
- `first()`: Get first result
- `toArray()`: Get all results
- `toResult()`: Get results with metadata

## Adding New Chains

### Via JSON Configuration

Add to the appropriate `chains.config.*.json` file:

```json
{
  "id": "avalanche",
  "name": "Avalanche",
  "symbol": "AVAX",
  "chainId": 43114,
  "rpcUrl": "https://api.avax.network/ext/bc/C/rpc",
  "explorerUrl": "https://snowtrace.io",
  "type": "EVM",
  "features": {
    "supportsBridging": true,
    "supportsQuotes": true,
    "nativeCurrencyDecimals": 18
  }
}
```

### Via Environment Variables

```bash
CHAIN_AVALANCHE_NAME=Avalanche
CHAIN_AVALANCHE_SYMBOL=AVAX
CHAIN_AVALANCHE_CHAIN_ID=43114
CHAIN_AVALANCHE_RPC_URL=https://api.avax.network/ext/bc/C/rpc
CHAIN_AVALANCHE_EXPLORER_URL=https://snowtrace.io
CHAIN_AVALANCHE_TYPE=EVM
CHAIN_AVALANCHE_SUPPORTS_BRIDGING=true
CHAIN_AVALANCHE_SUPPORTS_QUOTES=true
CHAIN_AVALANCHE_NATIVE_DECIMALS=18
```

### Programmatically

```typescript
import { ChainRegistry } from '@bridgewise/config';

const registry = new ChainRegistry();
registry.register({
  id: 'avalanche',
  name: 'Avalanche',
  symbol: 'AVAX',
  chainId: 43114,
  rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
  explorerUrl: 'https://snowtrace.io',
  type: 'EVM',
  features: {
    supportsBridging: true,
    supportsQuotes: true,
    nativeCurrencyDecimals: 18,
  },
});
```

## Validation

All chain configurations are validated against the schema:

```typescript
import { validateChainConfig } from '@bridgewise/config';

const result = validateChainConfig(chainData);
if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

## License

MIT
