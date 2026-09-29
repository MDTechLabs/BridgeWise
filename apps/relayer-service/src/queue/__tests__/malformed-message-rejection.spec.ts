import { MessageQueue } from '../message-queue';
import { CrossChainMessage } from '../../types';

const EVM_ADDRESS = '0x' + '1'.repeat(40);
const STELLAR_ACCOUNT = 'G' + 'A'.repeat(55);

function makeMessage(overrides: Partial<CrossChainMessage> = {}): CrossChainMessage {
  return {
    id: 'msg-1',
    sourceChainId: 'ethereum',
    destinationChainId: 'stellar',
    sourceTxHash: '0x' + 'a'.repeat(64),
    sourceBlockNumber: 10_000_000,
    messageType: 'lock',
    payload: '0xdeadbeef',
    sender: EVM_ADDRESS,
    recipient: STELLAR_ACCOUNT,
    amount: '1000',
    createdAt: 1_700_000_000_000,
    status: 'pending',
    retryCount: 0,
    ...overrides,
  };
}

interface RejectionEvent {
  messageId?: string;
  reason: string;
  errors: Array<{ field: string; code: string; message: string }>;
}

describe('MessageQueue malformed message rejection', () => {
  let queue: MessageQueue;
  let rejected: jest.Mock;

  beforeEach(() => {
    queue = new MessageQueue({ maxRetries: 3, retryDelayMs: 100, concurrency: 5 });
    rejected = jest.fn();
    queue.on('message-rejected', rejected);
  });

  afterEach(() => {
    queue.removeAllListeners();
  });

  describe('intake', () => {
    it('accepts a well-formed message', () => {
      expect(queue.enqueue(makeMessage())).toBe(true);
      expect(queue.getPendingCount()).toBe(1);
      expect(rejected).not.toHaveBeenCalled();
    });

    it.each<[string, Partial<CrossChainMessage>, string]>([
      ['a missing payload', { payload: '' }, 'MISSING_PAYLOAD'],
      ['a non-hex payload', { payload: '0xnothex' }, 'INVALID_PAYLOAD'],
      ['an odd-length payload', { payload: '0xabc' }, 'ODD_LENGTH_HEX_PAYLOAD'],
      ['a negative amount', { amount: '-1' }, 'INVALID_AMOUNT'],
      ['a non-integer amount', { amount: '1.5' }, 'INVALID_AMOUNT'],
      ['a blank sender', { sender: '  ' }, 'MISSING_SENDER'],
      ['a blank recipient', { recipient: '' }, 'MISSING_RECIPIENT'],
      ['an unknown status', { status: 'inflight' as never }, 'INVALID_STATUS'],
      ['a negative retry count', { retryCount: -1 }, 'INVALID_RETRY_COUNT'],
      ['a negative block number', { sourceBlockNumber: -1 }, 'INVALID_SOURCE_BLOCK_NUMBER'],
      ['a fractional block number', { sourceBlockNumber: 1.5 }, 'INVALID_SOURCE_BLOCK_NUMBER'],
      ['a malformed tx hash', { sourceTxHash: 'not-a-hash!!' }, 'INVALID_SOURCE_TX_HASH'],
      ['a self-routed chain pair', { destinationChainId: 'ethereum' }, 'SAME_SOURCE_AND_DESTINATION'],
      ['a zero gas limit', { maxGasLimit: '0' }, 'INVALID_MAX_GAS_LIMIT'],
    ])('rejects %s', (_label, overrides, code) => {
      expect(queue.enqueue(makeMessage(overrides))).toBe(false);
      expect(queue.getPendingCount()).toBe(0);
      expect(rejected).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'malformed', errors: expect.arrayContaining([expect.objectContaining({ code })]) }),
      );
    });

    it('rejects a message that is not an object', () => {
      expect(queue.enqueue(null as never)).toBe(false);
      expect(queue.enqueue(undefined as never)).toBe(false);
      expect(queue.enqueue('msg-1' as never)).toBe(false);
      expect(queue.getPendingCount()).toBe(0);
      expect(rejected).toHaveBeenCalledTimes(3);
    });

    it('rejects a message with an id of the wrong type without throwing', () => {
      expect(queue.enqueue(makeMessage({ id: 42 as never }))).toBe(false);
      expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ messageId: undefined }));
    });

    it('never dequeues a rejected message', () => {
      queue.enqueue(makeMessage({ payload: '0xabc' }));
      expect(queue.dequeue()).toBeNull();
      expect(queue.getProcessingCount()).toBe(0);
    });

    it('does not emit message-enqueued for a rejected message', () => {
      const enqueued = jest.fn();
      queue.on('message-enqueued', enqueued);
      queue.enqueue(makeMessage({ payload: '0xabc' }));
      expect(enqueued).not.toHaveBeenCalled();
    });

    it('reports every malformed field on one message at once', () => {
      queue.enqueue({ id: '', payload: '0xabc', amount: '-1', retryCount: -1 } as never);
      const event = rejected.mock.calls[0][0] as RejectionEvent;
      expect(event.errors.map((error) => error.code)).toEqual(
        expect.arrayContaining(['MISSING_MESSAGE_ID', 'ODD_LENGTH_HEX_PAYLOAD', 'INVALID_AMOUNT']),
      );
    });
  });

  describe('detector isolation', () => {
    it('never registers a rejected message with the duplicate detector', () => {
      queue.enqueue(makeMessage({ payload: '0xabc' }));
      expect(queue.getDuplicateStats()).toMatchObject({ checked: 0, tracked: 0, duplicates: 0 });
    });

    it('lets a well-formed message reuse the id of a rejected one', () => {
      expect(queue.enqueue(makeMessage({ id: 'shared', payload: '0xabc' }))).toBe(false);
      expect(queue.enqueue(makeMessage({ id: 'shared' }))).toBe(true);
    });

    it('keeps detecting duplicates after a rejected message', () => {
      queue.enqueue(makeMessage({ id: 'a', sourceLogIndex: 0 }));
      queue.enqueue(makeMessage({ id: 'bad', sourceLogIndex: 1, payload: '0xabc' }));
      expect(queue.enqueue(makeMessage({ id: 'a', sourceLogIndex: 0 }))).toBe(false);
    });

    it('does not let a rejected message evict a tracked one at the entry limit', () => {
      queue = new MessageQueue({ deduplication: { windowMs: 60_000, maxEntries: 1 } });
      queue.enqueue(makeMessage({ id: 'tracked' }));
      queue.enqueue(makeMessage({ id: 'bad', payload: '0xabc' }));
      expect(queue.enqueue(makeMessage({ id: 'tracked' }))).toBe(false);
    });

    it('reports a malformed message as malformed, not as a duplicate', () => {
      const duplicate = jest.fn();
      queue.on('duplicate-message', duplicate);
      queue.enqueue(makeMessage({ id: 'x' }));
      queue.enqueue(makeMessage({ id: 'x', amount: '-5' }));
      expect(rejected).toHaveBeenCalledTimes(1);
      expect(duplicate).not.toHaveBeenCalled();
    });

    it('does not count a rejected message as an accepted one', () => {
      queue.enqueue(makeMessage({ id: 'good' }));
      queue.enqueue(makeMessage({ id: 'bad', payload: '0xabc' }));
      expect(queue.getValidationStats()).toEqual({ checked: 2, accepted: 1, rejected: 1 });
      expect(queue.getPendingCount()).toBe(1);
    });
  });

  describe('observability', () => {
    it('tracks checked, accepted and rejected counts', () => {
      queue.enqueue(makeMessage({ id: 'a' }));
      queue.enqueue(makeMessage({ id: 'b', sourceLogIndex: 1 }));
      queue.enqueue(makeMessage({ id: 'c', sourceLogIndex: 2, payload: '' }));
      expect(queue.getValidationStats()).toEqual({ checked: 3, accepted: 2, rejected: 1 });
    });

    it('resets counters on clear()', () => {
      queue.enqueue(makeMessage({ id: 'a' }));
      queue.enqueue(makeMessage({ id: 'b', sourceLogIndex: 1, payload: '' }));
      queue.clear();
      expect(queue.getValidationStats()).toEqual({ checked: 0, accepted: 0, rejected: 0 });
    });

    it('returns a copy so callers cannot mutate internal counters', () => {
      const stats = queue.getValidationStats();
      stats.rejected = 999;
      expect(queue.getValidationStats().rejected).toBe(0);
    });

    it('includes the message id on the rejection event when it is a usable string', () => {
      queue.enqueue(makeMessage({ id: 'bad-1', payload: '0xabc' }));
      expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'bad-1' }));
    });
  });

  describe('configuration', () => {
    it('enforces chain-specific address formats when asked', () => {
      queue = new MessageQueue({ validation: { enforceAddressFormat: true } });
      rejected = jest.fn();
      queue.on('message-rejected', rejected);
      expect(queue.enqueue(makeMessage({ sender: 'not-an-evm-address' }))).toBe(false);
      expect(rejected).toHaveBeenCalledWith(
        expect.objectContaining({ errors: expect.arrayContaining([expect.objectContaining({ field: 'sender' })]) }),
      );
    });

    it('accepts a correct address once the format is enforced', () => {
      queue = new MessageQueue({ validation: { enforceAddressFormat: true } });
      expect(queue.enqueue(makeMessage())).toBe(true);
    });

    it('honours a custom payload length limit', () => {
      queue = new MessageQueue({ validation: { maxPayloadLength: 4 } });
      expect(queue.enqueue(makeMessage({ payload: '0xdeadbeef' }))).toBe(false);
      expect(queue.enqueue(makeMessage({ id: 'small', payload: '0xab' }))).toBe(true);
    });

    it('accepts malformed messages when validation is disabled', () => {
      queue = new MessageQueue({ validation: false });
      expect(queue.enqueue(makeMessage({ payload: '0xabc', amount: '-1' }))).toBe(true);
      expect(queue.getPendingCount()).toBe(1);
      expect(queue.getValidationStats()).toEqual({ checked: 0, accepted: 0, rejected: 0 });
    });

    it('still detects duplicates when validation is disabled', () => {
      queue = new MessageQueue({ validation: false });
      expect(queue.enqueue(makeMessage({ id: 'x' }))).toBe(true);
      expect(queue.enqueue(makeMessage({ id: 'x' }))).toBe(false);
    });
  });
});
