import { StellarLedgerReorgDetector } from '../../../../src/indexer/stellar/reorg/stellar-ledger-reorg-detector';

describe('StellarLedgerReorgDetector', () => {
  it('detects gaps, identifies affected records, and triggers recovery', async () => {
    const recover = jest.fn();
    const detector = new StellarLedgerReorgDetector({
      initialLedger: 10,
      records: () => [{ id: 'event-12', ledger: 12 }],
      recover,
    });
    const event = detector.track(12);
    expect(event?.reason).toBe('gap');
    expect(event?.affectedRecords.map((record) => record.id)).toEqual(['event-12']);
    expect(event?.recoveryLedger).toBe(10);
    expect(recover).toHaveBeenCalledWith(10, event);
  });

  it('accepts sequential ledgers and detects parent hash changes', () => {
    const detector = new StellarLedgerReorgDetector();
    expect(detector.track(1, 'a')).toBeUndefined();
    expect(detector.track(2, 'b', 'a')).toBeUndefined();
    expect(detector.track(3, 'c', 'unexpected')?.reason).toBe('parent-mismatch');
  });
});