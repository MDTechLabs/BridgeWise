# Unified Bridge Adapter Interface - Implementation Summary

Complete overview of the Unified Bridge Adapter Interface implementation for BridgeWise.

## Executive Summary

The Unified Bridge Adapter Interface is a standardized, plug-and-play system for integrating any blockchain bridge into BridgeWise. It abstracts bridge-specific complexities while providing:

- **Standardized API** - Single interface for all bridges
- **Token Mapping** - Normalized token data across chains
- **Fee Normalization** - Consistent fee structures
- **Factory Pattern** - Easy adapter registration and lifecycle management
- **Extensibility** - Simple to add new bridges with minimal code
- **Type Safety** - Full TypeScript support
- **Error Handling** - Standardized error codes and messages

## What Was Built

### 1. Core Interfaces (`unified-adapter/`)

#### `adapter.interface.ts` - Main BridgeAdapter Interface
- **BridgeAdapter** - Core interface all adapters must implement
- **BridgeAdapterConfig** - Standardized configuration schema
- **NormalizedFee** - Unified fee structure
- **BridgeTokenMapping** - Token mapping across chains

Key methods:
- `supportsChainPair()` - Validate chain support
- `supportTokenPair()` - Validate token support
- `fetchRoutes()` - Get available routes
- `getNormalizedFee()` - Get standardized fees
- `getTokenMapping()` - Get token conversions
- `getHealth()` - Monitor bridge status

---

#### `bridge-config.interface.ts` - Configuration System
- **BridgeCapabilities** - Declare bridge features
- **AdapterMetadata** - Bridge information
- **ChainSupport** - Per-chain configuration
- **BridgeConfig** - Complete bridge configuration

---

#### `token-registry.interface.ts` - Token Management
- **ITokenRegistry** - Token and mapping registry interface
- **TokenMetadata** - Token information
- **TokenMapping** - Cross-chain token pairs

Key operations:
- Register tokens and mappings
- Resolve token symbols to addresses
- Query bridgeable pairs
- Batch operations for performance

---

### 2. Implementations

#### `base-adapter.ts` - BaseBridgeAdapter Class
Abstract base class providing:
- Default implementations for optional methods
- Protected utility methods:
  - `normalizeChain()` - Normalize chain identifiers
  - `normalizeToken()` - Normalize token addresses
  - `generateRouteId()` - Create unique route IDs
  - `calculateFeePercentage()` - Fee calculations
  - `convertDecimals()` - Decimal conversion
  - `estimateBridgeTime()` - Time estimation
- Exception handling with `assertReady()`, `handleApiError()`, `validateChainPair()`

Subclasses only need to implement:
- `provider` - Unique identifier
- `getName()` - Display name
- `supportsChainPair()` - Chain validation
- `fetchRoutes()` - Route fetching

---

#### `token-registry.ts` - TokenRegistry Implementation
In-memory registry with:
- Token storage by chain
- Symbol-based index for fast lookup
- Mapping storage with provider isolation
- Batch registration support
- Statistics tracking

Operations:
- Register individual tokens/mappings
- Batch operations for efficiency
- Query by address or symbol
- Check bridgeability
- Update existing mappings

---

#### `adapter-factory.ts` - AdapterFactory Class
Central registry managing:
- **Adapter registration** - Register implementations
- **Lifecycle management** - Initialize/shutdown all adapters
- **Instance caching** - Reuse instances for performance
- **Configuration management** - Update adapter configs
- **Chain pair filtering** - Find adapters by supported chains
- **Singleton pattern** - Global `getAdapterFactory()` function

Key features:
- Batch registration of multiple adapters
- Fresh instance creation or cached retrieval
- Create new instances without cache (`createNew: true`)
- Reset factory for testing
- Statistics and introspection

---

#### `fee-normalizer.ts` - FeeNormalizer Class
Comprehensive fee analysis utilities:
- **Fee calculations** - Normalize, compare, convert
- **Fee sorting** - Sort routes by cost
- **Fee analysis** - Average, grouping, savings calculation
- **Fee components** - Network, protocol, slippage breakdown
- **Effective rates** - Calculate output/input ratios
- **Slippage estimation** - Estimate slippage from rates

---

### 3. Utilities

#### `errors.ts` - Error Handling
- **AdapterErrorCode** enum - 18+ standardized error codes
- **AdapterError** class - Custom error with code, message, details
- **ADAPTER_ERRORS** factory - Helper functions for creating errors

Error categories:
- Configuration errors
- Chain/token errors
- Request validation errors
- API errors (timeout, rate limiting, network)
- Token mapping errors
- Fee estimation errors
- Lifecycle errors

---

#### `validators.ts` - Validation Utilities
Functions for validating:
- Adapter configuration (`validateAdapterConfig`)
- Token mappings (`validateTokenMapping`)
- Token metadata (`validateTokenMetadata`)
- Amount format (`validateAmount`)
- Fee percentage (`validateFeePercentage`)
- Chain identifiers (`isValidChainId`)
- URLs (internal helper)

---

### 4. Documentation

#### `UNIFIED_ADAPTER_GUIDE.md` - Complete Implementation Guide
- Overview and architecture
- Core concepts explanation
- Step-by-step implementation guide
- Token registry usage
- Adapter factory patterns
- Fee normalization examples
- Error handling strategies
- Best practices (6 sections)
- Troubleshooting guide

---

#### `API_REFERENCE.md` - Complete API Documentation
- All types and interfaces
- All class methods with parameters
- Return types and exceptions
- Static utility methods
- Error codes and error factory
- Global functions

---

#### `QUICK_START.md` - Getting Started
- 5-minute quick start
- 10-minute integration guide
- Building custom adapters
- Common tasks with code
- Troubleshooting common issues
- Performance optimization tips

---

#### `examples.ts` - Practical Examples
Six comprehensive examples:
1. Implementing SwiftBridge adapter
2. Setting up and registering adapters
3. Querying routes with error handling
4. Token registry management
5. Fee analysis across adapters
6. Adapter factory patterns

---

### 5. Index and Exports (`index.ts`)
Clean exports of:
- All interfaces and types
- Base adapter and implementations
- Factory and registry classes
- Fee normalizer utilities
- Error definitions and validators

---

## Architecture

```
┌─────────────────────────────────────────┐
│      Application / Route Aggregator      │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
   ┌────▼─────┐      ┌──────▼────┐
   │ AdapterA │      │ AdapterB  │
   └────┬─────┘      └──────┬────┘
        │                   │
        └─────────┬─────────┘
                  │
    ┌─────────────┼──────────────┐
    │             │              │
┌───▼──────┐ ┌────▼────┐ ┌──────▼───┐
│BaseFees │ │Validator│ │ErrorMgmt  │
└──────────┘ └─────────┘ └───────────┘
    │             │              │
    └─────────────┼──────────────┘
                  │
    ┌─────────────┼──────────────┐
    │             │              │
┌───▼──────────┐  │ ┌────────────▼───┐
│TokenRegistry │──┤ │ AdapterFactory │
└──────────────┘  │ └────────────────┘
                  │
            UnifiedAdapter
```

## Key Features

### 1. Standardized Interface
All bridges implement `BridgeAdapter` interface, making them interchangeable:

```typescript
interface BridgeAdapter {
  readonly provider: BridgeProvider;
  supportsChainPair(source: ChainId, target: ChainId): boolean;
  fetchRoutes(request: RouteRequest): Promise<BridgeRoute[]>;
  getNormalizedFee(...): Promise<NormalizedFee>;
  // ... more methods
}
```

### 2. Token Mapping
Cross-chain token resolution:

```typescript
const mapping = await registry.getMapping(
  'ethereum',
  'polygon',
  'USDC',
  'hop'
);
// Returns: token addresses, decimals, conversion rates, limits
```

### 3. Fee Normalization
Unified fee comparison:

```typescript
const cheapest = FeeNormalizer.normalizeRoutesByFees(routes)[0];
const savings = FeeNormalizer.calculateFeeSavings(route1, route2);
```

### 4. Factory Pattern
Easy adapter management:

```typescript
const factory = getAdapterFactory();
factory.registerAdapter('mybridge', MyBridgeAdapter, config);
const adapters = factory.getAdaptersForChainPair('ethereum', 'polygon');
```

### 5. Error Handling
Standardized error codes:

```typescript
try {
  await adapter.fetchRoutes(request);
} catch (error) {
  if (error instanceof AdapterError) {
    if (error.code === AdapterErrorCode.RATE_LIMITED) {
      // Handle rate limiting
    }
  }
}
```

## Implementation Example

### Step 1: Create Adapter
```typescript
export class MyBridgeAdapter extends BaseBridgeAdapter {
  readonly provider = 'mybridge';

  getName(): string {
    return 'My Bridge';
  }

  supportsChainPair(source: ChainId, target: ChainId): boolean {
    return ['ethereum', 'polygon'].includes(source) &&
           ['ethereum', 'polygon'].includes(target);
  }

  async fetchRoutes(request: RouteRequest): Promise<BridgeRoute[]> {
    // Implement route fetching
    return [/* routes */];
  }
}
```

### Step 2: Register Adapter
```typescript
const factory = getAdapterFactory();
factory.registerAdapter('mybridge', MyBridgeAdapter, {
  provider: 'mybridge',
  name: 'My Bridge',
  endpoints: { primary: 'https://api.mybridge.io' },
  timeout: 30000,
});
```

### Step 3: Use Adapter
```typescript
const adapter = factory.getAdapter('mybridge');
await adapter.initialize();

const routes = await adapter.fetchRoutes({
  sourceChain: 'ethereum',
  targetChain: 'polygon',
  assetAmount: '1000000000000000000',
});
```

## Integration Points

### Existing Adapters
The system works with existing adapters:
- **Stellar Adapter** - Already extends `BaseBridgeAdapter`
- **HOP Adapter** - Already extends `BaseBridgeAdapter`
- **LayerZero Adapter** - Already extends `BaseBridgeAdapter`

These adapters automatically gain access to:
- Unified error handling
- Token mapping support
- Fee normalization
- Factory management

### Route Aggregator
The `BridgeAggregator` can use this system to:
- Query multiple adapters via factory
- Normalize routes and fees
- Rank by standardized metrics
- Handle errors across adapters

### Token Management
DApps and wallets can use:
- Token registry for resolution
- Mappings for bridging info
- Decimals for amount conversion

## Benefits

### For Bridge Integrators
✅ Simple interface to implement  
✅ Reusable utility methods  
✅ Automatic error handling  
✅ No need to duplicate fee normalization  
✅ Token mapping support built-in  

### For Applications
✅ Consistent API across bridges  
✅ Easy bridge switching  
✅ Standardized error handling  
✅ Comparable fees and metrics  
✅ Token resolution utilities  

### For Ecosystem
✅ Faster bridge integration  
✅ Better user experience  
✅ Uniform error messages  
✅ Analytics standardization  
✅ Plugin architecture  

## Files Structure

```
libs/bridge-core/src/unified-adapter/
├── index.ts                      # Main exports
├── adapter.interface.ts          # BridgeAdapter & config
├── bridge-config.interface.ts    # Configuration & capabilities
├── token-registry.interface.ts   # Token registry interface
├── base-adapter.ts               # Abstract base class
├── token-registry.ts             # In-memory implementation
├── adapter-factory.ts            # Factory pattern
├── fee-normalizer.ts             # Fee analysis utilities
├── errors.ts                     # Error definitions
├── validators.ts                 # Validation utilities
├── UNIFIED_ADAPTER_GUIDE.md      # Implementation guide
├── API_REFERENCE.md              # Complete API docs
├── QUICK_START.md                # Getting started
└── examples.ts                   # Practical examples
```

## Testing Strategy

### Unit Tests (to implement)
- Validator functions
- Fee calculations
- Token resolution
- Error creation

### Integration Tests (to implement)
- Adapter registration
- Route fetching
- Token mapping
- Error handling

### Example Test Case
```typescript
describe('TokenRegistry', () => {
  it('should resolve USDC across chains', async () => {
    const registry = new TokenRegistry();
    await registry.registerToken({
      symbol: 'USDC',
      decimals: 6,
      address: '0x...',
      chain: 'ethereum',
    });
    
    const addresses = await registry.resolveTokenSymbol('USDC');
    expect(addresses.ethereum).toBeDefined();
  });
});
```

## Next Steps

1. **Adapt Existing Adapters**
   - Update Stellar, HOP, LayerZero adapters
   - Register them with factory
   - Update aggregator to use factory

2. **Implement More Bridges**
   - Create adapters for Axelar, IBC, etc.
   - Register with factory
   - Populate token registry

3. **Add Persistent Storage**
   - Replace in-memory registry with DB
   - Cache fee data
   - Store historical data

4. **Enhance Monitoring**
   - Track adapter health
   - Monitor API endpoints
   - Log performance metrics

5. **Add More Utilities**
   - Advanced fee prediction models
   - Liquidity analysis
   - Route optimization

## Usage from Bridge-Core Package

```typescript
// Import everything you need
import {
  BridgeAdapter,
  BaseBridgeAdapter,
  AdapterFactory,
  getAdapterFactory,
  TokenRegistry,
  FeeNormalizer,
  AdapterError,
  AdapterErrorCode,
  validateAdapterConfig,
} from '@bridgewise/bridge-core';

// Or specific items
import type { BridgeAdapterConfig, NormalizedFee } from '@bridgewise/bridge-core';
```

## Conclusion

The Unified Bridge Adapter Interface provides a comprehensive, standardized system for bridge integration in BridgeWise. It:

- **Simplifies** - One interface for all bridges
- **Normalizes** - Consistent fees, tokens, errors
- **Extends** - Easy to add new bridges
- **Scales** - Factory pattern for multiple adapters
- **Maintains** - Clear error handling and validation

This enables BridgeWise to easily integrate any new bridge while maintaining consistency across the ecosystem.
