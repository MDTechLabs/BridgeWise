# Unified Adapter Interface - API Reference

Complete API documentation for the BridgeWise Unified Bridge Adapter Interface.

## Table of Contents

- [Core Types](#core-types)
- [BridgeAdapter Interface](#bridgeadapter-interface)
- [BaseBridgeAdapter Class](#basebridgeadapter-class)
- [AdapterFactory Class](#adapterfactory-class)
- [TokenRegistry Class](#tokenregistry-class)
- [FeeNormalizer Class](#feenormalizer-class)
- [Error Handling](#error-handling)
- [Validation Utilities](#validation-utilities)

## Core Types

### BridgeAdapterConfig

Bridge adapter configuration object.

```typescript
interface BridgeAdapterConfig {
  provider: BridgeProvider;                    // Unique provider identifier
  name: string;                                 // Display name
  endpoints: {
    primary?: string;                          // Primary API endpoint
    fallback?: string;                         // Fallback API endpoint
    rpc?: string;                              // RPC endpoint (optional)
  };
  timeout?: number;                            // Request timeout in ms (default: 30000)
  retry?: {
    attempts: number;                          // Number of retry attempts
    initialDelayMs: number;                    // Initial delay between retries
    backoffMultiplier?: number;                // Exponential backoff multiplier
  };
  rateLimit?: {
    requestsPerSecond: number;                 // Request rate limit
    windowMs: number;                          // Rate limit window in ms
  };
  auth?: {
    apiKey?: string;                           // API key authentication
    bearerToken?: string;                      // Bearer token authentication
    customHeader?: {
      name: string;
      value: string;
    };
  };
  metadata?: Record<string, unknown>;          // Bridge-specific metadata
}
```

### NormalizedFee

Standardized fee structure.

```typescript
interface NormalizedFee {
  total: string;                               // Total fee (smallest unit)
  percentage: number;                          // Fee percentage (0-100)
  breakdown?: {
    network?: string;                          // Network/gas fee
    protocol?: string;                         // Protocol fee
    slippage?: string;                         // Slippage fee
  };
  currency?: string;                           // Fee currency (if different)
  lastUpdated: number;                         // Timestamp
}
```

### BridgeTokenMapping

Token mapping information.

```typescript
interface BridgeTokenMapping {
  sourceToken: string;                         // Source token address
  destinationToken: string;                    // Destination token address
  sourceDecimals: number;                      // Source token decimals
  destinationDecimals: number;                 // Destination token decimals
  conversionMultiplier: string;                // Decimal adjustment multiplier
  isSupported: boolean;                        // Support status
  bridgeTokenId?: string;                      // Bridge-specific token ID
  minAmount?: string;                          // Minimum bridgeable amount
  maxAmount?: string;                          // Maximum bridgeable amount
}
```

## BridgeAdapter Interface

Main interface that all bridge adapters must implement.

### Properties

```typescript
readonly provider: BridgeProvider;             // Unique provider identifier
```

### Methods

#### getConfig()

Returns the adapter's configuration.

```typescript
getConfig(): BridgeAdapterConfig
```

**Returns:** Current adapter configuration

#### supportsChainPair(sourceChain, targetChain)

Checks if the adapter supports a specific chain pair.

```typescript
supportsChainPair(
  sourceChain: ChainId,
  targetChain: ChainId
): boolean
```

**Parameters:**
- `sourceChain` - Source blockchain identifier
- `targetChain` - Destination blockchain identifier

**Returns:** `true` if chain pair is supported

#### supportsTokenPair(sourceChain, targetChain, sourceToken, destinationToken)

Checks if a specific token pair can be bridged.

```typescript
supportsTokenPair(
  sourceChain: ChainId,
  targetChain: ChainId,
  sourceToken: string,
  destinationToken: string
): Promise<boolean>
```

**Returns:** Promise resolving to `true` if token pair is supported

#### getTokenMapping(sourceChain, targetChain, sourceToken)

Retrieves token mapping information.

```typescript
getTokenMapping(
  sourceChain: ChainId,
  targetChain: ChainId,
  sourceToken: string
): Promise<BridgeTokenMapping | null>
```

**Returns:** Promise resolving to token mapping or `null` if not found

#### fetchRoutes(request)

Fetches available routes for a bridge operation.

```typescript
fetchRoutes(request: RouteRequest): Promise<BridgeRoute[]>
```

**Parameters:**
- `request` - RouteRequest with source/target chains, amount, etc.

**Returns:** Promise resolving to array of available routes

**Throws:** `AdapterError` if operation fails

#### getNormalizedFee(sourceChain, targetChain, tokenAddress, amount)

Gets normalized fee information.

```typescript
getNormalizedFee(
  sourceChain: ChainId,
  targetChain: ChainId,
  tokenAddress?: string,
  amount?: string
): Promise<NormalizedFee>
```

**Returns:** Promise resolving to normalized fee data

#### getSupportedSourceChains()

Returns list of supported source chains.

```typescript
getSupportedSourceChains(): ChainId[]
```

**Returns:** Array of supported chain identifiers

#### getSupportedDestinationChains(sourceChain)

Returns destination chains supported for a source chain.

```typescript
getSupportedDestinationChains(sourceChain: ChainId): ChainId[]
```

**Parameters:**
- `sourceChain` - Source chain identifier

**Returns:** Array of supported destination chain identifiers

#### getSupportedTokens(chain)

Gets tokens supported on a specific chain.

```typescript
async getSupportedTokens(chain: ChainId): Promise<string[]>
```

**Parameters:**
- `chain` - Chain identifier

**Returns:** Promise resolving to array of token addresses/symbols

#### getName()

Returns the display name for the bridge provider.

```typescript
getName(): string
```

**Returns:** Human-readable provider name

#### getHealth()

Gets bridge health and status information.

```typescript
async getHealth(): Promise<{
  healthy: boolean;
  uptime: number;
  lastChecked: number;
  message?: string;
}>
```

**Returns:** Health status information

#### isReady()

Checks if the adapter is ready to use.

```typescript
isReady(): boolean
```

**Returns:** `true` if adapter is initialized and ready

#### initialize()

Initializes the adapter (optional).

```typescript
async initialize?(): Promise<void>
```

#### shutdown()

Cleans up adapter resources (optional).

```typescript
async shutdown?(): Promise<void>
```

## BaseBridgeAdapter Class

Abstract base class providing common functionality for bridge adapters.

### Constructor

```typescript
constructor(config: BridgeAdapterConfig)
```

**Throws:** `AdapterError` if configuration is invalid

### Protected Methods

#### normalizeChain(chain)

Normalizes a chain identifier.

```typescript
protected normalizeChain(chain: string): string
```

#### normalizeToken(token)

Normalizes a token address.

```typescript
protected normalizeToken(token: string): string
```

#### generateRouteId(sourceChain, targetChain, index)

Generates a unique route ID.

```typescript
protected generateRouteId(
  sourceChain: string,
  targetChain: string,
  index?: number
): string
```

#### calculateFeePercentage(inputAmount, outputAmount)

Calculates fee percentage.

```typescript
protected calculateFeePercentage(
  inputAmount: string,
  outputAmount: string
): number
```

#### calculateOutputAmount(inputAmount, feePercentage)

Calculates output amount given fee percentage.

```typescript
protected calculateOutputAmount(
  inputAmount: string,
  feePercentage: number
): string
```

#### convertDecimals(amount, fromDecimals, toDecimals)

Converts between token decimals.

```typescript
protected convertDecimals(
  amount: string,
  fromDecimals: number,
  toDecimals: number
): string
```

#### estimateBridgeTime(sourceChain, targetChain)

Estimates bridge completion time in seconds.

```typescript
protected estimateBridgeTime(
  sourceChain: ChainId,
  targetChain: ChainId
): number
```

#### assertReady()

Checks if adapter is ready before operations.

```typescript
protected assertReady(): void
```

**Throws:** `AdapterError` if not ready

#### handleApiError(error, context)

Handles API errors uniformly.

```typescript
protected handleApiError(error: any, context: string): never
```

**Throws:** Standardized `AdapterError`

#### validateChainPair(sourceChain, targetChain)

Validates chain pair support.

```typescript
protected validateChainPair(
  sourceChain: ChainId,
  targetChain: ChainId
): void
```

**Throws:** `AdapterError` if not supported

## AdapterFactory Class

Central registry and factory for managing bridge adapters.

### Methods

#### registerAdapter(provider, adapter, config)

Registers an adapter implementation.

```typescript
registerAdapter(
  provider: BridgeProvider,
  adapter: AdapterConstructor,
  config: BridgeAdapterConfig
): void
```

**Throws:** `AdapterError` if provider already registered

#### registerAdaptersBatch(registrations)

Registers multiple adapters at once.

```typescript
registerAdaptersBatch(registrations: Array<{
  provider: BridgeProvider;
  adapter: AdapterConstructor;
  config: BridgeAdapterConfig;
}>): void
```

#### getAdapter(provider, createNew)

Gets or creates an adapter instance.

```typescript
getAdapter(provider: BridgeProvider, createNew?: boolean): BridgeAdapter
```

**Parameters:**
- `provider` - Bridge provider identifier
- `createNew` - If `true`, creates fresh instance instead of using cache

**Returns:** BridgeAdapter instance

**Throws:** `AdapterError` if adapter not registered

#### getAllAdapters()

Gets all registered adapters.

```typescript
getAllAdapters(): Map<BridgeProvider, BridgeAdapter>
```

**Returns:** Map of provider to adapter instance

#### getAdapterConfig(provider)

Gets configuration for an adapter.

```typescript
getAdapterConfig(provider: BridgeProvider): BridgeAdapterConfig
```

**Returns:** Adapter configuration

**Throws:** `AdapterError` if not found

#### updateAdapterConfig(provider, config)

Updates adapter configuration.

```typescript
updateAdapterConfig(
  provider: BridgeProvider,
  config: BridgeAdapterConfig
): void
```

#### hasAdapter(provider)

Checks if adapter is registered.

```typescript
hasAdapter(provider: BridgeProvider): boolean
```

**Returns:** `true` if registered

#### getRegisteredProviders()

Gets list of registered providers.

```typescript
getRegisteredProviders(): BridgeProvider[]
```

**Returns:** Array of provider identifiers

#### getAdaptersForChainPair(sourceChain, targetChain)

Filters adapters by chain support.

```typescript
getAdaptersForChainPair(
  sourceChain: ChainId,
  targetChain: ChainId
): BridgeAdapter[]
```

**Returns:** Adapters supporting this chain pair

#### initializeAdapter(provider)

Initializes a specific adapter.

```typescript
async initializeAdapter(provider: BridgeProvider): Promise<void>
```

#### initializeAll()

Initializes all adapters.

```typescript
async initializeAll(): Promise<void>
```

#### shutdownAdapter(provider)

Shuts down a specific adapter.

```typescript
async shutdownAdapter(provider: BridgeProvider): Promise<void>
```

#### shutdownAll()

Shuts down all adapters.

```typescript
async shutdownAll(): Promise<void>
```

#### reset(async)

Resets factory (clears registrations).

```typescript
async reset(async?: boolean): Promise<void>
```

#### getStats()

Gets factory statistics.

```typescript
getStats(): {
  registeredAdapters: number;
  cachedInstances: number;
  registeredProviders: BridgeProvider[];
}
```

## TokenRegistry Class

In-memory registry for managing token metadata and mappings.

### Methods

#### registerToken(token)

Registers a token.

```typescript
async registerToken(token: TokenMetadata): Promise<void>
```

#### registerMapping(mapping)

Registers a token mapping.

```typescript
async registerMapping(mapping: TokenMapping): Promise<void>
```

#### getToken(chain, tokenAddress)

Gets token metadata.

```typescript
async getToken(
  chain: ChainId,
  tokenAddress: string
): Promise<TokenMetadata | null>
```

#### getMapping(sourceChain, targetChain, sourceToken, provider)

Gets token mapping.

```typescript
async getMapping(
  sourceChain: ChainId,
  targetChain: ChainId,
  sourceToken: string,
  provider?: BridgeProvider
): Promise<TokenMapping | null>
```

#### getMappingsForBridge(sourceChain, targetChain, provider)

Gets all mappings for a bridge between chains.

```typescript
async getMappingsForBridge(
  sourceChain: ChainId,
  targetChain: ChainId,
  provider: BridgeProvider
): Promise<TokenMapping[]>
```

#### getTokensOnChain(chain)

Gets all tokens on a chain.

```typescript
async getTokensOnChain(chain: ChainId): Promise<TokenMetadata[]>
```

#### resolveTokenSymbol(symbol, chains)

Resolves token symbol to addresses.

```typescript
async resolveTokenSymbol(
  symbol: string,
  chains?: ChainId[]
): Promise<Record<ChainId, string>>
```

#### isBridgeable(sourceChain, targetChain, sourceToken, provider)

Checks if token pair is bridgeable.

```typescript
async isBridgeable(
  sourceChain: ChainId,
  targetChain: ChainId,
  sourceToken: string,
  provider?: BridgeProvider
): Promise<boolean>
```

#### updateMapping(sourceChain, targetChain, sourceToken, provider, updates)

Updates a token mapping.

```typescript
async updateMapping(
  sourceChain: ChainId,
  targetChain: ChainId,
  sourceToken: string,
  provider: BridgeProvider,
  updates: Partial<TokenMapping>
): Promise<void>
```

#### registerTokensBatch(tokens)

Batch registers tokens.

```typescript
async registerTokensBatch(tokens: TokenMetadata[]): Promise<void>
```

#### registerMappingsBatch(mappings)

Batch registers mappings.

```typescript
async registerMappingsBatch(mappings: TokenMapping[]): Promise<void>
```

#### getStats()

Gets registry statistics.

```typescript
getStats(): {
  totalTokens: number;
  chainsRegistered: number;
  mappingsRegistered: number;
}
```

## FeeNormalizer Class

Utilities for standardizing and analyzing fees.

### Static Methods

#### normalizeRoutesFees(route)

Normalizes fees from a bridge route.

```typescript
static normalizeRoutesFees(route: BridgeRoute): NormalizedFeeData
```

#### calculateTotalFee(components)

Calculates total fee from components.

```typescript
static calculateTotalFee(components: {
  networkFee?: string;
  protocolFee?: string;
  slippageFee?: string;
}): string
```

#### calculateFeePercentage(inputAmount, fee)

Calculates fee percentage.

```typescript
static calculateFeePercentage(
  inputAmount: string,
  fee: string
): number
```

#### convertPercentageToAmount(amount, percentage)

Converts fee percentage to amount.

```typescript
static convertPercentageToAmount(
  amount: string,
  percentage: number
): string
```

#### compareRoutesFees(route1, route2)

Compares fees between routes.

```typescript
static compareRoutesFees(route1: BridgeRoute, route2: BridgeRoute): number
```

**Returns:** Negative if route1 cheaper, positive if route2 cheaper, 0 if equal

#### calculateEffectiveRate(inputAmount, outputAmount)

Calculates effective exchange rate.

```typescript
static calculateEffectiveRate(
  inputAmount: string,
  outputAmount: string
): string
```

#### normalizeRoutesByFees(routes)

Sorts routes by fee (lowest first).

```typescript
static normalizeRoutesByFees(routes: BridgeRoute[]): BridgeRoute[]
```

#### calculateAverageFee(routes)

Calculates average fee across routes.

```typescript
static calculateAverageFee(routes: BridgeRoute[]): string
```

#### aggregateFeesAcrossBridges(routes)

Normalizes fee data for aggregation.

```typescript
static aggregateFeesAcrossBridges(routes: BridgeRoute[]): NormalizedFeeData[]
```

#### calculateFeeSavings(cheaperRoute, expensiveRoute)

Calculates fee savings between routes.

```typescript
static calculateFeeSavings(
  cheaperRoute: BridgeRoute,
  expensiveRoute: BridgeRoute
): {
  absoluteSavings: string;
  percentageSavings: number;
}
```

#### groupRoutesByFeeRange(routes, rangeCount)

Groups routes by fee ranges.

```typescript
static groupRoutesByFeeRange(
  routes: BridgeRoute[],
  rangeCount?: number
): Map<string, BridgeRoute[]>
```

## Error Handling

### AdapterErrorCode Enum

```typescript
enum AdapterErrorCode {
  // Configuration errors
  INVALID_CONFIG = 'INVALID_CONFIG',
  MISSING_ENDPOINT = 'MISSING_ENDPOINT',
  INVALID_AUTH = 'INVALID_AUTH',

  // Chain/token errors
  UNSUPPORTED_CHAIN_PAIR = 'UNSUPPORTED_CHAIN_PAIR',
  UNSUPPORTED_TOKEN = 'UNSUPPORTED_TOKEN',
  INVALID_CHAIN = 'INVALID_CHAIN',
  INVALID_TOKEN = 'INVALID_TOKEN',

  // Request errors
  INVALID_REQUEST = 'INVALID_REQUEST',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  INSUFFICIENT_LIQUIDITY = 'INSUFFICIENT_LIQUIDITY',
  AMOUNT_OUT_OF_RANGE = 'AMOUNT_OUT_OF_RANGE',

  // API errors
  API_ERROR = 'API_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',

  // Token mapping errors
  TOKEN_MAPPING_NOT_FOUND = 'TOKEN_MAPPING_NOT_FOUND',
  INVALID_TOKEN_MAPPING = 'INVALID_TOKEN_MAPPING',

  // Fee estimation errors
  FEE_ESTIMATION_FAILED = 'FEE_ESTIMATION_FAILED',

  // General errors
  NOT_INITIALIZED = 'NOT_INITIALIZED',
  NOT_READY = 'NOT_READY',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}
```

### AdapterError Class

Custom error class for standardized error handling.

```typescript
class AdapterError extends Error {
  code: AdapterErrorCode;
  details?: Record<string, unknown>;
  timestamp: number;

  constructor(
    code: AdapterErrorCode,
    message: string,
    details?: Record<string, unknown>
  );

  toJSON(): ErrorInfo;
}
```

### ADAPTER_ERRORS Factory

Helper functions for creating standardized errors.

```typescript
ADAPTER_ERRORS.invalidConfig(message, details?)
ADAPTER_ERRORS.unsupportedChainPair(source, target)
ADAPTER_ERRORS.unsupportedToken(token, chain)
ADAPTER_ERRORS.invalidAmount(message, amount?)
ADAPTER_ERRORS.insufficientLiquidity(token, amount)
ADAPTER_ERRORS.apiError(message, statusCode?, response?)
ADAPTER_ERRORS.networkError(message)
ADAPTER_ERRORS.timeout(operation, timeoutMs)
ADAPTER_ERRORS.rateLimited(retryAfter?)
ADAPTER_ERRORS.notInitialized()
ADAPTER_ERRORS.notReady()
```

## Validation Utilities

### Functions

#### validateAdapterConfig(config)

Validates adapter configuration.

```typescript
export function validateAdapterConfig(config: BridgeAdapterConfig): void
```

**Throws:** `AdapterError` if invalid

#### validateTokenMapping(mapping)

Validates token mapping.

```typescript
export function validateTokenMapping(mapping: TokenMapping): void
```

**Throws:** `AdapterError` if invalid

#### validateAmount(amount, context)

Validates amount format.

```typescript
export function validateAmount(amount: string, context?: string): void
```

**Throws:** `AdapterError` if invalid

#### validateFeePercentage(fee, context)

Validates fee percentage (0-100).

```typescript
export function validateFeePercentage(fee: number, context?: string): void
```

**Throws:** `AdapterError` if invalid

#### isValidChainId(chain)

Checks if chain identifier is valid.

```typescript
export function isValidChainId(chain: any): chain is ChainId
```

## Global Functions

### getAdapterFactory()

Gets or creates global factory singleton.

```typescript
export function getAdapterFactory(): AdapterFactory
```

**Returns:** Global `AdapterFactory` instance

### resetAdapterFactory(async)

Resets global factory (useful for testing).

```typescript
export async function resetAdapterFactory(async?: boolean): Promise<void>
```
