# BridgeWise Public API Documentation

## Overview

BridgeWise is a comprehensive cross-chain bridging and transaction orchestration API that enables seamless asset transfers and fee estimation across multiple blockchain networks. The API provides RESTful endpoints for creating and managing transactions, streaming real-time updates, and estimating network fees across Stellar, LayerZero, and Hop Protocol.

**API Base URL**: `http://localhost:3000` (development) | `https://api.bridgewise.example.com` (production)

**API Version**: 1.0.0

**API Documentation (Swagger UI)**: Visit `/api/docs` after starting the server

---

## Quick Start

### 1. Health Check

Verify the API is operational:

```bash
curl http://localhost:3000/
```

**Response** (200 OK):
```
Hello World!
```

### 2. Get Fee Estimates

Retrieve current fee estimates for all networks:

```bash
curl http://localhost:3000/api/v1/fees
```

### 3. Create a Transaction

Initialize a new cross-chain transaction:

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "stellar-payment",
    "metadata": {
      "sourceAccount": "GCXMWUAUF37IWOABB3GNXFZB7TBBBHL3IJKUSJUWVEKM3CXEGTHUMDSD",
      "destinationAccount": "GBRPYHIL2CI3WHZSRJQEMQ5CPQIS2TCCQ7OXJGGUFR7XUWVEPSWR47U",
      "amount": "100",
      "asset": "native"
    },
    "totalSteps": 3
  }'
```

---

## API Endpoints

### Health & Status

#### GET `/`

Health check endpoint. Returns a simple message indicating the API is operational.

**Response**: `200 OK`
```
Hello World!
```

---

### Transactions

#### POST `/transactions`

Create a new cross-chain transaction.

**Request Body**:
```json
{
  "type": "stellar-payment",
  "metadata": {
    "sourceAccount": "GCXMWUAUF37IWOABB3GNXFZB7TBBBHL3IJKUSJUWVEKM3CXEGTHUMDSD",
    "destinationAccount": "GBRPYHIL2CI3WHZSRJQEMQ5CPQIS2TCCQ7OXJGGUFR7XUWVEPSWR47U",
    "amount": "100",
    "asset": "native",
    "memo": "Cross-chain transfer"
  },
  "totalSteps": 3
}
```

**Response**: `201 Created`
```json
{
  "id": "txn_550e8400e29b41d4a716446655440000",
  "type": "stellar-payment",
  "status": "pending",
  "currentStep": 0,
  "totalSteps": 3,
  "metadata": {
    "sourceAccount": "GCXMWUAUF37IWOABB3GNXFZB7TBBBHL3IJKUSJUWVEKM3CXEGTHUMDSD",
    "destinationAccount": "GBRPYHIL2CI3WHZSRJQEMQ5CPQIS2TCCQ7OXJGGUFR7XUWVEPSWR47U"
  },
  "createdAt": "2026-01-29T10:00:00.000Z"
}
```

**Error**: `400 Bad Request`
```json
{
  "success": false,
  "error": "Validation error",
  "details": [
    {
      "field": "type",
      "message": "type must be a string"
    }
  ]
}
```

---

#### GET `/transactions/{id}`

Retrieve the current state and details of a transaction.

**Parameters**:
- `id` (path, required): Unique transaction identifier

**Example**:
```bash
curl http://localhost:3000/transactions/txn_550e8400e29b41d4a716446655440000
```

**Response**: `200 OK`
```json
{
  "id": "txn_550e8400e29b41d4a716446655440000",
  "type": "stellar-payment",
  "status": "in-progress",
  "currentStep": 1,
  "totalSteps": 3,
  "metadata": {
    "sourceAccount": "GCXMWUAUF37IWOABB3GNXFZB7TBBBHL3IJKUSJUWVEKM3CXEGTHUMDSD",
    "txHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  },
  "state": {
    "validated": true,
    "submitted": true
  },
  "createdAt": "2026-01-29T10:00:00.000Z",
  "updatedAt": "2026-01-29T10:00:05.000Z"
}
```

**Error**: `404 Not Found`
```json
{
  "success": false,
  "error": "Transaction not found",
  "details": "No transaction with ID txn_invalid"
}
```

---

#### PUT `/transactions/{id}`

Update transaction properties.

**Parameters**:
- `id` (path, required): Unique transaction identifier

**Request Body**:
```json
{
  "status": "completed"
}
```

**Response**: `200 OK`
```json
{
  "id": "txn_550e8400e29b41d4a716446655440000",
  "type": "stellar-payment",
  "status": "completed",
  "currentStep": 3,
  "totalSteps": 3,
  "updatedAt": "2026-01-29T10:00:15.000Z"
}
```

---

#### PUT `/transactions/{id}/advance`

Advance the transaction to the next step in its workflow.

**Parameters**:
- `id` (path, required): Unique transaction identifier

**Request Body** (optional, step-specific):
```json
{
  "signature": "TAQCSRX2RIDJNHFYFZXPGXWRWQUXNZKICH57C4YKHUYATFLBMUUPAA2DWS5PDVLXP6GQ6SDFGJJWMKHW"
}
```

**Response**: `200 OK`
```json
{
  "id": "txn_550e8400e29b41d4a716446655440000",
  "type": "stellar-payment",
  "status": "in-progress",
  "currentStep": 2,
  "totalSteps": 3,
  "updatedAt": "2026-01-29T10:00:10.000Z"
}
```

**Error**: `400 Bad Request`
```json
{
  "success": false,
  "error": "Step advancement failed",
  "details": "Invalid signature provided"
}
```

---

#### GET `/transactions/{id}/events` (Server-Sent Events)

Establish a real-time connection to receive transaction updates via Server-Sent Events.

**Parameters**:
- `id` (path, required): Unique transaction identifier

**Example**:
```bash
curl http://localhost:3000/transactions/txn_550e8400e29b41d4a716446655440000/events
```

**Stream Response**:
```
data: {"id":"txn_550e8400e29b41d4a716446655440000","status":"in-progress","currentStep":1}

data: {"id":"txn_550e8400e29b41d4a716446655440000","status":"completed","currentStep":3}
```

---

#### GET `/transactions/{id}/poll`

Poll endpoint as fallback to Server-Sent Events for retrieving transaction status.

**Parameters**:
- `id` (path, required): Unique transaction identifier

**Response**: `200 OK`
```json
{
  "id": "txn_550e8400e29b41d4a716446655440000",
  "type": "stellar-payment",
  "status": "in-progress",
  "currentStep": 1,
  "totalSteps": 3,
  "updatedAt": "2026-01-29T10:00:10.000Z"
}
```

---

### Fee Estimation

#### GET `/api/v1/fees`

Retrieve current fee estimates from all supported blockchain networks.

**Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "timestamp": 1706526000000,
    "networks": {
      "stellar": {
        "network": "stellar",
        "available": true,
        "fees": {
          "slow": "100",
          "standard": "150",
          "fast": "200"
        },
        "currency": "stroops",
        "estimatedTime": {
          "slow": 30000,
          "standard": 15000,
          "fast": 5000
        },
        "lastUpdated": 1706525990000,
        "additionalData": {
          "baseFee": "100",
          "decimals": 7,
          "symbol": "XLM"
        }
      },
      "layerzero": {
        "network": "layerzero",
        "available": true,
        "fees": {
          "slow": "0.5",
          "standard": "0.75",
          "fast": "1.0"
        },
        "currency": "GWEI",
        "estimatedTime": {
          "slow": 20000,
          "standard": 12000,
          "fast": 3000
        },
        "lastUpdated": 1706525985000,
        "additionalData": {
          "sourceChain": "ethereum",
          "destinationChain": "polygon"
        }
      },
      "hop": {
        "network": "hop",
        "available": true,
        "fees": {
          "slow": "0.1",
          "standard": "0.15",
          "fast": "0.2"
        },
        "currency": "ETH",
        "estimatedTime": {
          "slow": 25000,
          "standard": 15000,
          "fast": 5000
        },
        "lastUpdated": 1706525980000,
        "additionalData": {
          "lpFee": "0.05",
          "bonderFee": "0.08"
        }
      }
    },
    "metadata": {
      "successfulProviders": 3,
      "totalProviders": 3
    }
  }
}
```

**Error**: `500 Internal Server Error`
```json
{
  "success": false,
  "error": "Failed to fetch fee estimates",
  "details": "Connection timeout to fee provider"
}
```

---

#### GET `/api/v1/fees/network`

Get fee estimate for a specific blockchain network.

**Parameters**:
- `network` (query, required): Network name (stellar, layerzero, or hop)

**Example**:
```bash
curl "http://localhost:3000/api/v1/fees/network?network=stellar"
```

**Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "network": "stellar",
    "available": true,
    "fees": {
      "slow": "100",
      "standard": "150",
      "fast": "200"
    },
    "currency": "stroops",
    "estimatedTime": {
      "slow": 30000,
      "standard": 15000,
      "fast": 5000
    },
    "lastUpdated": 1706525990000,
    "additionalData": {
      "baseFee": "100",
      "decimals": 7,
      "symbol": "XLM"
    }
  }
}
```

**Error**: `400 Bad Request`
```json
{
  "success": false,
  "error": "Invalid network",
  "supportedNetworks": ["stellar", "layerzero", "hop"]
}
```

---

#### GET `/api/v1/fees/health`

Health check for the fee estimation service and all network adapters.

**Response**: `200 OK`
```json
{
  "success": true,
  "healthy": true,
  "providers": {
    "total": 3,
    "available": 3,
    "unavailable": 0
  },
  "networks": {
    "stellar": true,
    "layerzero": true,
    "hop": true
  },
  "timestamp": 1706526000000
}
```

**Error**: `503 Service Unavailable`
```json
{
  "success": true,
  "healthy": false,
  "providers": {
    "total": 3,
    "available": 0,
    "unavailable": 3
  },
  "networks": {
    "stellar": false,
    "layerzero": false,
    "hop": false
  },
  "timestamp": 1706526000000
}
```

---

## Data Models

### Transaction

Represents a cross-chain transaction orchestration.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique transaction identifier |
| `type` | string | Transaction type (stellar-payment, hop-bridge, layerzero-omnichain) |
| `status` | string | Current status (pending, in-progress, completed, failed) |
| `currentStep` | number | Current step number in workflow |
| `totalSteps` | number | Total steps required for completion |
| `metadata` | object | Network-specific transaction parameters |
| `state` | object | Internal state flags (validated, submitted, confirmed) |
| `error` | string | Error message if transaction failed |
| `createdAt` | ISO 8601 | Transaction creation timestamp |
| `updatedAt` | ISO 8601 | Last update timestamp |

### Fee Estimate

Represents network fee information for a blockchain.

| Field | Type | Description |
|-------|------|-------------|
| `network` | string | Network name (stellar, layerzero, hop) |
| `available` | boolean | Whether network is currently available |
| `fees` | object | Fee levels: slow, standard, fast (string values) |
| `currency` | string | Fee denomination (stroops, GWEI, ETH) |
| `estimatedTime` | object | Estimated confirmation time in milliseconds |
| `lastUpdated` | number | Last update timestamp (ms) |
| `additionalData` | object | Adapter-specific fields (varies by network) |

### Adapter-Specific Fields

#### Stellar Additional Data
- `baseFee`: Base fee in stroops
- `decimals`: Decimal precision (7)
- `symbol`: Asset symbol (XLM)
- `percentiles`: Fee percentiles (p10, p50, p90)

#### LayerZero Additional Data
- `sourceChain`: Source blockchain network
- `destinationChain`: Destination blockchain network
- `baseFee`: Base fee amount
- `priorityFee`: Priority/tip fee amount

#### Hop Additional Data
- `token`: Bridge token (USDC, USDT, ETH, MATIC)
- `sourceChain`: Source blockchain network
- `destinationChain`: Destination blockchain network
- `lpFee`: Liquidity provider fee
- `bonderFee`: Bonder fee for liquidity provision
- `estimatedReceived`: Estimated amount received after fees
- `amountOutMin`: Minimum amount out (slippage protection)
- `gasEstimate`: Estimated gas usage

---

## Authentication

Currently, the BridgeWise API does not require authentication. All endpoints are publicly accessible.

**Note**: API key authentication may be added in future versions for rate limiting and usage tracking.

---

## Rate Limiting

The API implements rate limiting to prevent abuse:

- **Limit**: 10 requests per 60 seconds per IP
- **Status Code**: 429 Too Many Requests
- **Response**:
```json
{
  "statusCode": 429,
  "message": "Too Many Requests",
  "error": "ThrottlerException"
}
```

**Recommended Practice**: Implement exponential backoff when encountering rate limits.

---

## Caching

Certain endpoints return cached responses:

- **GET `/api/v1/fees`**: Cached for 10 seconds
- **GET `/api/v1/fees/network`**: Cached for 10 seconds
- **GET `/api/v1/fees/health`**: Not cached (always fresh)

Cache helps reduce load on external fee providers and improves response times.

---

## Error Handling

See [API_ERRORS.md](./API_ERRORS.md) for comprehensive error documentation including:
- All error codes and their meanings
- HTTP status codes
- Example error responses
- Resolution guidance
- Error handling best practices

---

## Transaction Lifecycle

### Typical Transaction Flow

1. **Create** → POST `/transactions`
   - Returns transaction with `status: pending`

2. **Monitor** → GET `/transactions/{id}` or SSE `/transactions/{id}/events`
   - Status changes from `pending` → `in-progress` → `completed`

3. **Advance Steps** → PUT `/transactions/{id}/advance`
   - Optionally provide step-specific data
   - Increments `currentStep`

4. **Complete** → Status reaches `completed` when `currentStep === totalSteps`

### Example Transaction States

```
Step 0 (Pending):
- status: pending
- state: {}

Step 1 (Validated):
- status: in-progress
- currentStep: 1
- state: { validated: true }

Step 2 (Submitted):
- status: in-progress
- currentStep: 2
- state: { validated: true, submitted: true }

Step 3 (Confirmed):
- status: completed
- currentStep: 3
- state: { validated: true, submitted: true, confirmed: true }
```

---

## Best Practices

### 1. Always Use Try-Catch and Check Success Flag
```javascript
try {
  const response = await fetch('/transactions');
  const data = await response.json();
  if (!data.success) {
    console.error('API Error:', data.error);
  }
} catch (error) {
  console.error('Network error:', error);
}
```

### 2. Use Server-Sent Events for Real-Time Monitoring
```javascript
const eventSource = new EventSource(`/transactions/${txId}/events`);
eventSource.onmessage = (event) => {
  const transaction = JSON.parse(event.data);
  console.log('Transaction updated:', transaction);
};
```

### 3. Implement Exponential Backoff for Retries
```javascript
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const delay = Math.pow(2, i) * 1000;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
```

### 4. Validate Inputs Before Sending
```javascript
function validateStellarAddress(address) {
  return /^G[A-Z2-7]{55}$/.test(address);
}
```

### 5. Cache Fee Estimates Locally
```javascript
let cachedFees = null;
let lastFetchTime = 0;

async function getFeeEstimates() {
  const now = Date.now();
  if (cachedFees && now - lastFetchTime < 10000) {
    return cachedFees;
  }
  const response = await fetch('/api/v1/fees');
  cachedFees = await response.json();
  lastFetchTime = now;
  return cachedFees;
}
```

---

## SDK / Client Libraries

Official client libraries for popular languages:

- **JavaScript/TypeScript**: `@bridgewise/sdk` (npm)
- **Python**: `bridgewise-sdk` (pip)
- **Go**: `github.com/bridgewise/go-sdk`

(Add links when available)

---

## Changelog

### Version 1.0.0 (2026-01-29)
- Initial public API release
- Support for Stellar, LayerZero, and Hop Protocol
- Transaction management endpoints
- Fee estimation across all networks
- Server-Sent Events for real-time updates
- Complete OpenAPI/Swagger documentation

---

## Support & Feedback

- **Documentation**: https://docs.bridgewise.example.com
- **Status Page**: https://status.bridgewise.example.com
- **Email Support**: support@bridgewise.example.com
- **Issues/Feedback**: https://github.com/bridgewise/api/issues

---

## License

BridgeWise API is provided as-is under the terms specified in the LICENSE file.

---

**Last Updated**: 2026-01-29  
**API Version**: 1.0.0  
**Swagger UI**: Available at `/api/docs`
