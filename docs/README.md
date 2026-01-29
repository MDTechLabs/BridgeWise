# BridgeWise API Documentation Index

Welcome to the BridgeWise API documentation! This comprehensive guide covers everything you need to know about the public API for cross-chain bridging and transaction orchestration.

## 📚 Documentation Files

### Getting Started
- **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** ⭐ START HERE
  - Fastest way to get up and running
  - Common commands and examples
  - Quick troubleshooting
  - ~200 lines

### Comprehensive Guides
- **[API_DOCUMENTATION.md](./API_DOCUMENTATION.md)** - MAIN GUIDE
  - Complete API overview
  - All 11 endpoints documented
  - Request/response examples
  - Data models and schemas
  - Transaction lifecycle
  - Best practices
  - ~600 lines

- **[OPENAPI_SPECIFICATION.md](./OPENAPI_SPECIFICATION.md)** - TECHNICAL SPEC
  - Full OpenAPI 3.0.0 structure
  - YAML/JSON notation
  - All paths and operations
  - Component schemas
  - Security configuration
  - ~500 lines

### Reference Materials
- **[API_ERRORS.md](./API_ERRORS.md)** - ERROR REFERENCE
  - All error codes documented
  - HTTP status codes
  - Error categories (20+ codes)
  - Resolution guidance
  - Error handling best practices
  - Debugging tips
  - ~400 lines

- **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)** - IMPLEMENTATION DETAILS
  - What was implemented
  - Acceptance criteria checklist
  - Files modified/created
  - Quality metrics
  - Next steps

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run start:dev
```

### 3. Access Swagger UI
Open your browser to:
```
http://localhost:3000/api/docs
```

### 4. Make Your First Request
```bash
# Create a transaction
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

## 📖 Learning Path

### For API Users
1. Read [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) (5 min)
2. Try endpoints in Swagger UI at `/api/docs` (10 min)
3. Review relevant sections in [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) (20 min)
4. Check [API_ERRORS.md](./API_ERRORS.md) for error handling (10 min)

### For Developers
1. Review [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) (10 min)
2. Check [OPENAPI_SPECIFICATION.md](./OPENAPI_SPECIFICATION.md) (15 min)
3. Examine controller decorators in source code (20 min)
4. Review DTOs with Swagger annotations (10 min)

### For DevOps/Integrations
1. Review [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) architecture section
2. Check endpoints and rate limiting in [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
3. Review CORS and security in [OPENAPI_SPECIFICATION.md](./OPENAPI_SPECIFICATION.md)
4. Plan error handling using [API_ERRORS.md](./API_ERRORS.md)

---

## 🔑 Key Features

✅ **Complete OpenAPI/Swagger Documentation**
- All 11 endpoints fully documented
- Interactive Swagger UI for testing
- Request/response examples for every endpoint
- Real-world use cases

✅ **Comprehensive Error Documentation**
- 20+ error codes documented
- HTTP status code mappings
- Example error responses
- Resolution guidance for each error

✅ **Adapter-Specific Annotations**
- Stellar-specific fields clearly marked
- LayerZero omnichain details
- Hop Protocol bridge parameters
- Example data for each blockchain

✅ **Example Responses**
- Multiple examples for different scenarios
- Success and error cases
- Real network data examples
- Server-Sent Events format examples

---

## 🌐 API Overview

### Base URLs
- **Development**: `http://localhost:3000`
- **Production**: `https://api.bridgewise.example.com`

### Supported Networks
- **Stellar** - Direct blockchain payments
- **LayerZero** - Omnichain bridging
- **Hop Protocol** - Multi-chain liquidity bridges

### Core Operations
- **Transactions** - Create, manage, track
- **Fee Estimation** - Network fees across all chains
- **Real-time Updates** - SSE or polling

---

## 📊 Documentation Statistics

| Category | Count | Lines |
|----------|-------|-------|
| Endpoints | 11 | ~300 |
| Error Codes | 20+ | ~400 |
| Examples | 20+ | ~200 |
| Adapters | 3 | ~100 |
| **Total** | **~** | **~2000** |

---

## 🎯 Common Tasks

### Access Interactive Swagger UI
```
http://localhost:3000/api/docs
```

### Get All Fee Estimates
```bash
curl http://localhost:3000/api/v1/fees
```

### Create a Transaction
See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) or [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)

### Monitor Transaction with SSE
See Transaction Monitoring section in [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)

### Handle Errors
See [API_ERRORS.md](./API_ERRORS.md) for error codes and solutions

### Check Service Health
```bash
curl http://localhost:3000/api/v1/fees/health
```

---

## 🔗 Related Files

### Source Code
- `src/app.controller.ts` - Health check endpoint
- `src/transactions/transactions.controller.ts` - Transaction endpoints (6 endpoints)
- `src/gas-estimation/fee-estimation.controller.ts` - Fee endpoints (3 endpoints)
- `src/transactions/dto/create-transaction.dto.ts` - Transaction creation schema
- `src/transactions/dto/update-transaction.dto.ts` - Transaction update schema

### Configuration
- `src/main.ts` - Swagger/OpenAPI setup
- `package.json` - Dependencies (@nestjs/swagger, swagger-ui-express)

---

## ❓ FAQ

### Where do I start?
→ Begin with [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for a 5-minute overview.

### How do I test the API?
→ Use the interactive Swagger UI at `/api/docs` or use curl commands in [QUICK_REFERENCE.md](./QUICK_REFERENCE.md).

### What are the supported networks?
→ Stellar, LayerZero, and Hop Protocol. See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for details.

### How do I handle errors?
→ See [API_ERRORS.md](./API_ERRORS.md) for all error codes and resolution steps.

### Where is the OpenAPI spec?
→ Automatically served at `http://localhost:3000/api/docs` or see [OPENAPI_SPECIFICATION.md](./OPENAPI_SPECIFICATION.md).

### How do I monitor transactions in real-time?
→ Use Server-Sent Events (SSE) at `/transactions/{id}/events` or polling at `/transactions/{id}/poll`.

### What are the rate limits?
→ 10 requests per 60 seconds per IP. See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for details.

### Is authentication required?
→ Currently no. Authentication may be added in future versions (see IMPLEMENTATION_SUMMARY.md).

---

## 📞 Support

### Documentation
- **Main Guide**: [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
- **Quick Help**: [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
- **Errors**: [API_ERRORS.md](./API_ERRORS.md)

### Interactive Tools
- **Swagger UI**: http://localhost:3000/api/docs (after starting server)
- **OpenAPI JSON**: http://localhost:3000/api-json

### Contact
- **Email**: support@bridgewise.example.com
- **Docs Site**: https://docs.bridgewise.example.com
- **Status**: https://status.bridgewise.example.com

---

## 📋 Checklist for New Developers

- [ ] Read [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) (5 min)
- [ ] Run `npm install` (2 min)
- [ ] Start with `npm run start:dev` (2 min)
- [ ] Access Swagger UI at `/api/docs` (1 min)
- [ ] Try one endpoint from [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) (5 min)
- [ ] Read [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) relevant sections (20 min)
- [ ] Review [API_ERRORS.md](./API_ERRORS.md) for error handling (10 min)
- [ ] Check [OPENAPI_SPECIFICATION.md](./OPENAPI_SPECIFICATION.md) for schemas (15 min)

**Total Time**: ~60 minutes to be productive

---

## 🎉 What's New (v1.0.0)

✅ **Initial Release Features**
- Complete OpenAPI 3.0.0 specification
- 11 fully documented endpoints
- Server-Sent Events (SSE) support
- Fee estimation for 3 blockchains
- Transaction management system
- Comprehensive error documentation
- Interactive Swagger UI
- Production-ready

---

## 📝 Document Versions

| Document | Version | Updated |
|----------|---------|---------|
| API_DOCUMENTATION.md | 1.0.0 | 2026-01-29 |
| QUICK_REFERENCE.md | 1.0.0 | 2026-01-29 |
| API_ERRORS.md | 1.0.0 | 2026-01-29 |
| OPENAPI_SPECIFICATION.md | 1.0.0 | 2026-01-29 |
| IMPLEMENTATION_SUMMARY.md | 1.0.0 | 2026-01-29 |
| README.md (this file) | 1.0.0 | 2026-01-29 |

---

## 🚀 Next Steps

1. **Immediate**: Start with [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
2. **Short-term**: Explore [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
3. **Setup**: Run `npm install` and `npm run start:dev`
4. **Test**: Use Swagger UI at `/api/docs`
5. **Integrate**: Build your integration using examples provided

---

**Welcome to BridgeWise! 🌉**

For the fastest onboarding, start with [QUICK_REFERENCE.md](./QUICK_REFERENCE.md).

For comprehensive details, see [API_DOCUMENTATION.md](./API_DOCUMENTATION.md).

For error handling, check [API_ERRORS.md](./API_ERRORS.md).

---

*Generated: 2026-01-29*  
*API Version: 1.0.0*  
*Documentation Version: 1.0.0*
