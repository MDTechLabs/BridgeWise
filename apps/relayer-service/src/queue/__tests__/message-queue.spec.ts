import { MessageQueue } from '../message-queue';
import { CrossChainMessage } from '../../types';

function makeMessage(overrides: Partial<CrossChainMessage> = {}): CrossChainMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourceChainId: 'ethereum',
    destinationChainId: 'stellar',
    sourceTxHash: '0x' + 'a'.repeat(64),
    sourceBlockNumber: 10000000,
    messageType: 'lock',
    payload: '0xdeadbeef',
    sender: '0xsender',
    recipient: 'Grecipient',
    createdAt: Date.now(),
    status: 'pending',
    retryCount: 0,
    ...overrides,
  };
}

describe('MessageQueue', () => {
  let queue: MessageQueue;

  beforeEach(() => {
    queue = new MessageQueue({ maxRetries: 3, retryDelayMs: 100, concurrency: 5 });
  });

  afterEach(() => {
    queue.removeAllListeners();
  });

  it('enqueues a message', () => {
    const msg = makeMessage();
    queue.enqueue(msg);
    expect(queue.getPendingCount()).toBe(1);
  });

  it('does not enqueue duplicate messages', () => {
    const msg = makeMessage({ id: 'dup-msg' });
    queue.enqueue(msg);
    queue.enqueue(msg);
    expect(queue.getPendingCount()).toBe(1);
  });

  it('dequeues a message', () => {
    queue.enqueue(makeMessage());
    const msg = queue.dequeue();
    expect(msg).not.toBeNull();
    expect(msg?.status).toBe('processing');
    expect(queue.getPendingCount()).toBe(0);
    expect(queue.getProcessingCount()).toBe(1);
  });

  it('respects concurrency limit', () => {
    queue = new MessageQueue({ concurrency: 2 });
    for (let i = 0; i < 5; i++) {
      queue.enqueue(makeMessage({ id: `msg-${i}` }));
    }

    const m1 = queue.dequeue();
    const m2 = queue.dequeue();
    const m3 = queue.dequeue();

    expect(m1).not.toBeNull();
    expect(m2).not.toBeNull();
    expect(m3).toBeNull();
  });

  it('completes a message successfully', async () => {
    queue.enqueue(makeMessage({ id: 'msg-1' }));
    queue.dequeue();

    await queue.complete({
      messageId: 'msg-1',
      success: true,
      transactionHash: '0xtx',
      blockNumber: 10000001,
      timestamp: Date.now(),
    });

    expect(queue.getProcessingCount()).toBe(0);
    expect(queue.getCompletedCount()).toBe(1);
  });

  it('retries a failed message', async () => {
    queue = new MessageQueue({ maxRetries: 2, retryDelayMs: 10 });

    queue.enqueue(makeMessage({ id: 'msg-1' }));
    queue.dequeue();

    await queue.complete({
      messageId: 'msg-1',
      success: false,
      error: 'RPC timeout',
      timestamp: Date.now(),
    });

    expect(queue.getPendingCount()).toBe(1);
    expect(queue.getFailedCount()).toBe(0);
  });

  it('moves message to failed after exhausting retries', async () => {
    queue = new MessageQueue({ maxRetries: 1, retryDelayMs: 10 });

    queue.enqueue(makeMessage({ id: 'msg-1' }));
    queue.dequeue();

    await queue.complete({
      messageId: 'msg-1',
      success: false,
      error: 'RPC timeout',
      timestamp: Date.now(),
    });

    expect(queue.getPendingCount()).toBe(1);

    queue.dequeue();

    await queue.complete({
      messageId: 'msg-1',
      success: false,
      error: 'RPC timeout',
      timestamp: Date.now(),
    });

    expect(queue.getFailedCount()).toBe(1);
    expect(queue.getPendingCount()).toBe(0);
  });

  it('retries specific failed message', () => {
    const msg = makeMessage({ id: 'failed-msg' });
    queue.enqueue(msg);
    queue.dequeue();

    queue.complete({
      messageId: 'failed-msg',
      success: false,
      error: 'error',
      timestamp: Date.now(),
    });

    const retried = queue.retryFailed('failed-msg');
    expect(retried).toBe(true);
    expect(queue.getFailedCount()).toBe(0);
    expect(queue.getPendingCount()).toBe(1);
  });

  it('retries all failed messages', () => {
    for (let i = 0; i < 3; i++) {
      const msg = makeMessage({ id: `fail-${i}` });
      queue.enqueue(msg);
      queue.dequeue();

      queue.complete({
        messageId: `fail-${i}`,
        success: false,
        error: 'error',
        timestamp: Date.now(),
      });
    }

    const count = queue.retryAllFailed();
    expect(count).toBe(3);
    expect(queue.getFailedCount()).toBe(0);
    expect(queue.getPendingCount()).toBe(3);
  });

  it('clears the queue', () => {
    queue.enqueue(makeMessage());
    queue.clear();
    expect(queue.getPendingCount()).toBe(0);
    expect(queue.getProcessingCount()).toBe(0);
    expect(queue.getCompletedCount()).toBe(0);
    expect(queue.getFailedCount()).toBe(0);
  });

  it('emits enqueue event', () => {
    const spy = jest.fn();
    queue.on('message-enqueued', spy);
    queue.enqueue(makeMessage());
    expect(spy).toHaveBeenCalled();
  });

  it('emits dequeue event', () => {
    const spy = jest.fn();
    queue.on('message-dequeued', spy);
    queue.enqueue(makeMessage());
    queue.dequeue();
    expect(spy).toHaveBeenCalled();
  });

  it('emits complete event', () => {
    const spy = jest.fn();
    queue.on('message-completed', spy);
    queue.enqueue(makeMessage({ id: 'msg-c' }));
    queue.dequeue();
    queue.complete({ messageId: 'msg-c', success: true, timestamp: Date.now() });
    expect(spy).toHaveBeenCalled();
  });

  it('emits retry event', async () => {
    const spy = jest.fn();
    queue.on('message-retrying', spy);
    queue.enqueue(makeMessage({ id: 'msg-r' }));
    queue.dequeue();
    await queue.complete({ messageId: 'msg-r', success: false, error: 'err', timestamp: Date.now() });
    expect(spy).toHaveBeenCalled();
  });

  it('emits failed event when retries exhausted', async () => {
    queue = new MessageQueue({ maxRetries: 1, retryDelayMs: 10 });
    const spy = jest.fn();
    queue.on('message-failed', spy);
    queue.enqueue(makeMessage({ id: 'msg-f' }));
    queue.dequeue();
    await queue.complete({ messageId: 'msg-f', success: false, error: 'err', timestamp: Date.now() });
    queue.dequeue();
    await queue.complete({ messageId: 'msg-f', success: false, error: 'err', timestamp: Date.now() });
    expect(spy).toHaveBeenCalled();
  });
});
