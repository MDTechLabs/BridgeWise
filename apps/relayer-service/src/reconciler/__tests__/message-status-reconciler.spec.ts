import { MessageQueue } from '../../queue/message-queue';
import { EvmExecutorStatusProvider, GetTransactionStatusResult, MessageStatusReconciler } from '../message-status-reconciler';
import { CrossChainMessage, ExecutionResult, MessageStatusProvider, OnChainMessageStatus } from '../../types';

function makeMessage(overrides: Partial<CrossChainMessage> = {}): CrossChainMessage {
  return {
    id: 'msg-1',
    sourceChainId: 'arbitrum',
    destinationChainId: 'stellar',
    sourceTxHash: '0x' + 'a'.repeat(64),
    sourceBlockNumber: 10_000_000,
    messageType: 'lock',
    payload: '0xdeadbeef',
    sender: '0xsender',
    recipient: 'Grecipient',
    createdAt: 1_700_000_000_000,
    status: 'pending',
    retryCount: 0,
    ...overrides,
  };
}

interface ProviderApi {
  provider: MessageStatusProvider;
  calls: Array<{ messageId: string; txHash: string }>;
}

function programmableProvider(chainId: string, responses: Array<OnChainMessageStatus | Error>): ProviderApi {
  const calls: Array<{ messageId: string; txHash: string }> = [];
  const provider: MessageStatusProvider = {
    chainId,
    async getMessageStatus(messageId, txHash) {
      calls.push({ messageId, txHash });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next ?? { kind: 'unknown', error: 'provider responses exhausted' };
    },
  };
  return { provider, calls };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

describe('MessageStatusReconciler', () => {
  let queue: MessageQueue;

  beforeEach(() => {
    queue = new MessageQueue({ maxRetries: 3, retryDelayMs: 100, concurrency: 5 });
  });

  afterEach(() => {
    queue.removeAllListeners();
    jest.useRealTimers();
  });

  function inFlightMessage(id: string, destinationChainId = 'stellar'): void {
    queue.enqueue(makeMessage({ id, destinationChainId }));
    queue.dequeue();
  }

  function reconciler(
    config: Partial<{
      staleAfterMs: number;
      intervalMs: number;
      reconcileOnStart: boolean;
      maxConsecutiveErrorRuns: number;
    }> = {},
    providers: MessageStatusProvider[] = [],
  ): MessageStatusReconciler {
    return new MessageStatusReconciler({
      queue,
      provider: providers,
      config: { staleAfterMs: 10_000, intervalMs: 0, reconcileOnStart: false, maxConsecutiveErrorRuns: 2, ...config },
    });
  }

  it('leaves a fresh in-flight message alone', async () => {
    inFlightMessage('fresh');
    const r = reconciler();
    const summary = await r.reconcile();
    expect(queue.getMessageStatus('fresh')).toBe('processing');
    expect(summary.transitions).toEqual([
      expect.objectContaining({ messageId: 'fresh', action: 'deferred', reason: 'not-stale' }),
    ]);
    expect(r.getStats()).toMatchObject({ runs: 1, scanned: 1, corrections: 0, deferred: 1 });
  });

  it('re-queues a stale processing message for another attempt', async () => {
    jest.useFakeTimers();
    inFlightMessage('hung');
    jest.advanceTimersByTime(10_000);
    const r = reconciler();
    const summary = await r.reconcile();
    expect(queue.getMessageStatus('hung')).toBe('queued');
    expect(queue.getPendingCount()).toBe(1);
    expect(summary.transitions[0]).toMatchObject({
      messageId: 'hung',
      action: 'requeued',
      reason: 'stale-processing',
      before: 'processing',
      after: 'queued',
    });
    expect(r.getStats()).toMatchObject({ requeued: 1, corrections: 1 });
  });

  it('moves a stale processing message to failed once the retry budget is spent', async () => {
    jest.useFakeTimers();
    queue = new MessageQueue({ maxRetries: 0 });
    inFlightMessage('spent');
    jest.advanceTimersByTime(30_000);
    const r = reconciler();
    const summary = await r.reconcile();
    expect(queue.getMessageStatus('spent')).toBe('failed');
    expect(queue.getFailedCount()).toBe(1);
    expect(summary.transitions[0]).toMatchObject({ action: 'failed', reason: 'stale-processing', after: 'failed' });
  });

  it('confirms a submitted message that is final on-chain', async () => {
    inFlightMessage('sub');
    queue.markSubmitted('sub', '0xabc');
    const { provider } = programmableProvider('stellar', [{ kind: 'confirmed', blockNumber: 12345 }]);
    const r = reconciler({}, [provider]);
    const summary = await r.reconcile();
    expect(queue.getMessageStatus('sub')).toBe('confirmed');
    expect(queue.getCompletedMessages()[0]).toMatchObject({
      messageId: 'sub',
      success: true,
      transactionHash: '0xabc',
      blockNumber: 12345,
    });
    expect(summary.transitions[0]).toMatchObject({ action: 'confirmed', reason: 'confirmed-on-chain' });
    expect(r.getStats()).toMatchObject({ confirmed: 1, corrections: 1 });
  });

  it('fails a submitted message whose transaction reverted, without retrying', async () => {
    inFlightMessage('rev');
    queue.markSubmitted('rev', '0xrev');
    const retrying = jest.fn();
    queue.on('message-retrying', retrying);
    const { provider } = programmableProvider('stellar', [{ kind: 'reverted', error: 'execution reverted' }]);
    const r = reconciler({}, [provider]);
    const summary = await r.reconcile();
    expect(queue.getMessageStatus('rev')).toBe('failed');
    expect(queue.getFailedCount()).toBe(1);
    expect(retrying).not.toHaveBeenCalled();
    expect(summary.transitions[0]).toMatchObject({ action: 'failed', reason: 'reverted-on-chain' });
  });

  it('does not resubmit a submitted message right after broadcast', async () => {
    inFlightMessage('w');
    queue.markSubmitted('w', '0xw');
    const { provider } = programmableProvider('stellar', [{ kind: 'not-found' }]);
    const r = reconciler({}, [provider]);
    const summary = await r.reconcile();
    expect(queue.getMessageStatus('w')).toBe('submitted');
    expect(summary.transitions[0]).toMatchObject({ action: 'deferred', reason: 'not-stale' });
  });

  it('re-queues a submitted message with no receipt past the stale threshold', async () => {
    jest.useFakeTimers();
    inFlightMessage('lost');
    queue.markSubmitted('lost', '0xlost');
    jest.advanceTimersByTime(20_000);
    const { provider } = programmableProvider('stellar', [{ kind: 'not-found' }]);
    const r = reconciler({}, [provider]);
    const summary = await r.reconcile();
    expect(queue.getMessageStatus('lost')).toBe('queued');
    expect(queue.getPendingCount()).toBe(1);
    expect(summary.transitions[0]).toMatchObject({ action: 'requeued', reason: 'not-found-on-chain' });
  });

  it('leaves a message untouched and counts an error when the provider throws', async () => {
    inFlightMessage('boom');
    queue.markSubmitted('boom', '0xboom');
    const errorSpy = jest.fn();
    const { provider } = programmableProvider('stellar', [new Error('rpc down')]);
    const r = reconciler({}, [provider]);
    r.on('reconcile-error', errorSpy);
    const summary = await r.reconcile();
    expect(queue.getMessageStatus('boom')).toBe('submitted');
    expect(summary.transitions[0]).toMatchObject({ action: 'deferred', reason: 'provider-error' });
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'boom', error: 'rpc down' }));
    expect(r.getStats()).toMatchObject({ errors: 1, deferred: 1, corrections: 0 });
  });

  it('treats an unknown on-chain status as an error', async () => {
    inFlightMessage('unknown');
    queue.markSubmitted('unknown', '0xu');
    const { provider } = programmableProvider('stellar', [{ kind: 'unknown', error: 'node syncing' }]);
    const r = reconciler({}, [provider]);
    const summary = await r.reconcile();
    expect(queue.getMessageStatus('unknown')).toBe('submitted');
    expect(summary.transitions[0]).toMatchObject({ action: 'deferred', reason: 'provider-error' });
    expect(r.getStats()).toMatchObject({ errors: 1 });
  });

  it('reports a submitted message without a transaction hash as an error', async () => {
    inFlightMessage('nohash');
    queue.markSubmitted('nohash', '0xignored');
    const snapshot = queue.getInflightSnapshot()[0];
    snapshot.submittedTxHash = undefined;
    snapshot.submittedAt = undefined;
    queue.getInflightSnapshot = (() => [snapshot]) as MessageQueue['getInflightSnapshot'];

    const r = reconciler();
    const summary = await r.reconcile();
    expect(summary.transitions).toEqual([
      expect.objectContaining({ messageId: 'nohash', action: 'deferred', reason: 'provider-error' }),
    ]);
    expect(r.getStats()).toMatchObject({ errors: 1 });
  });

  it('defers messages when no provider covers the destination chain', async () => {
    inFlightMessage('nowhere', 'near');
    queue.markSubmitted('nowhere', '0xn');
    const r = reconciler();
    const summary = await r.reconcile();
    expect(queue.getMessageStatus('nowhere')).toBe('submitted');
    expect(summary.transitions[0]).toMatchObject({ action: 'deferred', reason: 'provider-unavailable' });
    expect(r.getStats()).toMatchObject({ providerUnavailable: 1 });
  });

  it('consults only the provider for the message destination chain', async () => {
    inFlightMessage('evm-msg', 'ethereum');
    queue.markSubmitted('evm-msg', '0xe');
    const { provider: ethereumP, calls: ethCalls } = programmableProvider('ethereum', [{ kind: 'confirmed' }]);
    const { provider: stellarP } = programmableProvider('stellar', [{ kind: 'confirmed' }]);
    const r = reconciler({}, [ethereumP, stellarP]);
    await r.reconcile();
    expect(queue.getMessageStatus('evm-msg')).toBe('confirmed');
    expect(ethCalls).toEqual([{ messageId: 'evm-msg', txHash: '0xe' }]);
  });

  it('emits message-reconciled only for actual transitions', async () => {
    inFlightMessage('transition');
    queue.markSubmitted('transition', '0x2');
    const { provider } = programmableProvider('stellar', [{ kind: 'confirmed' }]);
    const r = reconciler({}, [provider]);
    const reconciled = jest.fn();
    r.on('message-reconciled', reconciled);
    await r.reconcile();
    expect(reconciled).toHaveBeenCalledTimes(1);
    expect(reconciled).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'transition', action: 'confirmed', reason: 'confirmed-on-chain' }),
    );
  });

  it('emits stale-message-detected when it acts on a stale message', async () => {
    jest.useFakeTimers();
    inFlightMessage('stale');
    jest.advanceTimersByTime(10_000);
    const r = reconciler();
    const stale = jest.fn();
    r.on('stale-message-detected', stale);
    await r.reconcile();
    expect(stale).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'stale', status: 'processing' }));
  });

  it('degrades after repeated provider errors and recovers on a correction', async () => {
    let attempts = 0;
    const flaky: MessageStatusProvider = {
      chainId: 'stellar',
      async getMessageStatus() {
        attempts++;
        if (attempts <= 2) throw new Error('rpc down');
        return { kind: 'confirmed' };
      },
    };
    inFlightMessage('x');
    queue.markSubmitted('x', '0xx');
    const r = reconciler({ maxConsecutiveErrorRuns: 2 }, [flaky]);
    const degraded = jest.fn();
    const recovered = jest.fn();
    r.on('reconciler-degraded', degraded);
    r.on('reconciler-recovered', recovered);

    await r.reconcile();
    expect(r.getStats().consecutiveErrorRuns).toBe(1);
    expect(degraded).not.toHaveBeenCalled();

    await r.reconcile();
    expect(r.getStats().consecutiveErrorRuns).toBe(2);
    expect(degraded).toHaveBeenCalledTimes(1);

    await r.reconcile();
    expect(attempts).toBe(3);
    expect(queue.getMessageStatus('x')).toBe('confirmed');
    expect(recovered).toHaveBeenCalledTimes(1);
    expect(r.getStats().consecutiveErrorRuns).toBe(0);
    expect(r.getStats()).toMatchObject({ runs: 3, errors: 2, confirmed: 1 });
  });

  it('start() runs one pass on start when configured, then on schedule', async () => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
    inFlightMessage('m');
    const summaries = jest.fn();
    const r = reconciler({ reconcileOnStart: true, intervalMs: 1000 }, []);
    r.on('reconciliation-summary', summaries);
    r.start();
    await flushMicrotasks();
    expect(summaries).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1000);
    await flushMicrotasks();
    expect(summaries).toHaveBeenCalledTimes(2);
    r.stop();
    jest.advanceTimersByTime(3000);
    expect(summaries).toHaveBeenCalledTimes(2);
  });

  it('start() is a no-op while already started', async () => {
    jest.useFakeTimers();
    const started = jest.fn();
    const r = reconciler({ reconcileOnStart: false, intervalMs: 1000 }, []);
    r.on('reconciler-started', started);
    r.start();
    r.start();
    expect(started).toHaveBeenCalledTimes(1);
    r.stop();
  });

  it('emits stop events and cleans up listeners with dispose()', async () => {
    const r = reconciler();
    const stopped = jest.fn();
    r.on('reconciler-stopped', stopped);
    r.stop();
    expect(stopped).toHaveBeenCalledTimes(1);
    r.dispose();
    expect(r.listenerCount('reconciliation-summary')).toBe(0);
  });

  it('shares a single run across concurrent callers', async () => {
    inFlightMessage('m');
    queue.markSubmitted('m', '0xm');
    const { provider } = programmableProvider('stellar', [{ kind: 'confirmed' }]);
    const r = reconciler({}, [provider]);
    const [a, b] = await Promise.all([r.reconcile(), r.reconcile()]);
    expect(a.runId).toBe(b.runId);
    expect(r.getStats().runs).toBe(1);
  });

  it('EvmExecutorStatusProvider maps the executor chain view', async () => {
    const executor: { getTransactionStatus(txHash: string): Promise<GetTransactionStatusResult> } = {
      getTransactionStatus: (_txHash: string) => Promise.resolve({ confirmed: true, blockNumber: 9 }),
    };
    const provider = new EvmExecutorStatusProvider('ethereum', executor);
    expect(provider.chainId).toBe('ethereum');
    expect(await provider.getMessageStatus('m', '0x1')).toEqual({ kind: 'confirmed', blockNumber: 9 });

    executor.getTransactionStatus = () => Promise.resolve({ confirmed: false });
    expect(await provider.getMessageStatus('m', '0x2')).toEqual({ kind: 'not-found' });
  });

  it('treats an unknown on-chain status with no detail as an error', async () => {
    inFlightMessage('silent');
    queue.markSubmitted('silent', '0xs');
    const { provider } = programmableProvider('stellar', [{ kind: 'unknown' }]);
    const r = reconciler({}, [provider]);
    const errorSpy = jest.fn();
    r.on('reconcile-error', errorSpy);
    const summary = await r.reconcile();
    expect(queue.getMessageStatus('silent')).toBe('submitted');
    expect(summary.transitions[0]).toMatchObject({ action: 'deferred', reason: 'provider-error' });
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'silent', error: 'on-chain status unknown' }));
  });

  it('normalises a non-Error provider failure', async () => {
    inFlightMessage('str');
    queue.markSubmitted('str', '0xstr');
    const provider: MessageStatusProvider = {
      chainId: 'stellar',
      getMessageStatus: () => Promise.reject('gremlin'),
    };
    const r = reconciler({}, [provider]);
    const errorSpy = jest.fn();
    r.on('reconcile-error', errorSpy);
    await r.reconcile();
    expect(queue.getMessageStatus('str')).toBe('submitted');
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ error: 'gremlin' }));
  });

  it('accepts a single provider instead of an array', async () => {
    inFlightMessage('one');
    queue.markSubmitted('one', '0x1');
    const { provider } = programmableProvider('stellar', [{ kind: 'confirmed' }]);
    const r = new MessageStatusReconciler({ queue, provider, config: { intervalMs: 0 } });
    await r.reconcile();
    expect(queue.getMessageStatus('one')).toBe('confirmed');
  });

  describe('defensive branches for mid-run races', () => {
    it('defers an untracked in-flight status', async () => {
      inFlightMessage('m');
      const snapshot = queue.getInflightSnapshot()[0];
      snapshot.status = 'queued';
      snapshot.inflightAt = undefined;
      queue.getInflightSnapshot = (() => [snapshot]) as MessageQueue['getInflightSnapshot'];
      const r = reconciler();
      const summary = await r.reconcile();
      expect(summary.transitions[0]).toMatchObject({ action: 'deferred', reason: 'already-resolved' });
    });

    it('defers a confirmation whose completion was overwritten mid-run', async () => {
      inFlightMessage('m');
      queue.markSubmitted('m', '0xm');
      const { provider } = programmableProvider('stellar', [{ kind: 'confirmed' }]);
      const r = reconciler({}, [provider]);
      queue.complete = jest.fn((_result: ExecutionResult) => Promise.resolve()) as MessageQueue['complete'];
      const summary = await r.reconcile();
      expect(summary.transitions[0]).toMatchObject({ action: 'deferred', reason: 'already-resolved' });
    });

    it('defers a requeue whose retry path resolved differently', async () => {
      jest.useFakeTimers();
      inFlightMessage('m');
      jest.advanceTimersByTime(20_000);
      const r = reconciler();
      queue.complete = jest.fn((_result: ExecutionResult) => Promise.resolve()) as MessageQueue['complete'];
      const summary = await r.reconcile();
      expect(summary.transitions[0]).toMatchObject({ action: 'deferred', reason: 'already-resolved' });
    });

    it('defers a forced failure that did not take effect', async () => {
      inFlightMessage('m');
      queue.markSubmitted('m', '0xm');
      const { provider } = programmableProvider('stellar', [{ kind: 'reverted' }]);
      const r = reconciler({}, [provider]);
      queue.fail = jest.fn(() => false) as MessageQueue['fail'];
      const summary = await r.reconcile();
      expect(summary.transitions[0]).toMatchObject({ action: 'deferred', reason: 'already-resolved' });
    });
  });
});