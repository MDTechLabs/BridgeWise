# BridgeWise Partner Integration Sandbox Mode

The **BridgeWise Partner Integration Sandbox** provides institutional partners, dApps, and wallet integrators with an isolated, deterministic simulation environment. It allows partners to thoroughly test cross-chain bridging, quoting, status polling, error handling, and webhook delivery without spending real mainnet assets or locking up liquidity.

---

## 1. Overview & Key Capabilities

- **Zero Asset Risk:** Mint simulated test assets (USDC, XLM, ETH, etc.) directly into partner test wallets via the Sandbox Faucet.
- **Realistic Lifecycle Emulation:** Multi-step bridge progress tracking (`INITIALIZED` → `SUBMITTED` → `SOURCE_CONFIRMED` → `DESTINATION_PROCESSING` → `COMPLETED` / `REFUNDED`).
- **Deterministic Error Scenarios:** Simulate real-world edge cases like insufficient pool liquidity, slippage threshold violations, upstream timeouts, and destination contract reverts on demand.
- **Isolated Partner Sandboxes:** Configure scenarios and mock states independently per partner using API keys or header tags (`x-partner-id`).
- **Webhook Simulator:** Verify endpoint delivery for cross-chain transfer events (`transaction.completed`, `transaction.failed`, `transaction.refunded`).

---

## 2. Enabling Sandbox Mode

You can enable Sandbox Mode across any BridgeWise API request using any of the following mechanisms:

### Option A: HTTP Header (Recommended)
Add the `x-sandbox-mode` header to your requests:
```http
POST /quotes HTTP/1.1
Host: api.bridgewise.com
x-sandbox-mode: true
x-partner-id: my-dapp-name
Content-Type: application/json
```

### Option B: API Key Prefix
Any API key starting with `sb_` or `sandbox_` automatically activates sandbox mode:
```http
Authorization: Bearer sb_partner_live_test_key_123
```

### Option C: Query Parameter
Append `?sandbox=true` to any request:
```http
GET /quotes?fromChain=1001&toChain=1&fromToken=USDC&amount=100&sandbox=true
```

### Response Headers
When sandbox mode is active, responses include explicit verification headers:
```http
HTTP/1.1 200 OK
x-sandbox-mode: true
x-sandbox-scenario: success
x-sandbox-request-id: sb_req_486c27e6
```

---

## 3. Simulation Scenarios

Partners can test their client application's resilience by toggling simulation scenarios via `POST /sandbox/scenarios` or overriding per-request using `x-sandbox-scenario: <scenario>`.

| Scenario | Value | Description & Behavior |
| :--- | :--- | :--- |
| **Success** (Default) | `success` | Normal happy path. Quotes return optimal pricing; transactions complete with valid mock source & destination tx hashes. |
| **Insufficient Liquidity** | `insufficient_liquidity` | Simulates high-volume exhaustion of the bridge pool. Returns quote with `error: Insufficient simulated liquidity`. |
| **Slippage Exceeded** | `slippage_exceeded` | Simulates price movements during settlement. Transaction initiation throws HTTP 400 (`Simulated slippage limit exceeded`). |
| **Route Unavailable** | `route_unavailable` | Simulates chain downtime or bridge maintenance. Quotes return `routeSupported: false`. |
| **Destination Revert** | `destination_revert` | Source deposit succeeds, but the destination mint reverts. Transaction transitions to `REFUNDED` with failure reason. |
| **Upstream Timeout** | `timeout` | Simulates network / RPC delays. Request throws HTTP 504 (`GatewayTimeoutException`). |
| **Delayed Completion** | `delayed_completion` | Simulates slow block confirmations. Transaction remains in `DESTINATION_PROCESSING` state. |

---

## 4. API Endpoints

### 4.1 Check Sandbox Status
`GET /sandbox/status`

Retrieves sandbox environment health, active partner scenario, supported chains, and token lists.

**Example Request:**
```bash
curl -X GET "https://api.bridgewise.com/sandbox/status" \
  -H "x-partner-id: acme-exchange"
```

**Example Response:**
```json
{
  "sandboxMode": true,
  "version": "1.0.0",
  "partnerId": "acme-exchange",
  "activeScenario": "success",
  "supportedChains": [
    { "id": 1001, "name": "Stellar Mainnet (Simulated)", "type": "stellar" },
    { "id": 1002, "name": "Stellar Testnet", "type": "stellar" },
    { "id": 1, "name": "Ethereum Mainnet (Simulated)", "type": "evm" },
    { "id": 137, "name": "Polygon (Simulated)", "type": "evm" },
    { "id": 42161, "name": "Arbitrum One (Simulated)", "type": "evm" },
    { "id": 10, "name": "Optimism (Simulated)", "type": "evm" }
  ],
  "supportedTokens": ["USDC", "XLM", "ETH", "yXLM", "USDT", "WBTC"],
  "faucetLimits": {
    "maxPerRequest": 100000,
    "tokens": ["USDC", "XLM", "ETH", "yXLM", "USDT", "WBTC"]
  },
  "scenarios": [
    "success",
    "insufficient_liquidity",
    "slippage_exceeded",
    "route_unavailable",
    "destination_revert",
    "timeout",
    "delayed_completion"
  ]
}
```

---

### 4.2 Configure Partner Scenario
`POST /sandbox/scenarios`

Updates the active simulation scenario, network latency, and failure rates for your partner account.

**Example Request:**
```bash
curl -X POST "https://api.bridgewise.com/sandbox/scenarios" \
  -H "x-partner-id: acme-exchange" \
  -H "Content-Type: application/json" \
  -d '{
    "scenario": "destination_revert",
    "simulatedLatencyMs": 100
  }'
```

---

### 4.3 Request Sandbox Faucet Tokens
`POST /sandbox/faucet`

Mints test assets to a specified address without requiring real funds.

**Example Request:**
```bash
curl -X POST "https://api.bridgewise.com/sandbox/faucet" \
  -H "x-partner-id: acme-exchange" \
  -H "Content-Type: application/json" \
  -d '{
    "address": "GDC324X...TEST_WALLET",
    "token": "USDC",
    "amount": 5000
  }'
```

**Example Response:**
```json
{
  "address": "GDC324X...TEST_WALLET",
  "token": "USDC",
  "amount": 5000,
  "balance": 5000,
  "txHash": "0xsb_faucet_94f83b123d90432f819bcf82903290"
}
```

---

### 4.4 Initiate Simulated Cross-Chain Transfer
`POST /sandbox/transactions`

Submits a mock cross-chain transfer and produces realistic transaction hashes and step progression.

**Example Request:**
```bash
curl -X POST "https://api.bridgewise.com/sandbox/transactions" \
  -H "x-partner-id: acme-exchange" \
  -H "Content-Type: application/json" \
  -d '{
    "fromChain": 1001,
    "toChain": 1,
    "fromToken": "USDC",
    "amount": "100.00",
    "senderAddress": "GDC324X...TEST_WALLET",
    "recipientAddress": "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7"
  }'
```

**Example Response:**
```json
{
  "id": "sb_tx_a8291b8d29c48190",
  "partnerId": "acme-exchange",
  "sourceChainId": 1001,
  "destinationChainId": 1,
  "sourceToken": "USDC",
  "destinationToken": "USDC",
  "amount": "100.00",
  "estimatedOutput": "99.900000",
  "netOutputAmount": "99.900000",
  "feeAmount": "0.100000",
  "feeToken": "USDC",
  "state": "COMPLETED",
  "sourceTxHash": "0xsb_src_d019f29103c8192a0019283921029102",
  "destinationTxHash": "0xsb_dst_e1920394019230910293019230192039",
  "scenario": "success",
  "steps": [
    {
      "name": "Transaction Initialized",
      "status": "success",
      "timestamp": "2026-09-30T09:30:00.000Z",
      "details": "Simulated bridge initiated from 1001 to 1"
    },
    {
      "name": "Source Chain Confirmed",
      "status": "success",
      "timestamp": "2026-09-30T09:30:01.000Z",
      "details": "Deposit confirmed on source chain 1001"
    },
    {
      "name": "Destination Minting",
      "status": "success",
      "timestamp": "2026-09-30T09:30:03.000Z",
      "details": "Tokens delivered to 0x8920... on chain 1"
    }
  ],
  "createdAt": "2026-09-30T09:30:00.000Z",
  "updatedAt": "2026-09-30T09:30:03.000Z"
}
```

---

### 4.5 Reset Partner State
`POST /sandbox/reset`

Clears all simulated transactions and faucet balances for the partner, restoring the default state.

```bash
curl -X POST "https://api.bridgewise.com/sandbox/reset" \
  -H "x-partner-id: acme-exchange"
```

---

### 4.6 Dispatch Simulated Webhook
`POST /sandbox/webhooks/test`

Tests partner webhook endpoints by delivering sample bridge events.

```bash
curl -X POST "https://api.bridgewise.com/sandbox/webhooks/test" \
  -H "x-partner-id: acme-exchange" \
  -H "Content-Type: application/json" \
  -d '{
    "webhookUrl": "https://dapp.example.com/api/webhooks/bridge",
    "eventType": "transaction.completed"
  }'
```

---

## 5. Security & Isolation

- **State Segregation:** All mock transactions and balances are isolated by `partnerId`. Partners cannot view or alter other partner states.
- **Production Guardrails:** Sandbox mode is disabled or isolated from production liquidity contracts. Real mainnet funds can never be moved via sandbox endpoints.
- **Safe Reset:** Partners can test recovery from corrupted states or start fresh test sessions at any time using `POST /sandbox/reset`.
