import { StellarTransactionConfirmationPoller } from '../../../../src/stellar/transactions/confirmation';

describe('StellarTransactionConfirmationPoller', () => {
  it('detects success and failure terminal states', async () => {
    const success = new StellarTransactionConfirmationPoller({
      getTransaction: jest.fn().mockResolvedValue({ status: 'SUCCESS' }),
    });
    await expect(
      success.waitForConfirmation('tx-success'),
    ).resolves.toMatchObject({ status: 'success' });

    const failure = new StellarTransactionConfirmationPoller({
      getTransaction: jest
        .fn()
        .mockResolvedValue({ status: 'FAILED', error: 'bad auth' }),
    });
    await expect(
      failure.waitForConfirmation('tx-failed'),
    ).resolves.toMatchObject({ status: 'failed' });
  });

  it('polls until timeout', async () => {
    const rpc = {
      getTransaction: jest.fn().mockResolvedValue({ status: 'PENDING' }),
    };
    const poller = new StellarTransactionConfirmationPoller(rpc, {
      timeoutMs: 0,
      sleep: async () => undefined,
    });
    await expect(
      poller.waitForConfirmation('tx-pending'),
    ).resolves.toMatchObject({ status: 'timeout' });
    expect(rpc.getTransaction).toHaveBeenCalledTimes(1);
  });
});
