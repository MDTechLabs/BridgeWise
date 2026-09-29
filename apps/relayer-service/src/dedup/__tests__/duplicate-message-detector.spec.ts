import { DuplicateMessageDetector, computeMessageFingerprint } from '../duplicate-message-detector';
import { CrossChainMessage } from '../../types';

function makeMessage(overrides: Partial<CrossChainMessage> = {}): CrossChainMessage {
  return {
    id: 'msg-1',
    sourceChainId: 'ethereum',
    destinationChainId: 'stellar',
    sourceTxHash: '0x' + 'a'.repeat(64),
    sourceBlockNumber: 10000000,
    messageType: 'lock',
    payload: '0xdeadbeef',
    sender: '0xsender',
    recipient: 'GRECIPIENT',
    amount: '1000',
    createdAt: 1_000,
    status: 'pending',
    retryCount: 0,
    ...overrides,
  };
}

describe('computeMessageFingerprint', () => {
  it('ignores relayer-assigned and mutable fields', () => {
    const base = computeMessageFingerprint(makeMessage());
    const variant = computeMessageFingerprint(
      makeMessage({
        id: 'msg-other',
        status: 'failed',
        retryCount: 3,
        createdAt: 99_999,
        lastError: 'boom',
        sourceBlockNumber: 10000005,
      }),
    );
    expect(variant).toBe(base);
  });

  it('treats hex values case-insensitively', () => {
    const lower = computeMessageFingerprint(makeMessage({ sourceTxHash: '0xabcdef', payload: '0xdeadbeef' }));
    const upper = computeMessageFingerprint(makeMessage({ sourceTxHash: '0xABCDEF', payload: '0xDEADBEEF' }));
    expect(upper).toBe(lower);
  });

  it('keeps non-hex values case-sensitive', () => {
    expect(computeMessageFingerprint(makeMessage({ recipient: 'GABC' }))).not.toBe(
      computeMessageFingerprint(makeMessage({ recipient: 'gabc' })),
    );
  });

  it.each<[string, Partial<CrossChainMessage>]>([
    ['source chain', { sourceChainId: 'polygon' }],
    ['destination chain', { destinationChainId: 'base' }],
    ['source tx hash', { sourceTxHash: '0x' + 'b'.repeat(64) }],
    ['log index', { sourceLogIndex: 1 }],
    ['message type', { messageType: 'burn' }],
    ['payload', { payload: '0xcafe' }],
    ['sender', { sender: '0xother' }],
    ['recipient', { recipient: 'GOTHER' }],
    ['token', { tokenAddress: '0xtoken' }],
    ['amount', { amount: '1001' }],
  ])('changes when the %s changes', (_field, overrides) => {
    expect(computeMessageFingerprint(makeMessage(overrides))).not.toBe(computeMessageFingerprint(makeMessage()));
  });
});

describe('DuplicateMessageDetector', () => {
  let now: number;
  let detector: DuplicateMessageDetector;

  beforeEach(() => {
    now = 1_000_000;
    detector = new DuplicateMessageDetector({ windowMs: 60_000, maxEntries: 3 }, () => now);
  });

  it('accepts a new message', () => {
    const result = detector.register(makeMessage());
    expect(result.duplicate).toBe(false);
    expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(detector.has('msg-1')).toBe(true);
  });

  it('detects a re-delivered message with the same ID', () => {
    detector.register(makeMessage());
    const result = detector.register(makeMessage());
    expect(result).toMatchObject({
      duplicate: true,
      reason: 'message-id',
      originalMessageId: 'msg-1',
      firstSeenAt: 1_000_000,
      occurrences: 2,
    });
  });

  it('detects the same source event under a new ID', () => {
    detector.register(makeMessage());
    const result = detector.register(makeMessage({ id: 'msg-rescan', sourceBlockNumber: 10000001 }));
    expect(result).toMatchObject({ duplicate: true, reason: 'fingerprint', originalMessageId: 'msg-1' });
    expect(detector.has('msg-rescan')).toBe(false);
  });

  it('flags a reused ID with different content as a conflict', () => {
    detector.register(makeMessage());
    const result = detector.register(makeMessage({ amount: '999999' }));
    expect(result).toMatchObject({ duplicate: true, reason: 'message-id-conflict', originalMessageId: 'msg-1' });
    expect(detector.getStats().conflicts).toBe(1);
  });

  it('accepts distinct events from the same transaction', () => {
    detector.register(makeMessage({ id: 'a', sourceLogIndex: 0 }));
    expect(detector.register(makeMessage({ id: 'b', sourceLogIndex: 1 })).duplicate).toBe(false);
  });

  it('check() does not record the message', () => {
    expect(detector.check(makeMessage()).duplicate).toBe(false);
    expect(detector.register(makeMessage()).duplicate).toBe(false);
    expect(detector.getStats().checked).toBe(1);
  });

  it('forgets messages after the window', () => {
    detector.register(makeMessage());
    now += 60_000;
    expect(detector.register(makeMessage({ id: 'msg-2' })).duplicate).toBe(false);
    expect(detector.has('msg-1')).toBe(false);
    expect(detector.getStats().evicted).toBe(1);
  });

  it('remembers messages inside the window', () => {
    detector.register(makeMessage());
    now += 59_999;
    expect(detector.register(makeMessage({ id: 'msg-2' })).duplicate).toBe(true);
  });

  it('evicts the oldest entries beyond maxEntries', () => {
    for (let i = 0; i < 4; i++) {
      detector.register(makeMessage({ id: `m-${i}`, sourceLogIndex: i }));
    }
    expect(detector.has('m-0')).toBe(false);
    expect(detector.has('m-3')).toBe(true);
    expect(detector.getStats()).toMatchObject({ tracked: 3, evicted: 1 });
  });

  it('release() allows a message to be accepted again', () => {
    detector.register(makeMessage());
    expect(detector.release('msg-1')).toBe(true);
    expect(detector.release('msg-1')).toBe(false);
    expect(detector.register(makeMessage()).duplicate).toBe(false);
  });

  it('tracks stats and resets on clear()', () => {
    detector.register(makeMessage());
    detector.register(makeMessage());
    detector.register(makeMessage({ id: 'msg-2' }));
    expect(detector.getStats()).toEqual({ tracked: 1, checked: 3, duplicates: 2, conflicts: 0, evicted: 0 });

    detector.clear();
    expect(detector.getStats()).toEqual({ tracked: 0, checked: 0, duplicates: 0, conflicts: 0, evicted: 0 });
    expect(detector.register(makeMessage()).duplicate).toBe(false);
  });

  it('rejects invalid configuration', () => {
    expect(() => new DuplicateMessageDetector({ windowMs: 0 })).toThrow('windowMs');
    expect(() => new DuplicateMessageDetector({ maxEntries: 0 })).toThrow('maxEntries');
  });
});
