import {
  SorobanEventIndexerService,
  SorobanContractEvent,
  deriveEventId,
} from './soroban-event-indexer.service';
import { LedgerCursorManagerService } from '../../stellar/cursors/ledger-cursor-manager.service';

function ev(ledger: number, txHash: string, eventIndex = 0): SorobanContractEvent {
  return { ledger, txHash, contractId: 'C1', eventIndex, topics: ['transfer'], value: { amount: 1 } };
}

describe('SorobanEventIndexerService', () => {
  let cursor: LedgerCursorManagerService;
  let indexer: SorobanEventIndexerService;
  beforeEach(() => {
    cursor = new LedgerCursorManagerService();
    indexer = new SorobanEventIndexerService(cursor);
  });

  it('derives a deterministic event id', () => {
    expect(deriveEventId(ev(10, 'txA', 2))).toBe('10:txA:2');
  });

  it('indexes new events and advances the cursor', () => {
    const r = indexer.index([ev(10, 'txA'), ev(11, 'txB')]);
    expect(r.indexed).toBe(2);
    expect(r.skipped).toBe(0);
    expect(r.lastLedger).toBe(11);
    expect(cursor.getCursor('soroban-events')?.lastLedger).toBe(11);
  });

  it('prevents duplicate event records across retries', () => {
    indexer.index([ev(10, 'txA'), ev(11, 'txB')]);
    const retry = indexer.index([ev(10, 'txA'), ev(11, 'txB'), ev(12, 'txC')]);
    expect(retry.indexed).toBe(1); // only the new one
    expect(retry.skipped).toBe(2);
    expect(indexer.totalIndexed()).toBe(3);
  });

  it('supports incremental synchronization via nextLedger', () => {
    expect(indexer.nextLedger(5)).toBe(5);
    indexer.index([ev(20, 'txZ')]);
    expect(indexer.nextLedger()).toBe(21);
  });

  it('returns events from a given ledger', () => {
    indexer.index([ev(10, 'txA'), ev(20, 'txB'), ev(30, 'txC')]);
    expect(indexer.getEventsFromLedger(20).map((e) => e.ledger).sort()).toEqual([20, 30]);
  });
});
