import {
  DEFAULT_SIMULATION_BUDGET,
  StellarSimulationResponse,
  StellarTransactionSimulationChecker,
} from './stellar-transaction-simulation-checker';

function response(
  overrides: Partial<StellarSimulationResponse> = {},
): StellarSimulationResponse {
  return {
    success: true,
    feeCharged: 100,
    resourceUsage: {
      cpuInstructions: 1_000,
      memoryBytes: 1_024,
      readBytes: 256,
      writeBytes: 128,
    },
    ...overrides,
  };
}

describe('StellarTransactionSimulationChecker', () => {
  it('accepts a simulation inside every budget', () => {
    const checker = new StellarTransactionSimulationChecker();
    const result = checker.check(response());

    expect(result.safeToSubmit).toBe(true);
    expect(result.checks.every((check) => check.status === 'passed')).toBe(true);
  });

  it('rejects a failed simulation without running budget checks', () => {
    const checker = new StellarTransactionSimulationChecker();
    const result = checker.check(
      response({ success: false, error: 'HostError' }),
    );

    expect(result.safeToSubmit).toBe(false);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].code).toBe('SIMULATION_FAILED');
  });

  it('rejects a simulated fee above the limit', () => {
    const checker = new StellarTransactionSimulationChecker({ maxFeeStroops: 500 });
    const result = checker.check(response({ feeCharged: 501 }));

    expect(result.safeToSubmit).toBe(false);
    expect(result.checks.map((c) => c.code)).toContain('FEE_EXCEEDS_LIMIT');
  });

  it('treats a resource exactly at the budget as within limit', () => {
    const checker = new StellarTransactionSimulationChecker({
      maxCpuInstructions: 1_000,
      maxMemoryBytes: 1_024,
      maxReadBytes: 256,
      maxWriteBytes: 128,
    });
    const result = checker.check(response());

    expect(result.safeToSubmit).toBe(true);
    expect(result.checks.map((c) => c.code)).not.toContain('CPU_EXCEEDS_LIMIT');
  });

  it('rejects excessive memory, read and write resource usage', () => {
    const checker = new StellarTransactionSimulationChecker({
      maxMemoryBytes: 100,
      maxReadBytes: 100,
      maxWriteBytes: 100,
    });
    const result = checker.check(
      response({
        resourceUsage: {
          cpuInstructions: 1,
          memoryBytes: 200,
          readBytes: 200,
          writeBytes: 200,
        },
      }),
    );

    const codes = result.checks.map((c) => c.code);
    expect(codes).toContain('MEMORY_EXCEEDS_LIMIT');
    expect(codes).toContain('READ_BYTES_EXCEEDS_LIMIT');
    expect(codes).toContain('WRITE_BYTES_EXCEEDS_LIMIT');
    expect(result.safeToSubmit).toBe(false);
  });

  it('rejects a footprint larger than allowed', () => {
    const checker = new StellarTransactionSimulationChecker({
      maxFootprintEntries: 5,
    });
    const result = checker.check(response({ footprintEntries: 6 }));

    expect(result.checks.map((c) => c.code)).toContain('FOOTPRINT_TOO_LARGE');
  });

  it('rejects a transaction whose required authorization is missing', () => {
    const checker = new StellarTransactionSimulationChecker();
    const result = checker.check(
      response({ authRequired: ['a', 'b'], authProvided: ['a'] }),
    );

    expect(result.safeToSubmit).toBe(false);
    const auth = result.checks.find((c) => c.code === 'AUTH_MISSING');
    expect(auth?.message).toContain('b');
  });

  it('warns but still submits when extra authorization entries are carried', () => {
    const checker = new StellarTransactionSimulationChecker();
    const result = checker.check(
      response({ authRequired: ['a'], authProvided: ['a', 'b'] }),
    );

    expect(result.safeToSubmit).toBe(true);
    expect(result.checks.map((c) => c.code)).toContain('AUTH_UNEXPECTED');
  });

  it('exposes the effective budget', () => {
    const checker = new StellarTransactionSimulationChecker({ maxFeeStroops: 42 });

    expect(checker.getBudget().maxFeeStroops).toBe(42);
    expect(checker.getBudget().maxCpuInstructions).toBe(
      DEFAULT_SIMULATION_BUDGET.maxCpuInstructions,
    );
  });
});
