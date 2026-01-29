# BridgeWise API - Quick Reference Guide

## Getting Started

### Start the Server
```bash
npm install  # Install new Swagger dependencies
npm run start:dev
```

### Access Documentation
- **Interactive Swagger UI**: http://localhost:3000/api/docs
- **Static Documentation**: See `docs/` folder
- **Error Reference**: `docs/API_ERRORS.md`

---

## Core Endpoints

### Transaction Management
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/transactions` | Create new transaction |
| GET | `/transactions/{id}` | Get transaction status |
| PUT | `/transactions/{id}` | Update transaction |
| PUT | `/transactions/{id}/advance` | Move to next step |
| GET | `/transactions/{id}/events` | Real-time updates (SSE) |
| GET | `/transactions/{id}/poll` | Poll status (fallback) |

### Fee Estimation
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/fees` | All networks fees |
| GET | `/api/v1/fees/network?network=stellar` | Specific network fee |
| GET | `/api/v1/fees/health` | Service health check |

### Health
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/` | API health check |

---

## Transaction Types

```
"stellar-payment"         - Direct Stellar payment
"stellar-path-payment"    - Stellar multi-path payment
"hop-bridge"             - Hop Protocol cross-chain bridge
"layerzero-omnichain"    - LayerZero omnichain transfer
```

---

## Transaction Status States

```
pending       → Initial state
in-progress   → Being processed
completed     → Successfully finished
failed        → Encountered error
```

---

## Fee Levels

```
slow      - Lower fee, longer confirmation
standard  - Balanced fee and speed
fast      - Higher fee, faster confirmation
```

---

## Supported Networks

### Stellar
- Network: `stellar`
- Currency: `stroops` (1 XLM = 10^7 stroops)
- Decimals: 7

### LayerZero
- Network: `layerzero`
- Currency: `GWEI`
- Omnichain routing enabled

### Hop Protocol
- Network: `hop`
- Currency: `ETH`
- Supported tokens: USDC, USDT, ETH, MATIC

---

## Common Request Examples

### Create Stellar Payment Transaction
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

### Get All Fee Estimates
```bash
curl http://localhost:3000/api/v1/fees | jq
```

### Get Stellar Fees
```bash
curl "http://localhost:3000/api/v1/fees/network?network=stellar" | jq
```

### Advance Transaction Step
```bash
curl -X PUT http://localhost:3000/transactions/{id}/advance \
  -H "Content-Type: application/json" \
  -d '{"signature": "YOUR_SIGNATURE"}'
```

### Stream Transaction Events
```bash
curl http://localhost:3000/transactions/{id}/events
```

---

## Response Structure

### Success Response
```json
{
  "success": true,
  "data": { /* actual data */ }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error category",
  "details": "Detailed error message",
  "errorCode": "ERROR_CATEGORY_TYPE"
}
```

---

## HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | Transaction retrieved |
| 201 | Created | Transaction created |
| 400 | Bad Request | Invalid input |
| 404 | Not Found | Transaction not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Service failure |
| 503 | Service Unavailable | All providers down |

---

## Common Errors

### Invalid Network
```json
{
  "success": false,
  "error": "Invalid network",
  "supportedNetworks": ["stellar", "layerzero", "hop"]
}
```

### Transaction Not Found
```json
{
  "success": false,
  "error": "Transaction not found",
  "details": "No transaction with ID: txn_invalid"
}
```

### Validation Error
```json
{
  "success": false,
  "error": "Validation error",
  "details": [
    { "field": "amount", "message": "amount must be positive" }
  ]
}
```

---

## JavaScript/Node.js Examples

### Create Transaction
```javascript
const response = await fetch('http://localhost:3000/transactions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'stellar-payment',
    metadata: { /* ... */ },
    totalSteps: 3
  })
});
const tx = await response.json();
console.log('Transaction ID:', tx.id);
```

### Monitor with SSE
```javascript
const eventSource = new EventSource(
  `http://localhost:3000/transactions/${txId}/events`
);
eventSource.onmessage = (event) => {
  const tx = JSON.parse(event.data);
  console.log('Status:', tx.status);
};
```

### Get Fees
```javascript
const response = await fetch('http://localhost:3000/api/v1/fees');
const data = await response.json();
const stellarFees = data.data.networks.stellar.fees;
console.log('Stellar fee:', stellarFees.standard);
```

---

## Rate Limits

- **Limit**: 10 requests per 60 seconds per IP
- **Header**: Check `X-RateLimit-Remaining` and `X-RateLimit-Reset`
- **Wait time**: Implement exponential backoff on 429 responses

---

## Caching

**Cached endpoints** (10 second cache):
- GET `/api/v1/fees`
- GET `/api/v1/fees/network`

**Not cached**:
- GET `/api/v1/fees/health` (always fresh)

---

## Adapter-Specific Fields

### Stellar
- `baseFee` - Base fee in stroops
- `symbol` - "XLM"
- `percentiles` - Fee percentiles (p10, p50, p90)

### LayerZero
- `sourceChain` - Source blockchain
- `destinationChain` - Destination blockchain
- `priorityFee` - Priority/tip fee

### Hop
- `lpFee` - Liquidity provider fee
- `bonderFee` - Bonder fee
- `token` - Bridge token (USDC, USDT, etc.)

---

## Troubleshooting

### "Transaction not found"
- Verify transaction ID is correct
- Check if transaction was actually created
- See: `docs/API_ERRORS.md`

### "Invalid network"
- Use: stellar, layerzero, or hop
- Check network parameter spelling

### Rate limited (429)
- Wait 60 seconds
- Implement exponential backoff
- Contact support if persistent

### Service unavailable (503)
- Fee providers are temporarily down
- Retry after a few seconds
- Check status page

---

## Documentation Files

| File | Purpose |
|------|---------|
| `docs/API_DOCUMENTATION.md` | Complete API guide (600+ lines) |
| `docs/OPENAPI_SPECIFICATION.md` | Technical OpenAPI spec |
| `docs/API_ERRORS.md` | Error reference with solutions |
| `docs/IMPLEMENTATION_SUMMARY.md` | Implementation details |

---

## Swagger UI Features

When accessing `/api/docs`:

1. **Try It Out** - Send actual requests from browser
2. **Authorize** - Set authentication (when implemented)
3. **Models** - View schema definitions
4. **Execute** - See real responses
5. **Download** - Get OpenAPI JSON/YAML

---

## API Information

- **Version**: 1.0.0
- **Title**: BridgeWise API
- **Base URL**: `http://localhost:3000` (dev)
- **Production**: `https://api.bridgewise.example.com`
- **Documentation**: `/api/docs`

---

## Support Resources

- **Documentation**: See `docs/` folder
- **Swagger UI**: http://localhost:3000/api/docs
- **Issues**: Check `docs/API_ERRORS.md`
- **Email**: support@bridgewise.example.com
- **Docs Site**: https://docs.bridgewise.example.com

---

**Last Updated**: 2026-01-29  
**Quick Reference Version**: 1.0.0
