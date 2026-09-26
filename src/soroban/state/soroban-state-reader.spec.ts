import { SorobanStateReader } from './soroban-state-reader';

describe('SorobanStateReader', () => {
  it('reads and normalizes contract state values', async () => {
    const reader = new SorobanStateReader();
    const result = await reader.readState('CA123', 'total_supply', {
      network: 'testnet',
      readFn: async () => 42,
    });

    expect(result.found).toBe(true);
    expect(result.value).toBe(42);
  });

  it('returns a structured error on missing or failed reads', async () => {
    const reader = new SorobanStateReader();
    const result = await reader.readState('CA123', 'missing_key', {
      readFn: async () => null,
    });

    expect(result.found).toBe(false);
    expect(result.value).toBeNull();
  });
});
