import { QuoteExpiryEnforcementService } from './quote-expiry-enforcement.service';

describe('QuoteExpiryEnforcementService (#1285)', () => {
  let service: QuoteExpiryEnforcementService;

  beforeEach(() => {
    service = new QuoteExpiryEnforcementService({
      defaultTtlMs: 30_000, // 30 seconds
      executionBufferMs: 5_000, // 5 seconds buffer
      lockTtlMs: 60_000, // 60 seconds
    });
  });

  it('registers a quote and allows acquiring lock when fresh', () => {
    const now = 1_000_000;
    const quote = service.registerQuote({
      quoteId: 'quote-100',
      routeId: 'route-eth-polygon',
      sourceChainId: 1,
      destinationChainId: 137,
      sourceAsset: 'USDC',
      destinationAsset: 'USDC',
      amountIn: '500',
      expectedAmountOut: '499',
      minAmountOut: '495',
      ttlMs: 30_000,
      createdAt: now,
    });

    expect(quote.status).toBe('ACTIVE');
    expect(quote.expiresAt).toBe(now + 30_000);

    const lockResult = service.acquireExecutionLock({
      quoteId: 'quote-100',
      idempotencyKey: 'idem-key-1',
      callerAddress: '0x1234567890abcdef',
      submittedAt: now + 5_000, // submitted 5s into 30s TTL
    });

    expect(lockResult.allowed).toBe(true);
    expect(lockResult.lockAcquired).toBe(true);
    expect(lockResult.status).toBe('IN_FLIGHT');
  });

  it('rejects execution when quote has completely expired', () => {
    const now = 1_000_000;
    service.registerQuote({
      quoteId: 'quote-expired',
      routeId: 'route-expired',
      sourceChainId: 1,
      destinationChainId: 137,
      sourceAsset: 'USDC',
      destinationAsset: 'USDC',
      amountIn: '500',
      expectedAmountOut: '499',
      minAmountOut: '495',
      ttlMs: 30_000,
      createdAt: now,
    });

    const lockResult = service.acquireExecutionLock({
      quoteId: 'quote-expired',
      idempotencyKey: 'idem-key-1',
      callerAddress: '0x1234567890abcdef',
      submittedAt: now + 35_000, // 35s later (> 30s TTL)
    });

    expect(lockResult.allowed).toBe(false);
    expect(lockResult.rejectionCode).toBe('QUOTE_EXPIRED');
  });

  it('rejects execution when remaining TTL violates the execution safety buffer', () => {
    const now = 1_000_000;
    service.registerQuote({
      quoteId: 'quote-buffer-test',
      routeId: 'route-buffer-test',
      sourceChainId: 1,
      destinationChainId: 137,
      sourceAsset: 'USDC',
      destinationAsset: 'USDC',
      amountIn: '500',
      expectedAmountOut: '499',
      minAmountOut: '495',
      ttlMs: 30_000,
      createdAt: now,
    });

    // 27 seconds in, only 3 seconds remain (< 5s executionBufferMs)
    const lockResult = service.acquireExecutionLock({
      quoteId: 'quote-buffer-test',
      idempotencyKey: 'idem-key-1',
      callerAddress: '0x1234567890abcdef',
      submittedAt: now + 27_000,
    });

    expect(lockResult.allowed).toBe(false);
    expect(lockResult.rejectionCode).toBe('EXECUTION_BUFFER_VIOLATED');
    expect(lockResult.remainingTtlMs).toBe(3000);
  });

  it('prevents concurrent double-execution conflicts for conflicting callers', () => {
    const now = 1_000_000;
    service.registerQuote({
      quoteId: 'quote-concurrent',
      routeId: 'route-concurrent',
      sourceChainId: 1,
      destinationChainId: 137,
      sourceAsset: 'USDC',
      destinationAsset: 'USDC',
      amountIn: '500',
      expectedAmountOut: '499',
      minAmountOut: '495',
      ttlMs: 30_000,
      createdAt: now,
    });

    const lock1 = service.acquireExecutionLock({
      quoteId: 'quote-concurrent',
      idempotencyKey: 'idem-first',
      callerAddress: '0xuser1',
      submittedAt: now + 1_000,
    });
    expect(lock1.allowed).toBe(true);

    const lock2 = service.acquireExecutionLock({
      quoteId: 'quote-concurrent',
      idempotencyKey: 'idem-conflicting',
      callerAddress: '0xuser2',
      submittedAt: now + 2_000,
    });
    expect(lock2.allowed).toBe(false);
    expect(lock2.rejectionCode).toBe('QUOTE_IN_FLIGHT_CONFLICT');
  });

  it('supports idempotent re-submission with the same idempotencyKey during in-flight', () => {
    const now = 1_000_000;
    service.registerQuote({
      quoteId: 'quote-retry',
      routeId: 'route-retry',
      sourceChainId: 1,
      destinationChainId: 137,
      sourceAsset: 'USDC',
      destinationAsset: 'USDC',
      amountIn: '500',
      expectedAmountOut: '499',
      minAmountOut: '495',
      ttlMs: 30_000,
      createdAt: now,
    });

    service.acquireExecutionLock({
      quoteId: 'quote-retry',
      idempotencyKey: 'idem-same',
      callerAddress: '0xuser1',
      submittedAt: now + 1_000,
    });

    // Retry request with same key
    const retryResult = service.acquireExecutionLock({
      quoteId: 'quote-retry',
      idempotencyKey: 'idem-same',
      callerAddress: '0xuser1',
      submittedAt: now + 2_000,
    });

    expect(retryResult.allowed).toBe(true);
    expect(retryResult.lockAcquired).toBe(false);
    expect(retryResult.status).toBe('IN_FLIGHT');
  });

  it('manages full lifecycle: lock -> commit -> idempotency check after commit', () => {
    const now = 1_000_000;
    service.registerQuote({
      quoteId: 'quote-lifecycle',
      routeId: 'route-lifecycle',
      sourceChainId: 1,
      destinationChainId: 137,
      sourceAsset: 'USDC',
      destinationAsset: 'USDC',
      amountIn: '500',
      expectedAmountOut: '499',
      minAmountOut: '495',
      ttlMs: 30_000,
      createdAt: now,
    });

    service.acquireExecutionLock({
      quoteId: 'quote-lifecycle',
      idempotencyKey: 'idem-complete',
      callerAddress: '0xuser1',
      submittedAt: now + 1_000,
    });

    const committed = service.commitExecution('quote-lifecycle', '0xabc123txhash');
    expect(committed.status).toBe('EXECUTED');
    expect(committed.txHash).toBe('0xabc123txhash');

    // Post-execution idempotent query
    const postQuery = service.acquireExecutionLock({
      quoteId: 'quote-lifecycle',
      idempotencyKey: 'idem-complete',
      callerAddress: '0xuser1',
      submittedAt: now + 3_000,
    });
    expect(postQuery.allowed).toBe(true);
    expect(postQuery.status).toBe('EXECUTED');

    // Post-execution conflicting key
    const conflictingQuery = service.acquireExecutionLock({
      quoteId: 'quote-lifecycle',
      idempotencyKey: 'idem-different',
      callerAddress: '0xuser2',
      submittedAt: now + 4_000,
    });
    expect(conflictingQuery.allowed).toBe(false);
    expect(conflictingQuery.rejectionCode).toBe('QUOTE_ALREADY_EXECUTED');
  });

  // ── Boundary conditions (#1446) ──────────────────────────────────────────────

  it('treats remainingTtlMs exactly 0 (now === expiresAt) as expired, not borderline-valid', () => {
    const now = 1_000_000;
    service.registerQuote({
      quoteId: 'quote-exact-expiry',
      routeId: 'route-x',
      sourceChainId: 1,
      destinationChainId: 137,
      sourceAsset: 'USDC',
      destinationAsset: 'USDC',
      amountIn: '500',
      expectedAmountOut: '499',
      minAmountOut: '495',
      ttlMs: 30_000,
      createdAt: now,
    });

    const lockResult = service.acquireExecutionLock({
      quoteId: 'quote-exact-expiry',
      idempotencyKey: 'idem-key-1',
      callerAddress: '0x1234567890abcdef',
      submittedAt: now + 30_000, // exactly at expiresAt
    });

    expect(lockResult.allowed).toBe(false);
    expect(lockResult.rejectionCode).toBe('QUOTE_EXPIRED');
  });

  it('allows execution when remaining TTL exactly equals the execution buffer', () => {
    const now = 1_000_000;
    service.registerQuote({
      quoteId: 'quote-exact-buffer',
      routeId: 'route-x',
      sourceChainId: 1,
      destinationChainId: 137,
      sourceAsset: 'USDC',
      destinationAsset: 'USDC',
      amountIn: '500',
      expectedAmountOut: '499',
      minAmountOut: '495',
      ttlMs: 30_000,
      createdAt: now,
    });

    // 25s in, exactly 5s remain == executionBufferMs: must pass, not be rejected.
    const lockResult = service.acquireExecutionLock({
      quoteId: 'quote-exact-buffer',
      idempotencyKey: 'idem-key-1',
      callerAddress: '0x1234567890abcdef',
      submittedAt: now + 25_000,
    });

    expect(lockResult.allowed).toBe(true);
    expect(lockResult.remainingTtlMs).toBe(5_000);
  });

  it('does not treat a lock exactly at lockTtlMs old as still fresh', () => {
    const now = 1_000_000;
    service.registerQuote({
      quoteId: 'quote-exact-lock-timeout',
      routeId: 'route-x',
      sourceChainId: 1,
      destinationChainId: 137,
      sourceAsset: 'USDC',
      destinationAsset: 'USDC',
      amountIn: '500',
      expectedAmountOut: '499',
      minAmountOut: '495',
      ttlMs: 120_000,
      createdAt: now,
    });

    service.acquireExecutionLock({
      quoteId: 'quote-exact-lock-timeout',
      idempotencyKey: 'idem-first',
      callerAddress: '0xuser1',
      submittedAt: now,
    });

    // lockTtlMs is 60_000 in this suite's config; exactly that old must be
    // treated as stale (reclaimable), not as still-fresh/conflicting.
    const lockResult = service.acquireExecutionLock({
      quoteId: 'quote-exact-lock-timeout',
      idempotencyKey: 'idem-second',
      callerAddress: '0xuser2',
      submittedAt: now + 60_000,
    });

    expect(lockResult.rejectionCode).not.toBe('QUOTE_IN_FLIGHT_CONFLICT');
  });

  it('releases lock upon execution failure allowing subsequent attempts if still unexpired', () => {
    const now = 1_000_000;
    service.registerQuote({
      quoteId: 'quote-release-test',
      routeId: 'route-release-test',
      sourceChainId: 1,
      destinationChainId: 137,
      sourceAsset: 'USDC',
      destinationAsset: 'USDC',
      amountIn: '500',
      expectedAmountOut: '499',
      minAmountOut: '495',
      ttlMs: 30_000,
      createdAt: now,
    });

    service.acquireExecutionLock({
      quoteId: 'quote-release-test',
      idempotencyKey: 'idem-fail',
      callerAddress: '0xuser1',
      submittedAt: now + 1_000,
    });

    service.releaseExecutionLock('quote-release-test', 'RPC dropped connection', now + 2_000);

    const quote = service.getQuote('quote-release-test', now + 2_000);
    expect(quote?.status).toBe('ACTIVE');
    expect(quote?.executionLockId).toBeUndefined();
  });
});
