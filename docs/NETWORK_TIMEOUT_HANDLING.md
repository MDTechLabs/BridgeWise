# Network Timeout Handling

## Overview

BridgeWise enforces hard request time limits to prevent hanging API calls and keeps reliability high by reusing existing retry/backoff behavior.

## What is implemented

- **Per-request timeout enforcement** for network calls.
- **Timeout-aware retries** using existing retry logic (exponential backoff).
- **Configurable timeout values** at both client and request levels.

## Configuration

### Global timeout (client)

In `RateLimitedApiClient`:

- `timeout` (ms): default per-request timeout.

Example:

```js
const client = new RateLimitedApiClient({
  timeout: 8000,
  maxRetries: 3,
  baseDelay: 800,
});
```

### Request-level timeout override

You can override timeout for a specific request:

```js
await client.get(
  '/api/quote',
  {},
  {
    group: 'quotes',
    timeout: 3000,
  },
);
```

## Retry integration

Timeouts are treated as retryable failures and follow the same retry policy:

- Retry attempts: `maxRetries`
- Delay strategy: exponential backoff (`baseDelay`, capped by `maxDelay`)
- Metrics: `retriedRequests` increments on timeout retries

## Error behavior

When a timeout occurs, the client throws an error with:

- `name: "TimeoutError"`
- `code: "REQUEST_TIMEOUT"`
- `timeoutMs: <configured timeout>`

## Testing guidance (slow API simulation)

To simulate an unresponsive API in tests:

```js
globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
```

Expected behavior:

1. Request times out at configured timeout.
2. Retry triggers (if retries remain).
3. Final error is surfaced when retries are exhausted.

## Affected files

- `packages/adapters/stellar/src/rateLimitedApi.js`
- `packages/adapters/stellar/src/rateLimitedApi.test.js`
