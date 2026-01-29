# OpenAPI 3.0.0 Specification - BridgeWise API

This document describes the OpenAPI 3.0.0 specification for the BridgeWise API.

## Overview

```yaml
openapi: 3.0.0
info:
  title: BridgeWise API
  description: >
    BridgeWise is a comprehensive cross-chain bridging and transaction 
    orchestration API that enables seamless asset transfers and fee estimation 
    across multiple blockchain networks including Stellar, LayerZero, and Hop Protocol.
  version: 1.0.0
  contact:
    name: BridgeWise Support
    url: https://bridgewise.example.com
    email: support@bridgewise.example.com
  license:
    name: UNLICENSED

servers:
  - url: http://localhost:3000
    description: Local development server
  - url: https://api.bridgewise.example.com
    description: Production server

tags:
  - name: Health
    description: Health check and status endpoints
  - name: Transactions
    description: Transaction creation, management and tracking
  - name: Fee Estimation
    description: Network fee estimation and gas cost prediction
```

## Paths

### GET /

**Summary**: Health check endpoint

**Tags**: Health

**Parameters**: None

**Responses**:
- 200: API is healthy and operational
  - Content-Type: text/plain
  - Body: "Hello World!"

### POST /transactions

**Summary**: Create a new transaction

**Tags**: Transactions

**Request Body**:
```yaml
content:
  application/json:
    schema:
      $ref: '#/components/schemas/CreateTransactionDto'
```

**Responses**:
- 201: Transaction created successfully
  ```yaml
  content:
    application/json:
      schema:
        $ref: '#/components/schemas/Transaction'
  ```

- 400: Invalid input - validation error
  ```yaml
  content:
    application/json:
      schema:
        $ref: '#/components/schemas/ValidationError'
  ```

### GET /transactions/{id}

**Summary**: Get transaction details

**Tags**: Transactions

**Parameters**:
- `id` (path, required): Unique transaction identifier

**Responses**:
- 200: Transaction details retrieved successfully
  ```yaml
  schema:
    $ref: '#/components/schemas/Transaction'
  ```

- 404: Transaction not found
  ```yaml
  schema:
    $ref: '#/components/schemas/NotFoundError'
  ```

### PUT /transactions/{id}

**Summary**: Update transaction

**Tags**: Transactions

**Parameters**:
- `id` (path, required): Unique transaction identifier

**Request Body**:
```yaml
content:
  application/json:
    schema:
      $ref: '#/components/schemas/UpdateTransactionDto'
```

**Responses**:
- 200: Transaction updated successfully
  ```yaml
  schema:
    $ref: '#/components/schemas/Transaction'
  ```

### PUT /transactions/{id}/advance

**Summary**: Advance transaction to next step

**Tags**: Transactions

**Parameters**:
- `id` (path, required): Unique transaction identifier

**Request Body**:
```yaml
content:
  application/json:
    schema:
      type: object
      additionalProperties: true
```

**Responses**:
- 200: Transaction advanced to next step
  ```yaml
  schema:
    $ref: '#/components/schemas/Transaction'
  ```

- 400: Cannot advance - step validation failed
  ```yaml
  schema:
    $ref: '#/components/schemas/StepAdvancementError'
  ```

### GET /transactions/{id}/events

**Summary**: Stream transaction updates (Server-Sent Events)

**Tags**: Transactions

**Parameters**:
- `id` (path, required): Unique transaction identifier

**Responses**:
- 200: SSE stream established
  ```yaml
  content:
    text/event-stream:
      schema:
        $ref: '#/components/schemas/Transaction'
  ```

### GET /transactions/{id}/poll

**Summary**: Poll transaction status (fallback to SSE)

**Tags**: Transactions

**Parameters**:
- `id` (path, required): Unique transaction identifier

**Responses**:
- 200: Transaction status retrieved
  ```yaml
  schema:
    $ref: '#/components/schemas/Transaction'
  ```

### GET /api/v1/fees

**Summary**: Get fee estimates for all supported networks

**Tags**: Fee Estimation

**Parameters**: None

**Responses**:
- 200: Fee estimates retrieved successfully
  ```yaml
  schema:
    $ref: '#/components/schemas/FeeEstimatesResponse'
  ```

- 500: Internal server error
  ```yaml
  schema:
    $ref: '#/components/schemas/ServerError'
  ```

### GET /api/v1/fees/network

**Summary**: Get fee estimate for a specific network

**Tags**: Fee Estimation

**Parameters**:
- `network` (query, required, enum): stellar, layerzero, hop

**Responses**:
- 200: Fee estimate retrieved successfully
  ```yaml
  schema:
    oneOf:
      - $ref: '#/components/schemas/StellarFeeEstimate'
      - $ref: '#/components/schemas/LayerZeroFeeEstimate'
      - $ref: '#/components/schemas/HopFeeEstimate'
  ```

- 400: Invalid network specified
  ```yaml
  schema:
    $ref: '#/components/schemas/InvalidNetworkError'
  ```

### GET /api/v1/fees/health

**Summary**: Health check for fee estimation service

**Tags**: Fee Estimation

**Parameters**: None

**Responses**:
- 200: Service health status
  ```yaml
  schema:
    $ref: '#/components/schemas/HealthCheckResponse'
  ```

- 503: Service unhealthy
  ```yaml
  schema:
    $ref: '#/components/schemas/HealthCheckResponse'
  ```

## Components

### Schemas

#### CreateTransactionDto
```yaml
type: object
required:
  - type
properties:
  type:
    type: string
    enum:
      - stellar-payment
      - stellar-path-payment
      - hop-bridge
      - layerzero-omnichain
  metadata:
    type: object
    additionalProperties: true
    description: Network-specific transaction parameters
  totalSteps:
    type: number
    minimum: 1
    maximum: 10
```

#### UpdateTransactionDto
```yaml
type: object
properties:
  status:
    type: string
    enum:
      - pending
      - in-progress
      - completed
      - failed
  state:
    type: object
    additionalProperties: true
  currentStep:
    type: number
    minimum: 0
  error:
    type: string
```

#### Transaction
```yaml
type: object
required:
  - id
  - type
  - status
  - currentStep
  - totalSteps
properties:
  id:
    type: string
    format: uuid
  type:
    type: string
  status:
    type: string
    enum:
      - pending
      - in-progress
      - completed
      - failed
  currentStep:
    type: number
  totalSteps:
    type: number
  metadata:
    type: object
    additionalProperties: true
  state:
    type: object
    additionalProperties: true
  error:
    type: string
    nullable: true
  createdAt:
    type: string
    format: date-time
  updatedAt:
    type: string
    format: date-time
```

#### FeeLevel
```yaml
type: object
properties:
  slow:
    type: string
  standard:
    type: string
  fast:
    type: string
```

#### TimeEstimate
```yaml
type: object
properties:
  slow:
    type: number
  standard:
    type: number
  fast:
    type: number
```

#### FeeEstimate
```yaml
type: object
properties:
  network:
    type: string
    enum:
      - stellar
      - layerzero
      - hop
  available:
    type: boolean
  fees:
    $ref: '#/components/schemas/FeeLevel'
  currency:
    type: string
  estimatedTime:
    $ref: '#/components/schemas/TimeEstimate'
  lastUpdated:
    type: number
  additionalData:
    type: object
    additionalProperties: true
```

#### StellarFeeEstimate
```yaml
allOf:
  - $ref: '#/components/schemas/FeeEstimate'
  - type: object
    properties:
      additionalData:
        type: object
        properties:
          baseFee:
            type: string
          decimals:
            type: number
          symbol:
            type: string
```

#### LayerZeroFeeEstimate
```yaml
allOf:
  - $ref: '#/components/schemas/FeeEstimate'
  - type: object
    properties:
      additionalData:
        type: object
        properties:
          sourceChain:
            type: string
          destinationChain:
            type: string
```

#### HopFeeEstimate
```yaml
allOf:
  - $ref: '#/components/schemas/FeeEstimate'
  - type: object
    properties:
      additionalData:
        type: object
        properties:
          token:
            type: string
          sourceChain:
            type: string
          destinationChain:
            type: string
          lpFee:
            type: string
          bonderFee:
            type: string
          estimatedReceived:
            type: string
          amountOutMin:
            type: string
          gasEstimate:
            type: string
```

#### FeeEstimatesResponse
```yaml
type: object
properties:
  success:
    type: boolean
  data:
    type: object
    properties:
      timestamp:
        type: number
      networks:
        type: object
        properties:
          stellar:
            $ref: '#/components/schemas/StellarFeeEstimate'
          layerzero:
            $ref: '#/components/schemas/LayerZeroFeeEstimate'
          hop:
            $ref: '#/components/schemas/HopFeeEstimate'
      metadata:
        type: object
        properties:
          successfulProviders:
            type: number
          totalProviders:
            type: number
```

#### HealthCheckResponse
```yaml
type: object
properties:
  success:
    type: boolean
  healthy:
    type: boolean
  providers:
    type: object
    properties:
      total:
        type: number
      available:
        type: number
      unavailable:
        type: number
  networks:
    type: object
    properties:
      stellar:
        type: boolean
      layerzero:
        type: boolean
      hop:
        type: boolean
  timestamp:
    type: number
```

#### ValidationError
```yaml
type: object
properties:
  success:
    type: boolean
  error:
    type: string
  details:
    type: array
    items:
      type: object
      properties:
        field:
          type: string
        message:
          type: string
```

#### NotFoundError
```yaml
type: object
properties:
  success:
    type: boolean
  error:
    type: string
  details:
    type: string
```

#### ServerError
```yaml
type: object
properties:
  success:
    type: boolean
  error:
    type: string
  details:
    type: string
```

#### StepAdvancementError
```yaml
type: object
properties:
  success:
    type: boolean
  error:
    type: string
  details:
    type: string
```

#### InvalidNetworkError
```yaml
type: object
properties:
  success:
    type: boolean
  error:
    type: string
  supportedNetworks:
    type: array
    items:
      type: string
```

## Security Schemes

Currently, the BridgeWise API does not require authentication. In future versions, the following security scheme may be added:

```yaml
securitySchemes:
  ApiKeyAuth:
    type: apiKey
    in: header
    name: X-API-Key
```

## Rate Limiting

All endpoints are subject to rate limiting:
- **Limit**: 10 requests per 60 seconds per IP
- **Header**: X-RateLimit-Remaining, X-RateLimit-Reset

## CORS Configuration

The API is configured with CORS enabled:
- **Origin**: Configurable via CORS_ORIGIN env variable (default: *)
- **Methods**: GET, HEAD, PUT, PATCH, POST, DELETE
- **Credentials**: true

## Content Types

- **Request**: `application/json`
- **Response**: `application/json` (primary), `text/event-stream` (SSE)

---

## Accessing Swagger UI

The full interactive OpenAPI documentation is available at:

```
http://localhost:3000/api/docs
```

This provides:
- Visual schema documentation
- Interactive endpoint testing
- Request/response examples
- Schema validation
- Authentication testing (when applicable)

---

**Generated**: 2026-01-29  
**API Version**: 1.0.0  
**OpenAPI Version**: 3.0.0
