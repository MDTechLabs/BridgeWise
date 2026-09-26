import type { BridgeWiseTransferEvent } from '../../../src/events/types/soroban-contract-event.types';
import { SorobanSettlementEventMatcher } from '../../../src/settlement/matching/soroban';

function makeEvent(
  overrides: Partial<BridgeWiseTransferEvent> = {},
): BridgeWiseTransferEvent {
  return {
    eventId: 'evt-1',
    eventType: 'transfer',
    rawEventName: 'transfer',
    from: 'sender',
    to: 'recipient',
    amount: '100',
    asset: 'USDC',
    transactionHash: 'tx-1',
    contractId: 'contract-a',
    ledger: 1,
    timestamp: 1000,
    eventIndex: 0,
    payload: {},
    ...overrides,
  };
}

describe('SorobanSettlementEventMatcher', () => {
  it('matches a valid event to a transfer', () => {
    const matcher = new SorobanSettlementEventMatcher();
    matcher.register({
      transferId: 't1',
      contractId: 'contract-a',
      asset: 'USDC',
      amount: '100',
    });

    const result = matcher.match(makeEvent());
    expect(result).toEqual({ matched: true, transferId: 't1' });
  });

  it('rejects an event that does not match any transfer', () => {
    const matcher = new SorobanSettlementEventMatcher();
    matcher.register({
      transferId: 't1',
      contractId: 'other',
      asset: 'USDC',
      amount: '100',
    });

    const result = matcher.match(makeEvent());
    expect(result.matched).toBe(false);
  });

  it('flags ambiguous matches when multiple transfers qualify', () => {
    const matcher = new SorobanSettlementEventMatcher();
    matcher.register({
      transferId: 't1',
      contractId: 'contract-a',
      asset: 'USDC',
      amount: '100',
    });
    matcher.register({
      transferId: 't2',
      contractId: 'contract-a',
      asset: 'USDC',
      amount: '100',
    });

    const result = matcher.match(makeEvent());
    expect(result.matched).toBe(false);
    if (!result.matched) {
      expect(result.reason).toBe('ambiguous');
      expect(result.candidates).toEqual(['t1', 't2']);
    }
  });
});
