import { StellarBridgeE2EVerifier } from '../../../src/verification/e2e/stellar';

describe('StellarBridgeE2EVerifier', () => {
  it('returns a consolidated successful result', async () => {
    const verifier = new StellarBridgeE2EVerifier(async () => ({
      routeSnapshotValid: true, submitted: true, sorobanSucceeded: true,
      contractEventsValid: true, settlementComplete: true, asset: 'USDC', amount: '10',
    }));
    const result = await verifier.verify({ transferId: 't1', expectedAsset: 'USDC', expectedAmount: '10' });
    expect(result.valid).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('exposes actionable failed checks', async () => {
    const verifier = new StellarBridgeE2EVerifier(async () => null);
    const result = await verifier.verify({ transferId: 't1', expectedAsset: 'USDC', expectedAmount: '10' });
    expect(result.valid).toBe(false);
    expect(result.failures).toContain('settlement verification failed.');
  });
});