/**
 * Integration coverage for message status reconciliation: the queue, the
 * reconciler, the executor-backed status provider and a mocked destination
 * chain work together so a broadcast message is either confirmed, failed, or
 * returned to the queue for another attempt - and never dropped or lost.
 */
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }));

import axios from 'axios';
import { MessageQueue } from '../../queue/message-queue';
import { EvmExecutor } from '../../executors/evm-executor';
import { EvmExecutorStatusProvider, MessageStatusReconciler } from '../message-status-reconciler';
import { CrossChainMessage, MessageStatusProvider, OnChainMessageStatus } from '../../types';

const post = axios.post as jest.Mock;

function makeMessage(overrides: Partial<CrossChainMessage> = {}): CrossChainMessage {
  return {
    id: 'msg-1',
    sourceChainId: 'arbitrum',
    destinationChainId: 'ethereum',
    sourceTxHash: '0x' + 'a'.repeat(64),
    sourceBlockNumber: 10_000_000,
    messageType: 'lock',
    payload: '0xdeadbeef',
    sender: '0x' + '1'.repeat(40),
    recipient: '0x' + '2'.repeat(40),
    amount: '1000',
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

describe('message status reconciliation pipeline', () => {
  afterEach(() => {
    jest.useRealTimers();
    post.mockReset();
  });

  it('confirms a broadcast message through the executor-backed provider and real RPC shapes', async () => {
    post.mockImplementation(async (_url: string, body: { method: string }) => {
      if (body.method === 'eth_getTransactionReceipt') {
        return { data: { result: { blockNumber: '0x64', status: '0x1', gasUsed: '0x5208' } } };
      }
      if (body.method === 'eth_blockNumber') {
        return { data: { result: '0x65' } };
      }
      return { data: { error: { message: `unexpected RPC call ${body.method}` } } };
    });

    const queue = new MessageQueue({ concurrency: 5 });
    queue.enqueue(makeMessage({ id: 'peer', destinationChainId: 'ethereum' }));
    queue.dequeue();
    queue.markSubmitted('peer', '0xabc');

    const executor = new EvmExecutor({
      chainId: 'ethereum',
      chainType: 'evm',
      rpcUrl: 'http://localhost:8545',
      confirmationBlocks: 1,
      confirmationPollIntervalMs: 1,
    });
    const r = new MessageStatusReconciler({
      queue,
      provider: new EvmExecutorStatusProvider('ethereum', executor),
      config: { intervalMs: 0 },
    });
    const reconciled = jest.fn();
    r.on('message-reconciled', reconciled);

    const summary = await r.reconcile();

    expect(queue.getMessageStatus('peer')).toBe('confirmed');
    expect(queue.getCompletedMessages()[0]).toMatchObject({ messageId: 'peer', success: true, transactionHash: '0xabc' });
    expect(r.getStats()).toMatchObject({ confirmed: 1, corrections: 1, runs: 1 });
    expect(reconciled).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'peer', action: 'confirmed', reason: 'confirmed-on-chain' }),
    );
    expect(post).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'eth_getTransactionReceipt' }),
      expect.anything(),
    );
    expect(summary.transitions).toHaveLength(1);
  });

  it('recovers a lost submission: requeues after no receipt, then confirms on resubmission', async () => {
    jest.useFakeTimers();
    const { provider, calls } = programmableProvider('ethereum', [
      { kind: 'not-found' },
      { kind: 'confirmed', blockNumber: 42 },
    ]);
    const queue = new MessageQueue({ maxRetries: 5, retryDelayMs: 0 });
    queue.enqueue(makeMessage({ id: 'lost', destinationChainId: 'ethereum' }));
    queue.dequeue();
    queue.markSubmitted('lost', '0xtx1');

    const r = new MessageStatusReconciler({ queue, provider, config: { staleAfterMs: 10_000, intervalMs: 0 } });
    jest.advanceTimersByTime(15_000);
    await r.reconcile();
    expect(queue.getMessageStatus('lost')).toBe('queued');
    expect(queue.getPendingCount()).toBe(1);

    // The relayer dequeues the recovered message and broadcasts it again.
    queue.dequeue();
    queue.markSubmitted('lost', '0xtx2');
    await r.reconcile();

    expect(queue.getMessageStatus('lost')).toBe('confirmed');
    expect(queue.getCompletedMessages()[0]).toMatchObject({ messageId: 'lost', success: true, transactionHash: '0xtx2' });
    expect(calls).toEqual([
      { messageId: 'lost', txHash: '0xtx1' },
      { messageId: 'lost', txHash: '0xtx2' },
    ]);
    expect(r.getStats()).toMatchObject({ requeued: 1, confirmed: 1, corrections: 2 });
  });

  it('fails a reverted submission and never sends it again', async () => {
    const { provider } = programmableProvider('ethereum', [{ kind: 'reverted', error: 'TRANSFER_FROM_FAILED' }]);
    const queue = new MessageQueue({ maxRetries: 50, retryDelayMs: 0 });
    queue.enqueue(makeMessage({ id: 'rev', destinationChainId: 'ethereum' }));
    queue.dequeue();
    queue.markSubmitted('rev', '0xrev');

    const r = new MessageStatusReconciler({ queue, provider, config: { intervalMs: 0 } });
    const failed = jest.fn();
    queue.on('message-failed', failed);
    await r.reconcile();

    expect(queue.getMessageStatus('rev')).toBe('failed');
    expect(queue.getFailedCount()).toBe(1);
    expect(queue.getPendingCount()).toBe(0);
    expect(queue.getFailedMessages()[0]).toMatchObject({ lastError: expect.stringContaining('TRANSFER_FROM_FAILED') });
    expect(failed).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'rev', reason: 'forced' }));
  });

  it('leaves healthy in-flight deliveries untouched while reconciliation runs', async () => {
    const queue = new MessageQueue({ concurrency: 5 });
    queue.enqueue(makeMessage({ id: 'healthy', destinationChainId: 'ethereum' }));
    queue.dequeue();
    const r = new MessageStatusReconciler({ queue, config: { staleAfterMs: 60_000, intervalMs: 0 } });
    const summary = await r.reconcile();

    expect(queue.getMessageStatus('healthy')).toBe('processing');
    expect(summary.transitions[0]).toMatchObject({ action: 'deferred', reason: 'not-stale' });

    await queue.complete({ messageId: 'healthy', success: true, transactionHash: '0xok', timestamp: Date.now() });
    expect(queue.getMessageStatus('healthy')).toBe('confirmed');
    expect(r.getStats()).toMatchObject({ corrections: 0, confirmed: 0 });
  });
});