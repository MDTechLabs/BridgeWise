import { SorobanSimulator } from './soroban-simulator';
import {
  InsufficientFootprintError,
  SimulationRevertError,
  SlippageExceededError,
} from './types/soroban-sim.types';

describe('SorobanSimulator Unit & Integration Tests (#714)', () => {
  let simulator: SorobanSimulator;

  beforeEach(() => {
    simulator = new SorobanSimulator({
      rpcUrl: 'https://soroban-testnet.stellar.org',
    });
  });

  it('should parse valid execution parameters for successful simulation', () => {
    const rawResult = {
      minResourceFee: '1200',
      outputAmount: '99.5',
      sorobanData: {
        resources: {
          footprint: {
            readOnly: ['CONTRACT_STATE_1'],
            readWrite: ['USER_BALANCE_1'],
          },
        },
      },
      simulatedOutput: 'SIMULATION_XDR_DATA',
    };

    const res = simulator.parseAndValidateSimulation(rawResult, {
      expectedMinOutput: '99.0',
      expectedFootprintKeys: ['CONTRACT_STATE_1', 'USER_BALANCE_1'],
    });

    expect(res.successful).toBe(true);
    expect(res.minResourceFee).toBe('1200');
    expect(res.simulatedOutput).toBe('SIMULATION_XDR_DATA');
  });

  it('should throw SlippageExceededError when output amount is below expected minimum', () => {
    const rawResult = {
      minResourceFee: '1000',
      outputAmount: '95.0',
    };

    expect(() =>
      simulator.parseAndValidateSimulation(rawResult, {
        expectedMinOutput: '98.0',
      }),
    ).toThrow(SlippageExceededError);
  });

  it('should throw InsufficientFootprintError when missing required footprint authorization keys', () => {
    const rawResult = {
      minResourceFee: '1000',
      sorobanData: {
        resources: {
          footprint: {
            readOnly: ['KEY_A'],
            readWrite: [],
          },
        },
      },
    };

    expect(() =>
      simulator.parseAndValidateSimulation(rawResult, {
        expectedFootprintKeys: ['KEY_A', 'KEY_MISSING_B'],
      }),
    ).toThrow(InsufficientFootprintError);
  });

  it('should throw SimulationRevertError on contract execution revert', () => {
    const rawResult = {
      error: 'Error(Contract, #102)',
      code: 102,
    };

    expect(() => simulator.parseAndValidateSimulation(rawResult)).toThrow(SimulationRevertError);
  });

  it('should simulate transaction async call successfully', async () => {
    const res = await simulator.simulateTransaction('AAAAAQ==');
    expect(res.successful).toBe(true);
    expect(res.minResourceFee).toBe('500');
  });
});
