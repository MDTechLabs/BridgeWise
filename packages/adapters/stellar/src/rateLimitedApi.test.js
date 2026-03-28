/**
 * BridgeWise — Tests for Rate-Limited API Handling Layer (Issue #64)
 * Run with: node --experimental-vm-modules node_modules/.bin/jest rateLimitedApi.test.js
 * Or:       npx vitest rateLimitedApi.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RateLimitedApiClient from './rateLimitedApi.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFetchMock(responses) {
  let call = 0;
  return vi.fn(() => {
    const r = responses[Math.min(call++, responses.length - 1)];
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      statusText: r.statusText ?? '',
      headers: { get: (h) => r.headers?.[h] ?? null },
      json: () => Promise.resolve(r.body ?? {}),
    });
  });
}

// Speed up tests by overriding sleep
vi.mock('./rateLimitedApi.js', async (importOriginal) => {
  const mod = await importOriginal();
  return mod; // real module; we'll spy on setTimeout instead
});

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── TokenBucket (internal — tested via integration) ─────────────────────────

describe('RateLimitedApiClient — success path', () => {
  it('returns response on first attempt when server returns 200', async () => {
    const fetchMock = makeFetchMock([{ status: 200, body: { quote: 1.23 } }]);
    globalThis.fetch = fetchMock;

    const client = new RateLimitedApiClient({ rateLimitPerSecond: 100 });
    const promise = client.get('/api/quote', {}, { group: 'quotes' });
    await vi.runAllTimersAsync();
    const res = await promise;
    const data = await res.json();

    expect(data.quote).toBe(1.23);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(client.getMetrics().successfulRequests).toBe(1);
    expect(client.getMetrics().retriedRequests).toBe(0);
  });
});

describe('RateLimitedApiClient — retry on 5xx', () => {
  it('retries up to maxRetries times then resolves on success', async () => {
    const fetchMock = makeFetchMock([
      { status: 503, statusText: 'Service Unavailable' },
      { status: 503, statusText: 'Service Unavailable' },
      { status: 200, body: { fees: '0.001' } },
    ]);
    globalThis.fetch = fetchMock;

    const client = new RateLimitedApiClient({
      maxRetries: 3,
      baseDelay: 10,
      rateLimitPerSecond: 100,
    });
    const promise = client.get('/api/fees/eth', {}, { group: 'fees' });
    await vi.runAllTimersAsync();
    const res = await promise;

    expect((await res.json()).fees).toBe('0.001');
    expect(fetchMock).toHaveBeenCalledTimes(3); // 2 failures + 1 success
    expect(client.getMetrics().retriedRequests).toBe(2);
  });

  it('throws after exhausting all retries', async () => {
    const fetchMock = makeFetchMock([
      { status: 500 },
      { status: 500 },
      { status: 500 },
      { status: 500 },
    ]);
    globalThis.fetch = fetchMock;

    const client = new RateLimitedApiClient({
      maxRetries: 3,
      baseDelay: 10,
      rateLimitPerSecond: 100,
    });
    const promise = client.get('/api/fees/eth', {}, { group: 'fees' });
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    expect(client.getMetrics().failedRequests).toBe(1);
  });
});

describe('RateLimitedApiClient — 429 rate limit handling', () => {
  it('respects Retry-After header on 429', async () => {
    const fetchMock = makeFetchMock([
      { status: 429, headers: { 'Retry-After': '2' } },
      { status: 200, body: { liquidity: 'high' } },
    ]);
    globalThis.fetch = fetchMock;

    const client = new RateLimitedApiClient({
      maxRetries: 3,
      baseDelay: 10,
      rateLimitPerSecond: 100,
    });
    const promise = client.get('/api/liquidity', {}, { group: 'liquidity' });
    await vi.runAllTimersAsync();

    const res = await promise;
    expect((await res.json()).liquidity).toBe('high');
    expect(client.getMetrics().rateLimitHits).toBeGreaterThan(0);
  });

  it('falls back to exponential backoff when no Retry-After header', async () => {
    const fetchMock = makeFetchMock([
      { status: 429 },
      { status: 200, body: {} },
    ]);
    globalThis.fetch = fetchMock;

    const client = new RateLimitedApiClient({
      maxRetries: 3,
      baseDelay: 10,
      rateLimitPerSecond: 100,
    });
    const promise = client.get('/api/liquidity', {}, { group: 'liquidity' });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBeDefined();
  });
});

describe('RateLimitedApiClient — non-retryable errors', () => {
  it('does not retry on 400 Bad Request', async () => {
    const fetchMock = makeFetchMock([
      { status: 400, statusText: 'Bad Request' },
    ]);
    globalThis.fetch = fetchMock;

    const client = new RateLimitedApiClient({
      maxRetries: 3,
      rateLimitPerSecond: 100,
    });
    const promise = client.get('/api/quote', {}, { group: 'quotes' });
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retries
  });

  it('does not retry on 401 Unauthorized', async () => {
    const fetchMock = makeFetchMock([{ status: 401 }]);
    globalThis.fetch = fetchMock;

    const client = new RateLimitedApiClient({
      maxRetries: 3,
      rateLimitPerSecond: 100,
    });
    const promise = client.get('/api/quote', {}, { group: 'quotes' });
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('RateLimitedApiClient — network errors & timeout', () => {
  it('retries on network error and succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({}),
      });
    globalThis.fetch = fetchMock;

    const client = new RateLimitedApiClient({
      maxRetries: 3,
      baseDelay: 10,
      rateLimitPerSecond: 100,
    });
    const promise = client.get('/api/quote', {}, { group: 'quotes' });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('enforces timeout, retries, and eventually succeeds', async () => {
    const fetchMock = vi
      .fn()
      // First attempt hangs forever (simulates unresponsive API)
      .mockImplementationOnce(() => new Promise(() => {}))
      // Retry succeeds
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ ok: true }),
      });

    globalThis.fetch = fetchMock;

    const client = new RateLimitedApiClient({
      maxRetries: 2,
      baseDelay: 10,
      timeout: 20,
      rateLimitPerSecond: 100,
    });

    const promise = client.get('/api/quote', {}, { group: 'quotes' });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(client.getMetrics().retriedRequests).toBe(1);
  });

  it('supports per-request timeout override', async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {}));
    globalThis.fetch = fetchMock;

    const client = new RateLimitedApiClient({
      maxRetries: 0,
      timeout: 1000,
      rateLimitPerSecond: 100,
    });

    const promise = client.get(
      '/api/quote',
      {},
      {
        group: 'quotes',
        timeout: 25,
      },
    );

    await vi.runAllTimersAsync();

    await expect(promise).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
      name: 'TimeoutError',
      timeoutMs: 25,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('CircuitBreaker integration', () => {
  it('opens circuit after repeated failures and rejects without fetching', async () => {
    // Trigger 5 failures to open the breaker
    const fetchMock = makeFetchMock(Array(10).fill({ status: 500 }));
    globalThis.fetch = fetchMock;

    const client = new RateLimitedApiClient({
      maxRetries: 0, // no retries — each call counts as one failure
      baseDelay: 1,
      rateLimitPerSecond: 100,
    });

    // 5 failures should open the circuit
    for (let i = 0; i < 5; i++) {
      const p = client.get('/api/quote', {}, { group: 'cb-test' });
      await vi.runAllTimersAsync();
      await p.catch(() => {});
    }

    expect(client.getCircuitStatus('cb-test')).toBe('OPEN');

    // Next request should be rejected immediately without fetching
    const callsBefore = fetchMock.mock.calls.length;
    const blocked = client.get('/api/quote', {}, { group: 'cb-test' });
    await vi.runAllTimersAsync();
    await expect(blocked).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
    expect(fetchMock.mock.calls.length).toBe(callsBefore); // no new fetch
  });

  it('resets circuit via resetCircuit()', async () => {
    const fetchMock = makeFetchMock([{ status: 200 }]);
    globalThis.fetch = fetchMock;

    const client = new RateLimitedApiClient({
      maxRetries: 0,
      rateLimitPerSecond: 100,
    });
    client._getBreaker('grp').state = 'OPEN';
    client._getBreaker('grp').openedAt = 0; // force expiry

    client.resetCircuit('grp');
    expect(client.getCircuitStatus('grp')).toBe('CLOSED');
  });
});

describe('Metrics', () => {
  it('tracks all metrics correctly over a mixed session', async () => {
    const fetchMock = makeFetchMock([
      { status: 200 },
      { status: 500 },
      { status: 200 },
    ]);
    globalThis.fetch = fetchMock;

    const client = new RateLimitedApiClient({
      maxRetries: 1,
      baseDelay: 1,
      rateLimitPerSecond: 100,
    });

    const p1 = client.get('/api/a', {}, { group: 'g' });
    await vi.runAllTimersAsync();
    await p1;

    const p2 = client.get('/api/b', {}, { group: 'g' });
    await vi.runAllTimersAsync();
    await p2;

    const m = client.getMetrics();
    expect(m.totalRequests).toBe(2);
    expect(m.successfulRequests).toBe(2);
    expect(m.retriedRequests).toBe(1); // second request retried once then succeeded
  });
});
