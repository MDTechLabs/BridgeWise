import { TransferEventCorrelatorService } from '../correlation/soroban/transfer-event-correlator.service';
import { getFinalityPolicy, MessageExecutionService, PreconditionError } from './message-execution.service';

describe('MessageExecutionService', () => {
  let correlator: TransferEventCorrelatorService;
  let svc: MessageExecutionService;
  const msg = { messageId: 'm1', sourceChain: 'stellar', sourceBlock: 10, sourceHead: 11 };

  beforeEach(() => {
    correlator = new TransferEventCorrelatorService();
    svc = new MessageExecutionService(correlator);
  });

  const codeOf = (fn: () => void) => {
    try { fn(); } catch (e) { return (e as PreconditionError).code; }
    return undefined;
  };

  it('falls back to the default finality policy', () => {
    expect(getFinalityPolicy('unknown-chain').confirmations).toBe(12);
    expect(getFinalityPolicy('Ethereum').requireFinalizedBlock).toBe(true);
  });

  it('enforces preconditions in order', () => {
    expect(codeOf(() => svc.assertCanExecute(msg))).toBe('PROOF_NOT_VERIFIED');
    svc.recordProofOutcome('m1', 'verified');
    expect(codeOf(() => svc.assertCanExecute({ ...msg, sourceHead: 10 }))).toBe('NOT_FINAL');
    expect(codeOf(() => svc.assertCanExecute({ ...msg, expiresAt: 5 }, 10))).toBe('MESSAGE_EXPIRED');
    expect(codeOf(() => svc.assertCanExecute(msg))).toBeUndefined();
    svc.markExecuted('m1');
    expect(codeOf(() => svc.assertCanExecute(msg))).toBe('ALREADY_EXECUTED');
  });

  it('recovers late-registered events idempotently', () => {
    correlator.correlate({ txHash: 'a', eventIndex: 0, correlationKey: 'k', type: 't' });
    correlator.registerTransfer({ transferId: 't1', correlationKey: 'k' });
    expect(svc.recoverPartiallyIndexed()).toEqual({ recovered: 1, stillUnmatched: 0 });
    expect(svc.recoverPartiallyIndexed()).toEqual({ recovered: 0, stillUnmatched: 0 });
    expect(correlator.getEventsForTransfer('t1')).toHaveLength(1);
  });
});
