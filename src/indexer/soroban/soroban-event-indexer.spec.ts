import {
  SorobanEventIndexer,
  SorobanIndexedEvent,
} from './soroban-event-indexer';

function event(
  overrides: Partial<SorobanIndexedEvent> = {},
): SorobanIndexedEvent {
  return {
    ledger: 1,
    txHash: 'tx1',
    eventIndex: 0,
    contractId: 'CA1',
    topics: ['transfer'],
    value: { amount: 1 },
    ...overrides,
  };
}

describe('SorobanEventIndexer', () => {
  let indexer: SorobanEventIndexer;

  beforeEach(() => {
    indexer = new SorobanEventIndexer();
  });

  it('indexes events and returns them in ledger order', () => {
    const stats = indexer.ingest([
      event({ ledger: 3, txHash: 'c', eventIndex: 0 }),
      event({ ledger: 1, txHash: 'a', eventIndex: 0 }),
      event({ ledger: 2, txHash: 'b', eventIndex: 0 }),
    ]);

    expect(stats).toEqual({ received: 3, indexed: 3, duplicates: 0 });
    expect(indexer.query().events.map((e) => e.ledger)).toEqual([1, 2, 3]);
  });

  it('discards duplicate events on re-read', () => {
    indexer.ingest([event()]);
    const stats = indexer.ingest([event()]);

    expect(stats.duplicates).toBe(1);
    expect(indexer.getStats().total).toBe(1);
  });

  it('filters by contract, topic and ledger range', () => {
    indexer.ingest([
      event({ ledger: 1, contractId: 'CA1', topics: ['transfer'] }),
      event({ ledger: 2, contractId: 'CA2', topics: ['mint'] }),
      event({ ledger: 3, contractId: 'CA1', topics: ['mint'] }),
    ]);

    expect(indexer.query({ contractId: 'CA1' }).total).toBe(2);
    expect(indexer.query({ topic: 'mint' }).total).toBe(2);
    expect(indexer.query({ fromLedger: 2, toLedger: 3 }).total).toBe(2);
    expect(indexer.query({ contractId: 'CA1', topic: 'mint' }).total).toBe(1);
  });

  it('paginates query results', () => {
    indexer.ingest([
      event({ ledger: 1, txHash: 't1' }),
      event({ ledger: 2, txHash: 't2' }),
      event({ ledger: 3, txHash: 't3' }),
    ]);

    const first = indexer.query({ limit: 2 });
    expect(first.events).toHaveLength(2);
    expect(first.total).toBe(3);
    expect(first.hasMore).toBe(true);

    const second = indexer.query({ limit: 2, offset: 2 });
    expect(second.events).toHaveLength(1);
    expect(second.hasMore).toBe(false);
  });

  it('rolls back a reorged ledger range', () => {
    indexer.ingest([
      event({ ledger: 1, txHash: 't1' }),
      event({ ledger: 2, txHash: 't2' }),
      event({ ledger: 3, txHash: 't3' }),
    ]);

    const removed = indexer.rollbackTo(3);

    expect(removed).toBe(1);
    expect(indexer.query().events.map((e) => e.ledger)).toEqual([1, 2]);
  });

  it('reports index statistics', () => {
    indexer.ingest([
      event({ ledger: 1, contractId: 'CA1' }),
      event({ ledger: 5, contractId: 'CA2', txHash: 't2' }),
    ]);

    expect(indexer.getStats()).toEqual({
      total: 2,
      contracts: 2,
      minLedger: 1,
      maxLedger: 5,
    });
  });

  it('clears the index', () => {
    indexer.ingest([event()]);
    indexer.clear();

    expect(indexer.getStats()).toEqual({
      total: 0,
      contracts: 0,
      minLedger: null,
      maxLedger: null,
    });
  });
});
