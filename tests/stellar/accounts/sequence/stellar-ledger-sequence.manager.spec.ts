import { StellarLedgerSequenceManager } from '../../../../src/stellar/accounts/sequence';

describe('StellarLedgerSequenceManager', () => {
  it('retrieves, reserves, and refreshes sequences', async () => {
    const client = {
      getAccountSequence: jest
        .fn()
        .mockResolvedValueOnce('40')
        .mockResolvedValueOnce('50'),
    };
    const manager = new StellarLedgerSequenceManager(client, 30_000);

    await expect(manager.getCurrent('GABC')).resolves.toBe(40n);
    await expect(manager.reserve('GABC')).resolves.toBe(41n);
    expect(manager.getState('GABC')?.pending).toBe(1);
    await expect(manager.refresh('GABC')).resolves.toBe(50n);
    expect(client.getAccountSequence).toHaveBeenCalledTimes(2);
  });
});
