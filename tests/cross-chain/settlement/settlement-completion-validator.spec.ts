import { SettlementCompletionValidator } from '../../../src/cross-chain/settlement/validation';

describe('SettlementCompletionValidator', () => {
  it('validates both transactions, asset, and amount', async () => {
    const validator = new SettlementCompletionValidator(async (tx) => ({
      confirmed: true, asset: tx === 'destination' ? 'USDC' : undefined, amount: tx === 'destination' ? '10' : undefined,
    }));
    await expect(validator.validate({
      settlementId: 's1', sourceTransaction: 'source', destinationTransaction: 'destination',
      expectedAsset: 'USDC', expectedAmount: '10',
    })).resolves.toMatchObject({ complete: true, assetValid: true, amountValid: true });
  });

  it('keeps incomplete settlements unresolved', async () => {
    const validator = new SettlementCompletionValidator(async (tx) => tx === 'source' ? { confirmed: true } : null);
    const result = await validator.validate({
      settlementId: 's1', sourceTransaction: 'source', destinationTransaction: 'destination',
      expectedAsset: 'USDC', expectedAmount: '10',
    });
    expect(result.complete).toBe(false);
    expect(result.reasons).toContain('Destination transaction was not found.');
  });
});