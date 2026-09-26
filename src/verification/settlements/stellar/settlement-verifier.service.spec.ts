import { SorobanSettlementVerifier } from './settlement-verifier.service';
import {
  SettlementMatchStatus,
  SettlementStatus,
} from './settlement-verifier.types';

describe('SorobanSettlementVerifier', () => {
  const request = {
    settlementId: 'settlement-1',
    sourceTransaction: 'source-hash',
    destinationTransaction: 'destination-hash',
    expectedAmount: '100',
    expectedAsset: 'USDC',
    fromAddress: 'source',
    toAddress: 'destination',
  };
  let verifier: SorobanSettlementVerifier;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    Object.defineProperty(AbortSignal, 'timeout', {
      configurable: true,
      value: () => new AbortController().signal,
    });
    verifier = new SorobanSettlementVerifier(
      { maxRetries: 0, timeoutMs: 100 },
      fetchMock as unknown as typeof fetch,
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    delete (AbortSignal as typeof AbortSignal & { timeout?: unknown }).timeout;
  });

  it('reconciles confirmed source and destination transfers successfully', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ledger: 10 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ledger: 12 }),
      } as Response);

    const result = await verifier.verifySettlement(request);
    expect(result.isValid).toBe(true);
    expect(result.matchStatus).toBe(SettlementMatchStatus.COMPLETE);
    expect(result.status).toBe(SettlementStatus.COMPLETED);
    expect(result.sourceConfirmed).toBe(true);
    expect(result.destinationConfirmed).toBe(true);
  });

  it('reports a confirmed source with a missing destination as partial and monitorable', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ledger: 10 }),
      } as Response)
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response);

    const result = await verifier.verifySettlement(request);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.matchStatus).toBe(SettlementMatchStatus.PARTIAL);
    expect(result.inconsistencies.map((item) => item.type)).toContain(
      'missing_destination',
    );
    expect(result.recommendedAction).toContain('Monitor');
  });

  it('keeps an unconfirmed source with a missing destination pending', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response);

    const result = await verifier.verifySettlement(request);

    expect(result.matchStatus).toBe(SettlementMatchStatus.PENDING);
    expect(result.recommendedAction).toContain('Waiting');
  });

  it('retries a temporary RPC failure before reconciling the source transaction', async () => {
    verifier = new SorobanSettlementVerifier(
      { maxRetries: 1, retryDelayMs: 0 },
      fetchMock as unknown as typeof fetch,
    );
    fetchMock
      .mockRejectedValueOnce(new Error('temporary RPC failure'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ledger: 10 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ledger: 12 }),
      } as Response);

    const result = await verifier.verifySettlement(request);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.matchStatus).toBe(SettlementMatchStatus.COMPLETE);
    expect(result.isValid).toBe(true);
  });

  it('marks an amount mismatch as requiring manual review', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ledger: 10, operations: [{ amount: '99' }] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ledger: 12 }),
      } as Response);

    const result = await verifier.verifySettlement(request);

    expect(result.isValid).toBe(false);
    expect(result.matchStatus).toBe(SettlementMatchStatus.MISMATCH);
    expect(result.status).toBe(SettlementStatus.MISMATCHED);
    expect(result.recommendedAction).toContain('Manual review');
  });
});
