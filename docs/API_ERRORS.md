# BridgeWise API Error Documentation

## Error Response Format

All error responses follow a consistent format:

```json
{
  "success": false,
  "error": "Error category or message",
  "details": "Detailed error information",
  "errorCode": "CATEGORY_SUBCATEGORY_ERROR_TYPE"
}
```

## HTTP Status Codes

| Status Code | Meaning | Common Cause |
|------------|---------|-------------|
| 400 | Bad Request | Invalid input, validation error, malformed request |
| 404 | Not Found | Resource (transaction, endpoint) not found |
| 500 | Internal Server Error | Server-side error, service failure |
| 503 | Service Unavailable | Fee estimation service offline, network unreachable |

## Error Categories and Codes

### Bridge Errors (BRIDGE_*)

These errors relate to the core bridging functionality.

#### BRIDGE_NOT_INITIALIZED
- **HTTP Status**: 500
- **Description**: Bridge adapter not properly initialized
- **Example Response**:
```json
{
  "success": false,
  "error": "Bridge not initialized",
  "errorCode": "BRIDGE_NOT_INITIALIZED",
  "details": "Stellar adapter failed to initialize with network connection"
}
```
- **Resolution**: Check network connectivity and adapter configuration

#### BRIDGE_CONFIG_INVALID
- **HTTP Status**: 400
- **Description**: Invalid configuration provided
- **Example Response**:
```json
{
  "success": false,
  "error": "Invalid bridge configuration",
  "errorCode": "BRIDGE_CONFIG_INVALID",
  "details": "Missing required configuration: STELLAR_NETWORK_URL"
}
```
- **Resolution**: Verify all required environment variables are set

#### BRIDGE_INTERNAL_ERROR
- **HTTP Status**: 500
- **Description**: Unexpected internal error during bridge operation
- **Example Response**:
```json
{
  "success": false,
  "error": "Bridge internal error",
  "errorCode": "BRIDGE_INTERNAL_ERROR",
  "details": "Unexpected null value in transaction processing"
}
```
- **Resolution**: Check server logs, retry request, contact support if persists

#### BRIDGE_TIMEOUT
- **HTTP Status**: 504
- **Description**: Bridge operation exceeded timeout threshold
- **Example Response**:
```json
{
  "success": false,
  "error": "Bridge operation timeout",
  "errorCode": "BRIDGE_TIMEOUT",
  "details": "Fee estimation took longer than 30 seconds"
}
```
- **Resolution**: Retry request, check network latency, try again later

### Aggregation Errors (AGGREGATION_*)

Errors related to route aggregation and bridge routing.

#### AGGREGATION_FAILED
- **HTTP Status**: 500
- **Description**: Failed to aggregate routes from available bridges
- **Example Response**:
```json
{
  "success": false,
  "error": "Route aggregation failed",
  "errorCode": "AGGREGATION_FAILED",
  "details": "All bridge adapters returned errors"
}
```
- **Resolution**: Check if sufficient liquidity exists on bridges

#### NO_ROUTES_FOUND
- **HTTP Status**: 404
- **Description**: No valid bridging routes found for the requested transfer
- **Example Response**:
```json
{
  "success": false,
  "error": "No routes found",
  "errorCode": "NO_ROUTES_FOUND",
  "details": "No bridge supports transfer from stellar to layerzero with USDC"
}
```
- **Resolution**: Check supported chains and tokens, try different token pair

#### INVALID_ROUTE
- **HTTP Status**: 400
- **Description**: The provided route is invalid or unsupported
- **Example Response**:
```json
{
  "success": false,
  "error": "Invalid route",
  "errorCode": "INVALID_ROUTE",
  "details": "Route contains unsupported chain combination"
}
```
- **Resolution**: Verify source and destination chains are supported

### Input Validation Errors (INVALID_*)

Input validation failures with detailed field information.

#### INVALID_INPUT
- **HTTP Status**: 400
- **Description**: Generic validation error
- **Example Response**:
```json
{
  "success": false,
  "error": "Validation error",
  "errorCode": "INVALID_INPUT",
  "details": [
    {
      "field": "amount",
      "message": "amount must be a positive number"
    },
    {
      "field": "type",
      "message": "type is required"
    }
  ]
}
```

#### MISSING_REQUIRED_FIELD
- **HTTP Status**: 400
- **Description**: Required field is missing
- **Example Response**:
```json
{
  "success": false,
  "error": "Missing required field",
  "errorCode": "MISSING_REQUIRED_FIELD",
  "details": "Field 'sourceAccount' is required for stellar-payment transactions"
}
```
- **Resolution**: Include all required fields in request

#### INVALID_AMOUNT
- **HTTP Status**: 400
- **Description**: Amount is invalid (negative, zero, non-numeric, etc.)
- **Example Response**:
```json
{
  "success": false,
  "error": "Invalid amount",
  "errorCode": "INVALID_AMOUNT",
  "details": "Amount must be positive. Received: -100"
}
```
- **Resolution**: Provide positive numeric amount

#### INVALID_TOKEN
- **HTTP Status**: 400
- **Description**: Token is not supported or invalid
- **Example Response**:
```json
{
  "success": false,
  "error": "Invalid token",
  "errorCode": "INVALID_TOKEN",
  "details": "Token UNKNOWN is not supported. Supported tokens: USDC, USDT, ETH, MATIC"
}
```
- **Resolution**: Use a supported token from the list

#### INVALID_CHAIN
- **HTTP Status**: 400
- **Description**: Blockchain network is not supported
- **Example Response**:
```json
{
  "success": false,
  "error": "Invalid chain",
  "errorCode": "INVALID_CHAIN",
  "details": "Chain 'unknown-chain' not supported. Supported chains: ethereum, polygon, stellar, avalanche"
}
```
- **Resolution**: Use a supported blockchain from the list

#### INVALID_ADDRESS
- **HTTP Status**: 400
- **Description**: Wallet address format is invalid
- **Example Response**:
```json
{
  "success": false,
  "error": "Invalid address",
  "errorCode": "INVALID_ADDRESS",
  "details": "Stellar address 'invalid' is malformed. Must start with 'G' and be 56 characters"
}
```
- **Resolution**: Provide a correctly formatted address for the target blockchain

### Stellar Adapter Errors (STELLAR_ADAPTER_*)

Errors specific to Stellar blockchain operations.

#### STELLAR_CONNECTION_FAILED
- **HTTP Status**: 500
- **Description**: Unable to connect to Stellar network
- **Example Response**:
```json
{
  "success": false,
  "error": "Stellar connection failed",
  "errorCode": "STELLAR_CONNECTION_FAILED",
  "details": "Cannot reach Stellar testnet horizon server"
}
```
- **Resolution**: Check network connectivity, Stellar may be experiencing issues

#### STELLAR_NETWORK_ERROR
- **HTTP Status**: 500
- **Description**: Stellar network error
- **Example Response**:
```json
{
  "success": false,
  "error": "Stellar network error",
  "errorCode": "STELLAR_NETWORK_ERROR",
  "details": "Stellar network returned: Connection timeout"
}
```
- **Resolution**: Check Stellar status, retry later

#### STELLAR_RPC_ERROR
- **HTTP Status**: 500
- **Description**: RPC call to Stellar failed
- **Example Response**:
```json
{
  "success": false,
  "error": "Stellar RPC error",
  "errorCode": "STELLAR_RPC_ERROR",
  "details": "Horizon RPC error: Invalid request"
}
```
- **Resolution**: Verify request format, check Stellar RPC endpoints

#### STELLAR_OPERATION_FAILED
- **HTTP Status**: 500
- **Description**: Stellar operation execution failed
- **Example Response**:
```json
{
  "success": false,
  "error": "Stellar operation failed",
  "errorCode": "STELLAR_OPERATION_FAILED",
  "details": "Payment operation failed: destination not found"
}
```
- **Resolution**: Verify recipient account exists

#### STELLAR_INVALID_MEMO
- **HTTP Status**: 400
- **Description**: Transaction memo is invalid or too long
- **Example Response**:
```json
{
  "success": false,
  "error": "Invalid memo",
  "errorCode": "STELLAR_INVALID_MEMO",
  "details": "Text memo exceeds 28 character limit. Received 45 characters"
}
```
- **Resolution**: Use memo shorter than 28 characters

#### STELLAR_INSUFFICIENT_BALANCE
- **HTTP Status**: 400
- **Description**: Account has insufficient funds
- **Example Response**:
```json
{
  "success": false,
  "error": "Insufficient balance",
  "errorCode": "STELLAR_INSUFFICIENT_BALANCE",
  "details": "Account balance: 50 XLM, required: 100 XLM"
}
```
- **Resolution**: Ensure account has sufficient funds

#### STELLAR_FEE_ESTIMATION_FAILED
- **HTTP Status**: 500
- **Description**: Could not estimate fees for Stellar transaction
- **Example Response**:
```json
{
  "success": false,
  "error": "Fee estimation failed",
  "errorCode": "STELLAR_FEE_ESTIMATION_FAILED",
  "details": "Could not fetch current base fee from Stellar"
}
```
- **Resolution**: Retry request, check Stellar network status

#### STELLAR_INVALID_ASSET
- **HTTP Status**: 400
- **Description**: Asset is invalid or not supported
- **Example Response**:
```json
{
  "success": false,
  "error": "Invalid asset",
  "errorCode": "STELLAR_INVALID_ASSET",
  "details": "Asset code must be 1-12 alphanumeric characters"
}
```
- **Resolution**: Use valid Stellar asset code

### LayerZero Adapter Errors (LAYERZERO_ADAPTER_*)

Errors specific to LayerZero omnichain operations.

#### LAYERZERO_CONNECTION_FAILED
- **HTTP Status**: 500
- **Description**: Unable to connect to LayerZero network
- **Example Response**:
```json
{
  "success": false,
  "error": "LayerZero connection failed",
  "errorCode": "LAYERZERO_CONNECTION_FAILED",
  "details": "Cannot reach LayerZero endpoint"
}
```

#### LAYERZERO_BRIDGE_ERROR
- **HTTP Status**: 500
- **Description**: LayerZero bridge operation failed
- **Example Response**:
```json
{
  "success": false,
  "error": "LayerZero bridge error",
  "errorCode": "LAYERZERO_BRIDGE_ERROR",
  "details": "Bridge revert: Insufficient liquidity on destination chain"
}
```
- **Resolution**: Check LayerZero bridge liquidity

### Hop Adapter Errors (HOP_ADAPTER_*)

Errors specific to Hop Protocol bridging operations.

#### HOP_BRIDGE_ERROR
- **HTTP Status**: 500
- **Description**: Hop Protocol bridge operation failed
- **Example Response**:
```json
{
  "success": false,
  "error": "Hop bridge error",
  "errorCode": "HOP_BRIDGE_ERROR",
  "details": "Hop bridge reverted: Deadline exceeded"
}
```
- **Resolution**: Increase deadline or retry with new parameters

#### HOP_INSUFFICIENT_LIQUIDITY
- **HTTP Status**: 400
- **Description**: Hop bridge lacks sufficient liquidity for this transfer
- **Example Response**:
```json
{
  "success": false,
  "error": "Insufficient liquidity",
  "errorCode": "HOP_INSUFFICIENT_LIQUIDITY",
  "details": "Bridge liquidity: 100 USDC, requested: 500 USDC"
}
```
- **Resolution**: Reduce transfer amount or use different bridge

## Transaction-Specific Errors

### Transaction Not Found
- **HTTP Status**: 404
- **Endpoint**: `GET /transactions/{id}`
- **Example Response**:
```json
{
  "success": false,
  "error": "Transaction not found",
  "details": "No transaction with ID: txn_invalid_id"
}
```

### Cannot Advance Step
- **HTTP Status**: 400
- **Endpoint**: `PUT /transactions/{id}/advance`
- **Example Response**:
```json
{
  "success": false,
  "error": "Step advancement failed",
  "details": "Current step requires valid signature. Provided signature is invalid"
}
```
- **Resolution**: Check step requirements and provide valid data

## Rate Limiting and Throttling

- **HTTP Status**: 429
- **Description**: Too many requests
- **Example Response**:
```json
{
  "statusCode": 429,
  "message": "Too Many Requests",
  "error": "ThrottlerException"
}
```
- **Resolution**: Wait before retrying, default limit is 10 requests per 60 seconds

## Fee Estimation Errors

### Service Unavailable
- **HTTP Status**: 503
- **Endpoint**: `GET /api/v1/fees`
- **Example Response**:
```json
{
  "success": false,
  "error": "Failed to fetch fee estimates",
  "details": "All fee providers are temporarily unavailable"
}
```
- **Resolution**: Retry after waiting, all adapters may be temporarily down

### Invalid Network Parameter
- **HTTP Status**: 400
- **Endpoint**: `GET /api/v1/fees/network?network=invalid`
- **Example Response**:
```json
{
  "success": false,
  "error": "Invalid network",
  "supportedNetworks": ["stellar", "layerzero", "hop"]
}
```
- **Resolution**: Use one of the supported networks

## Error Handling Best Practices

### 1. Always Check Success Flag
```javascript
const response = await fetch('/transactions');
const data = await response.json();
if (!data.success) {
  console.error('Error:', data.error);
  console.error('Details:', data.details);
}
```

### 2. Implement Exponential Backoff for Retries
```javascript
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
}
```

### 3. Handle Rate Limiting
```javascript
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After');
  console.log(`Rate limited. Retry after ${retryAfter} seconds`);
}
```

### 4. Validate Inputs Before Sending
```javascript
function validateAddress(address, chain) {
  if (chain === 'stellar') {
    return address.startsWith('G') && address.length === 56;
  }
  // ... other validations
}
```

## Debugging Tips

1. **Check request/response in browser DevTools** - Network tab
2. **Use Swagger UI** - Interactive documentation at `/api/docs`
3. **Enable request ID tracking** - Each response includes `X-Request-Id` header
4. **Check server logs** - May contain additional context
5. **Verify environment configuration** - Check `.env` file has all required variables

## Support

For persistent errors:
1. Note the error code and error message
2. Check the error documentation above
3. Verify your input parameters
4. Check BridgeWise status page
5. Contact support@bridgewise.example.com with error code and request ID
