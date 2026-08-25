import {
  TransferEventCorrelatorService,
  SorobanBridgeEvent,
} from './transfer-event-correlator.service';

function event(key: string, txHash: string, eventIndex = 0, type = 'transfer'): SorobanBridgeEvent {
  return { correlationKey: key, txHash, eventIndex, type };
}

describe('TransferEventCorrelatorService', () => {
  let svc: TransferEventCorrelatorService;
  beforeEach(() => {
    svc = new TransferEventCorrelatorService();
  });

  it('associates an event with a registered transfer', () => {
    svc.registerTransfer({ transferId: 't1', correlationKey: 'key-1' });
    const c = svc.correlate(event('key-1', 'txA'));
    expect(c?.transferId).toBe('t1');
    expect(svc.getEventsForTransfer('t1')).toHaveLength(1);
  });

  it('groups multiple events from one transaction under a single transfer', () => {
    svc.registerTransfer({ transferId: 't1', correlationKey: 'key-1' });
    svc.correlateBatch([
      event('key-1', 'txA', 0, 'lock'),
      event('key-1', 'txA', 1, 'mint'),
    ]);
    expect(svc.getEventsForTransfer('t1')).toHaveLength(2);
  });

  it('does not double-count the same on-chain event', () => {
    svc.registerTransfer({ transferId: 't1', correlationKey: 'key-1' });
    svc.correlate(event('key-1', 'txA', 0));
    svc.correlate(event('key-1', 'txA', 0));
    expect(svc.getEventsForTransfer('t1')).toHaveLength(1);
  });

  it('tracks events that match no transfer', () => {
    const c = svc.correlate(event('unknown', 'txB'));
    expect(c).toBeNull();
    expect(svc.getUnmatchedEvents()).toHaveLength(1);
  });

  it('reconciles previously-unmatched events after a late transfer registration', () => {
    svc.correlate(event('key-late', 'txC'));
    expect(svc.getUnmatchedEvents()).toHaveLength(1);
    svc.registerTransfer({ transferId: 't2', correlationKey: 'key-late' });
    const reconciled = svc.reconcileUnmatched();
    expect(reconciled).toHaveLength(1);
    expect(svc.getUnmatchedEvents()).toHaveLength(0);
    expect(svc.getEventsForTransfer('t2')).toHaveLength(1);
  });
});
