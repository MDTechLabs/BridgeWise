import { StellarEvmSettlementStatusAdapter } from '../../../src/cross-chain/status';

describe('StellarEvmSettlementStatusAdapter', () => {
  const adapter = new StellarEvmSettlementStatusAdapter();

  it('normalizes stellar statuses', () => {
    expect(
      adapter.normalize({ provider: 'stellar', rawStatus: 'success' })
        .canonical,
    ).toBe('settled');
    expect(
      adapter.normalize({ provider: 'stellar', rawStatus: 'in_progress' })
        .canonical,
    ).toBe('pending');
    expect(
      adapter.normalize({ provider: 'stellar', rawStatus: 'failed' }).canonical,
    ).toBe('failed');
  });

  it('normalizes evm statuses', () => {
    expect(
      adapter.normalize({ provider: 'evm', rawStatus: 'confirmed' }).canonical,
    ).toBe('settled');
    expect(
      adapter.normalize({ provider: 'evm', rawStatus: 'pending' }).canonical,
    ).toBe('pending');
    expect(
      adapter.normalize({ provider: 'evm', rawStatus: 'reverted' }).canonical,
    ).toBe('failed');
  });

  it('handles unknown statuses safely', () => {
    const result = adapter.normalize({
      provider: 'evm',
      rawStatus: 'weird_state',
    });
    expect(result.canonical).toBe('unknown');
    expect(result.rawStatus).toBe('weird_state');
  });

  it('preserves the original provider raw status', () => {
    const result = adapter.normalize({
      provider: 'stellar',
      rawStatus: 'Pending',
    });
    expect(result.canonical).toBe('pending');
    expect(result.rawStatus).toBe('Pending');
  });
});
