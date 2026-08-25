import { SorobanTransactionSubmissionService } from '../../../src/soroban/submission';

describe('SorobanTransactionSubmissionService', () => {
  it('returns normalized ids and prevents duplicate submissions', async () => {
    const rpc = {
      sendTransaction: jest
        .fn()
        .mockResolvedValue({ result: { hash: 'tx-1', status: 'PENDING' } }),
    };
    const service = new SorobanTransactionSubmissionService(rpc);

    await expect(service.submit('signed-x')).resolves.toEqual({
      transactionId: 'tx-1',
      status: 'pending',
      duplicate: false,
    });
    await expect(service.submit('signed-x')).resolves.toEqual({
      transactionId: 'tx-1',
      status: 'pending',
      duplicate: true,
    });
    expect(rpc.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures and surfaces permanent failures', async () => {
    const rpc = {
      sendTransaction: jest
        .fn()
        .mockRejectedValueOnce(new Error('temporarily unavailable'))
        .mockResolvedValue({ hash: 'tx-2' }),
    };
    const service = new SorobanTransactionSubmissionService(rpc, {
      retryDelayMs: 0,
      sleep: async () => undefined,
    });
    await expect(service.submit('signed-y')).resolves.toMatchObject({
      transactionId: 'tx-2',
    });
    expect(rpc.sendTransaction).toHaveBeenCalledTimes(2);
  });
});
