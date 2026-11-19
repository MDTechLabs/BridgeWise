import { computeCorrelationId, MessageCorrelationIndex } from '../message-correlation';
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

describe('computeCorrelationId', () => {
  it('is stable across relayer ids, retries and hex casing', () => {
    const a = computeCorrelationId(makeMessage());
    const b = computeCorrelationId(
      makeMessage({ id: 'msg-2', retryCount: 3, sourceTxHash: '0x' + 'A'.repeat(64) }),
    );
    expect(a).toBe(b);
  });

  it('differs per source event and per destination chain', () => {
    const base = computeCorrelationId(makeMessage());
    expect(computeCorrelationId(makeMessage({ sourceTxHash: '0x' + 'b'.repeat(64) }))).not.toBe(base);
    expect(computeCorrelationId(makeMessage({ destinationChainId: 'polygon' }))).not.toBe(base);
  });
});

describe('MessageCorrelationIndex', () => {
  it('links a source message to its destination delivery idempotently', () => {
    const index = new MessageCorrelationIndex();
    const { correlationId } = index.linkSource(makeMessage());
    index.linkDestination(correlationId, '0xDEST');
    expect(index.linkDestination(correlationId, '0xdest').destinationTxHash).toBe('0xdest');
    expect(index.get(correlationId)?.sourceMessageId).toBe('msg-1');
  });

  it('rejects an unknown id and a second, different delivery', () => {
    const index = new MessageCorrelationIndex();
    expect(() => index.linkDestination('corr_missing', '0x1')).toThrow('Unknown correlation id');
    const { correlationId } = index.linkSource(makeMessage());
    index.linkDestination(correlationId, '0x1');
    expect(() => index.linkDestination(correlationId, '0x2')).toThrow('already delivered');
  });
});
