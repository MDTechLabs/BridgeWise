import { SorobanSimulationAdapter } from '../../../src/soroban/simulation';

describe('SorobanSimulationAdapter', () => {
  it('normalizes successful results and resource estimates', async () => {
    const adapter = new SorobanSimulationAdapter({
      simulateTransaction: jest
        .fn()
        .mockResolvedValue({
          result: {
            status: 'SUCCESS',
            retval: 'ok',
            cost: { cpuInstructions: 12 },
          },
        }),
    });
    await expect(adapter.simulate('prepared')).resolves.toEqual({
      success: true,
      result: 'ok',
      resourceEstimates: { cpuInstructions: 12 },
    });
  });

  it('normalizes RPC failures', async () => {
    const adapter = new SorobanSimulationAdapter({
      simulateTransaction: jest
        .fn()
        .mockRejectedValue(new Error('RPC unavailable')),
    });
    await expect(adapter.simulate('prepared')).resolves.toMatchObject({
      success: false,
      error: 'RPC unavailable',
    });
  });
});
