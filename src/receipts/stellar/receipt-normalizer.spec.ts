import { SorobanReceiptNormalizer } from './receipt-normalizer';

describe('SorobanReceiptNormalizer', () => {
  let normalizer: SorobanReceiptNormalizer;

  beforeEach(() => {
    normalizer = new SorobanReceiptNormalizer();
  });

  describe('normalizeHorizonTransaction', () => {
    it('should normalize Horizon transaction with payment operations correctly', () => {
      const mockTx = {
        hash: 'tx-hash-123',
        ledger: '1000',
        successful: true,
        fee_charged: '100',
        source_account: 'GDABC',
      };

      const mockOps = [
        {
          type: 'payment',
          from: 'GDABC',
          to: 'GDDEF',
          amount: '50.5',
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
        },
      ];

      const result = normalizer.normalizeHorizonTransaction(mockTx, mockOps);

      expect(result.transactionHash).toBe('tx-hash-123');
      expect(result.ledger).toBe(1000);
      expect(result.success).toBe(true);
      expect(result.feePaid).toBe('100');
      expect(result.sourceAccount).toBe('GDABC');
      expect(result.transfers).toHaveLength(1);
      expect(result.transfers[0]).toEqual({
        from: 'GDABC',
        to: 'GDDEF',
        amount: '50.5',
        asset: 'USDC',
      });
    });
  });

  describe('normalizeSorobanTransaction', () => {
    it('should normalize Soroban transaction using fallback JSON events', () => {
      const mockTxResult = {
        txHash: 'soroban-tx-hash',
        ledgerSequence: '2500',
        status: 'SUCCESS',
        fee: '250',
        sourceAccount: 'GDSOROBAN',
        events: [
          {
            contractId: 'CUSDC123',
            topics: ['transfer', 'GDSENDER', 'GDRECEIVER'],
            data: '1000',
          },
        ],
      };

      const result = normalizer.normalizeSorobanTransaction(mockTxResult);

      expect(result.transactionHash).toBe('soroban-tx-hash');
      expect(result.ledger).toBe(2500);
      expect(result.success).toBe(true);
      expect(result.feePaid).toBe('250');
      expect(result.sourceAccount).toBe('GDSOROBAN');
      expect(result.events).toHaveLength(1);
      expect(result.transfers).toHaveLength(1);
      expect(result.transfers[0]).toEqual({
        from: 'GDSENDER',
        to: 'GDRECEIVER',
        amount: '1000',
        asset: 'CUSDC123',
      });
    });
  });
});
