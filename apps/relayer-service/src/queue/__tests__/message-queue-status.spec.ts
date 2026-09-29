import { MessageQueue } from '../message-queue';
import { CrossChainMessage } from '../../types';

function makeMessage(overrides: Partial<CrossChainMessage> = {}): CrossChainMessage {
  return {
    id: 'msg-1',
    sourceChainId: 'ethereum',
    destinationChainId: 'stellar',
    sourceTxHash: '0x' + 'a'.repeat(64),
    sourceBlockNumber: 10_000_000,
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

describe('MessageQueue status lifecycle', () => {
  let queue: MessageQueue;

  beforeEach(() => {
    queue = new MessageQueue({ maxRetries: 3, retryDelayMs: 100, concurrency: 5 });
  });

  afterEach(() => {
    queue.removeAllListeners();
  });

  it('tracks a message as submitted after markSubmitted', () => {
    queue.enqueue(makeMessage({ id: 'm' }));
    queue.dequeue();
    expect(queue.markSubmitted('m', '0xtx')).toBe(true);
    expect(queue.getMessageStatus('m')).toBe('submitted');
    expect(queue.getSubmittedCount()).toBe(1);
    expect(queue.getProcessingCount()).toBe(1);
  });

  it('refuses to mark a message that is not in flight', () => {
    expect(queue.markSubmitted('nope', '0xtx')).toBe(false);
    expect(queue.getMessageStatus('nope')).toBeNull();
  });

  it('emits message-submitted with the transaction hash', () => {
    const spy = jest.fn();
    queue.on('message-submitted', spy);
    queue.enqueue(makeMessage({ id: 'm' }));
    queue.dequeue();
    queue.markSubmitted('m', '0xtx');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'm', txHash: '0xtx', destinationChainId: 'stellar' }));
  });

  it('advances the tracked status through the whole lifecycle', async () => {
    queue.enqueue(makeMessage({ id: 'm' }));
    expect(queue.getMessageStatus('m')).toBe('queued');
    queue.dequeue();
    expect(queue.getMessageStatus('m')).toBe('processing');
    queue.markSubmitted('m', '0xtx');
    expect(queue.getMessageStatus('m')).toBe('submitted');
    await queue.complete({ messageId: 'm', success: true, transactionHash: '0xtx', timestamp: Date.now() });
    expect(queue.getMessageStatus('m')).toBe('confirmed');
  });

  it('reports queued, failed and unknown statuses', async () => {
    queue.enqueue(makeMessage({ id: 'waiting' }));
    expect(queue.getMessageStatus('waiting')).toBe('queued');

    queue = new MessageQueue({ maxRetries: 0 });
    queue.enqueue(makeMessage({ id: 'dead' }));
    queue.dequeue();
    await queue.complete({ messageId: 'dead', success: false, error: 'boom', timestamp: Date.now() });
    expect(queue.getMessageStatus('dead')).toBe('failed');

    expect(queue.getMessageStatus('never-seen')).toBeNull();
  });

  it('records the confirmed status on successful completion', async () => {
    queue.enqueue(makeMessage({ id: 'ok' }));
    queue.dequeue();
    await queue.complete({ messageId: 'ok', success: true, transactionHash: '0xreal', timestamp: Date.now() });
    expect(queue.getCompletedMessages()[0]).toMatchObject({ messageId: 'ok', success: true, transactionHash: '0xreal' });
  });

  it('does not let a late reconciled duplicate overwrite the real completion', async () => {
    queue.enqueue(makeMessage({ id: 'ok' }));
    queue.dequeue();
    await queue.complete({ messageId: 'ok', success: true, transactionHash: '0xreal', timestamp: 1 });
    await queue.complete({ messageId: 'ok', success: false, error: 'late result', timestamp: 2 });
    expect(queue.getCompletedMessages()[0]).toMatchObject({ messageId: 'ok', success: true, transactionHash: '0xreal' });
    expect(queue.getFailedCount()).toBe(0);
  });

  it('records a completion for a message the queue never dequeued', async () => {
    await queue.complete({ messageId: 'external', success: true, transactionHash: '0xext', timestamp: Date.now() });
    expect(queue.getMessageStatus('external')).toBe('confirmed');
    expect(queue.getCompletedCount()).toBe(1);
  });

  it('exposes a read-only in-flight snapshot', () => {
    queue.enqueue(makeMessage({ id: 'snap' }));
    queue.dequeue();
    queue.markSubmitted('snap', '0xtx');
    const snap = queue.getInflightSnapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0]).toMatchObject({
      messageId: 'snap',
      status: 'submitted',
      submittedTxHash: '0xtx',
      destinationChainId: 'stellar',
    });
    snap[0].message.payload = '0xmutated';
    snap[0].status = 'queued';
    expect(queue.getInflightSnapshot()[0].message.payload).toBe('0xdeadbeef');
    expect(queue.getInflightSnapshot()[0].status).toBe('submitted');
  });

  it('forces an in-flight message to failed with fail()', () => {
    queue.enqueue(makeMessage({ id: 'revert' }));
    queue.dequeue();
    expect(queue.fail('revert', 'reverted on chain')).toBe(true);
    expect(queue.getMessageStatus('revert')).toBe('failed');
    expect(queue.getFailedMessages()[0]).toMatchObject({ lastError: 'reverted on chain' });
    expect(queue.fail('not-inflight', 'x')).toBe(false);
  });

  it('resets lifecycle state on clear()', () => {
    queue.enqueue(makeMessage({ id: 'a' }));
    queue.dequeue();
    queue.markSubmitted('a', '0xtx');
    queue.clear();
    expect(queue.getProcessingCount()).toBe(0);
    expect(queue.getSubmittedCount()).toBe(0);
    expect(queue.getMessageStatus('a')).toBeNull();
  });
});