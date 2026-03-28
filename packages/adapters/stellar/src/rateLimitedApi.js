/**
 * BridgeWise - Rate-Limited API Handling Layer
 * Issue #64: Implements rate limiting, retry logic, and request queuing
 */

// ─── Configuration ────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // ms — base delay for exponential backoff
  maxDelay: 30000, // ms — cap on backoff delay
  jitter: true, // randomise delay to avoid thundering herd
  rateLimitPerSecond: 5, // max requests per second per endpoint group
  rateLimitPerMinute: 100,
  timeout: 10000, // ms — per-request timeout
  retryStatusCodes: [429, 500, 502, 503, 504],
};

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Sleep for `ms` milliseconds.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Compute exponential backoff delay with optional jitter.
 * delay = min(baseDelay * 2^attempt, maxDelay) ± jitter
 */
function computeBackoffDelay(attempt, config) {
  const exponential = Math.min(
    config.baseDelay * Math.pow(2, attempt),
    config.maxDelay,
  );
  if (!config.jitter) return exponential;
  // Full jitter: random value in [0, exponential]
  return Math.floor(Math.random() * exponential);
}

/**
 * Extract Retry-After header value (seconds) from a Response, if present.
 * Returns null if not available.
 */
function parseRetryAfter(response) {
  const header = response?.headers?.get?.('Retry-After');
  if (!header) return null;
  const seconds = Number(header);
  if (!isNaN(seconds)) return seconds * 1000; // convert to ms
  const date = new Date(header);
  if (!isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

// ─── Token Bucket Rate Limiter ────────────────────────────────────────────────

class TokenBucket {
  /**
   * @param {number} capacity   – max tokens (burst size)
   * @param {number} refillRate – tokens added per second
   */
  constructor(capacity, refillRate) {
    this.capacity = capacity;
    this.refillRate = refillRate; // tokens / ms
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  _refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const added = elapsed * (this.refillRate / 1000);
    this.tokens = Math.min(this.capacity, this.tokens + added);
    this.lastRefill = now;
  }

  /**
   * Consume one token. Returns the wait time in ms before the token is available.
   * 0 means the token was immediately available.
   */
  consume() {
    this._refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0; // no wait
    }
    // How long until 1 token is available?
    const waitMs = Math.ceil((1 - this.tokens) / (this.refillRate / 1000));
    return waitMs;
  }
}

// ─── Request Queue ────────────────────────────────────────────────────────────

class RequestQueue {
  constructor(concurrency = 5) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  enqueue(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this._drain();
    });
  }

  _drain() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const { task, resolve, reject } = this.queue.shift();
      this.running++;
      Promise.resolve()
        .then(() => task())
        .then(resolve, reject)
        .finally(() => {
          this.running--;
          this._drain();
        });
    }
  }
}

// ─── Circuit Breaker ─────────────────────────────────────────────────────────

const CircuitState = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
});

class CircuitBreaker {
  constructor({ failureThreshold = 5, recoveryTimeout = 30000 } = {}) {
    this.failureThreshold = failureThreshold;
    this.recoveryTimeout = recoveryTimeout;
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.openedAt = null;
  }

  canRequest() {
    if (this.state === CircuitState.CLOSED) return true;
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.openedAt >= this.recoveryTimeout) {
        this.state = CircuitState.HALF_OPEN;
        return true;
      }
      return false;
    }
    // HALF_OPEN: allow one probe
    return true;
  }

  onSuccess() {
    this.failures = 0;
    this.state = CircuitState.CLOSED;
  }

  onFailure() {
    this.failures++;
    if (this.failures >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.openedAt = Date.now();
    }
  }

  get status() {
    return this.state;
  }
}

// ─── Core: RateLimitedApiClient ───────────────────────────────────────────────

export class RateLimitedApiClient {
  /**
   * @param {object} config  – override DEFAULT_CONFIG fields
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // One token bucket per "group" (e.g. endpoint category)
    this._buckets = new Map();

    // One circuit breaker per base URL / group
    this._breakers = new Map();

    // Shared request queue (controls global concurrency)
    this._queue = new RequestQueue(this.config.concurrency ?? 10);

    // Metrics (lightweight, no deps)
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retriedRequests: 0,
      rateLimitHits: 0,
    };
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  _getBucket(group) {
    if (!this._buckets.has(group)) {
      this._buckets.set(
        group,
        new TokenBucket(
          this.config.rateLimitPerSecond, // burst = per-second limit
          this.config.rateLimitPerSecond, // refill = same
        ),
      );
    }
    return this._buckets.get(group);
  }

  _getBreaker(group) {
    if (!this._breakers.has(group)) {
      this._breakers.set(group, new CircuitBreaker());
    }
    return this._breakers.get(group);
  }

  /**
   * Perform a fetch with a per-request timeout.
   */
  async _fetchWithTimeout(url, options, timeoutMs = this.config.timeout) {
    const upstreamSignal = options?.signal;

    if (upstreamSignal?.aborted) {
      const abortError = new Error('Request aborted before fetch');
      abortError.name = 'AbortError';
      abortError.code = 'REQUEST_ABORTED';
      throw abortError;
    }

    const controller = new AbortController();
    const onUpstreamAbort = () => controller.abort();
    upstreamSignal?.addEventListener('abort', onUpstreamAbort, { once: true });

    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        const timeoutError = new Error(
          `Request timed out after ${timeoutMs}ms`,
        );
        timeoutError.name = 'TimeoutError';
        timeoutError.code = 'REQUEST_TIMEOUT';
        timeoutError.timeoutMs = timeoutMs;
        reject(timeoutError);
      }, timeoutMs);
    });

    try {
      return await Promise.race([
        fetch(url, { ...options, signal: controller.signal }),
        timeoutPromise,
      ]);
    } finally {
      clearTimeout(timer);
      upstreamSignal?.removeEventListener('abort', onUpstreamAbort);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Make a rate-limited, retried HTTP request.
   *
   * @param {string} url
   * @param {RequestInit} options     – standard fetch options
   * @param {object}  requestConfig
   * @param {string}  requestConfig.group        – logical group for rate limiting ("quotes"|"fees"|"liquidity")
   * @param {number}  requestConfig.maxRetries   – override global maxRetries
   * @param {number}  requestConfig.timeout      – per-request timeout in ms (overrides global timeout)
   * @param {boolean} requestConfig.bypassQueue  – skip queue (use sparingly)
   * @returns {Promise<Response>}
   */
  request(url, options = {}, requestConfig = {}) {
    const task = () => this._execute(url, options, requestConfig);
    if (requestConfig.bypassQueue) return task();
    return this._queue.enqueue(task);
  }

  /**
   * Convenience wrappers
   */
  get(url, options, rc) {
    return this.request(url, { ...options, method: 'GET' }, rc);
  }
  post(url, body, options, rc) {
    return this.request(
      url,
      {
        ...options,
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json', ...options?.headers },
      },
      rc,
    );
  }

  // ── Execution with retry ───────────────────────────────────────────────────

  async _execute(url, options, requestConfig) {
    const group = requestConfig.group ?? 'default';
    const maxRetries = requestConfig.maxRetries ?? this.config.maxRetries;
    const requestTimeout = requestConfig.timeout ?? this.config.timeout;
    const bucket = this._getBucket(group);
    const breaker = this._getBreaker(group);

    this.metrics.totalRequests++;

    // Circuit breaker check
    if (!breaker.canRequest()) {
      const err = new Error(
        `Circuit OPEN for group "${group}". Requests suspended temporarily.`,
      );
      err.code = 'CIRCUIT_OPEN';
      this.metrics.failedRequests++;
      throw err;
    }

    // Token bucket: throttle before even attempting
    const wait = bucket.consume();
    if (wait > 0) {
      this.metrics.rateLimitHits++;
      await sleep(wait);
    }

    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this._fetchWithTimeout(
          url,
          options,
          requestTimeout,
        );

        // Success path
        if (response.ok) {
          breaker.onSuccess();
          this.metrics.successfulRequests++;
          return response;
        }

        // Should we retry this status code?
        if (!this.config.retryStatusCodes.includes(response.status)) {
          // Non-retryable error (e.g. 400, 401, 403, 404)
          breaker.onFailure();
          this.metrics.failedRequests++;
          const err = new Error(
            `HTTP ${response.status}: ${response.statusText}`,
          );
          err.status = response.status;
          err.response = response;
          throw err;
        }

        // Rate-limited: honour Retry-After if present
        if (response.status === 429) {
          this.metrics.rateLimitHits++;
          const serverWait = parseRetryAfter(response);
          const backoff =
            serverWait ?? computeBackoffDelay(attempt, this.config);
          if (attempt < maxRetries) {
            console.warn(
              `[BridgeWise] Rate limited (group=${group}). Waiting ${backoff}ms before retry ${attempt + 1}/${maxRetries}…`,
            );
            this.metrics.retriedRequests++;
            await sleep(backoff);
            continue;
          }
        }

        // 5xx: exponential backoff
        const backoff = computeBackoffDelay(attempt, this.config);
        if (attempt < maxRetries) {
          console.warn(
            `[BridgeWise] HTTP ${response.status} (group=${group}). Retrying in ${backoff}ms (${attempt + 1}/${maxRetries})…`,
          );
          this.metrics.retriedRequests++;
          await sleep(backoff);
          continue;
        }

        // Exhausted retries
        lastError = new Error(
          `HTTP ${response.status} after ${maxRetries} retries`,
        );
        lastError.status = response.status;
        lastError.response = response;
      } catch (err) {
        // Network / timeout error
        if (err.code === 'CIRCUIT_OPEN') throw err;

        lastError = err;
        if (attempt < maxRetries) {
          const isTimeout =
            err.code === 'REQUEST_TIMEOUT' || err.name === 'TimeoutError';
          const isAbort = err.name === 'AbortError';
          const backoff = computeBackoffDelay(attempt, this.config);
          const errorKind = isTimeout
            ? 'Timeout'
            : isAbort
              ? 'Abort'
              : 'Network error';
          console.warn(
            `[BridgeWise] ${errorKind} (group=${group}). Retrying in ${backoff}ms (${attempt + 1}/${maxRetries})…`,
          );
          this.metrics.retriedRequests++;
          await sleep(backoff);
        }
      }
    }

    // All retries exhausted
    breaker.onFailure();
    this.metrics.failedRequests++;
    throw lastError ?? new Error('Request failed after maximum retries');
  }

  // ── Diagnostics ────────────────────────────────────────────────────────────

  getCircuitStatus(group = 'default') {
    return this._breakers.get(group)?.status ?? CircuitState.CLOSED;
  }

  getMetrics() {
    return { ...this.metrics };
  }

  resetCircuit(group = 'default') {
    this._breakers.delete(group);
  }
}

// ─── BridgeWise Domain Clients ────────────────────────────────────────────────

const sharedClient = new RateLimitedApiClient({
  maxRetries: 3,
  baseDelay: 800,
  rateLimitPerSecond: 5,
  rateLimitPerMinute: 100,
  timeout: 8000,
});

/**
 * Fetch bridge quotes with rate-limit handling.
 * @param {object} params – { fromChain, toChain, token, amount }
 */
export async function fetchBridgeQuote(params) {
  const url = `/api/bridge/quote?${new URLSearchParams(params)}`;
  const response = await sharedClient.get(url, {}, { group: 'quotes' });
  return response.json();
}

/**
 * Fetch network fees.
 * @param {string} chain
 */
export async function fetchNetworkFees(chain) {
  const response = await sharedClient.get(
    `/api/fees/${chain}`,
    {},
    { group: 'fees' },
  );
  return response.json();
}

/**
 * Fetch liquidity & slippage data.
 * @param {object} params
 */
export async function fetchLiquidityData(params) {
  const url = `/api/liquidity?${new URLSearchParams(params)}`;
  const response = await sharedClient.get(url, {}, { group: 'liquidity' });
  return response.json();
}

export { sharedClient };
export default RateLimitedApiClient;
