import {
  EventDeduplicatorService,
  DedupableEvent,
  deriveDedupId,
} from './event-deduplicator.service';

const evt: DedupableEvent = { ledger: 10, txHash: 'txA', eventIndex: 1 };

describe('EventDeduplicatorService', () => {
  let dedup: EventDeduplicatorService;
  beforeEach(() => {
    dedup = new EventDeduplicatorService();
  });

  it('produces deterministic ids', () => {
    expect(deriveDedupId(evt)).toBe('10:txA:1');
    expect(deriveDedupId({ ...evt })).toBe(deriveDedupId(evt));
  });

  it('registers a new event as non-duplicate', () => {
    const r = dedup.register(evt, { source: 'rpc' });
    expect(r.isDuplicate).toBe(false);
    expect(r.record.metadata).toEqual({ source: 'rpc' });
  });

  it('flags a repeated event as duplicate and preserves original metadata', () => {
    dedup.register(evt, { source: 'first' });
    const again = dedup.register(evt, { source: 'second' });
    expect(again.isDuplicate).toBe(true);
    expect(again.record.metadata).toEqual({ source: 'first' });
  });

  it('runs the handler once across retries', async () => {
    const handler = jest.fn(async () => 'ok');
    const first = await dedup.process(evt, handler);
    const retry = await dedup.process(evt, handler);
    expect(first).toEqual({ processed: true, result: 'ok' });
    expect(retry.processed).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('distinguishes different events', () => {
    dedup.register(evt);
    expect(dedup.isProcessed({ ledger: 10, txHash: 'txA', eventIndex: 2 })).toBe(false);
    expect(dedup.size()).toBe(1);
  });
});
