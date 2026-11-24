import {
  PrivilegedOperationSimulationGate,
  SimulationGateError,
  SimulationOutcome,
  SimulationPort,
} from './privileged-operation-simulation-gate';

const POLICIES = {
  1: { requiredConfirmations: 2, maxAgeMs: 60_000, maxSimulationsPerOperation: 3 },
  137: { requiredConfirmations: 3, maxAgeMs: 30_000, maxSimulationsPerOperation: 2 },
};

const NOW = 1_700_000_000_000;

function operation(overrides: Partial<Parameters<PrivilegedOperationSimulationGate['run']>[0]> = {}) {
  return {
    id: 'op-1',
    chainId: 1,
    from: '0x1111111111111111111111111111111111111111',
    target: '0x2222222222222222222222222222222222222222',
    calldata: '0xa9059cbb0000',
    requiresSimulation: true,
    ...overrides,
  };
}

function outcome(overrides: Partial<SimulationOutcome> = {}): SimulationOutcome {
  return {
    ok: true,
    chainId: 1,
    from: '0x1111111111111111111111111111111111111111',
    target: '0x2222222222222222222222222222222222222222',
    calldata: '0xa9059cbb0000',
    blockNumber: 100,
    observedAtMs: NOW,
    gasUsed: 21_000,
    ...overrides,
  };
}

function simulator(value: SimulationOutcome | Error): SimulationPort {
  return {
    simulate: async () => {
      if (value instanceof Error) throw value;
      return value;
    },
  };
}

function gate(port: SimulationPort, decisions: any[] = []) {
  return new PrivilegedOperationSimulationGate(port, POLICIES, () => NOW, (d) => decisions.push(d));
}

describe('PrivilegedOperationSimulationGate', () => {
  it('executes a privileged operation only after a matching, fresh, confirmed simulation', async () => {
    const decisions: any[] = [];
    const subject = gate(simulator(outcome()), decisions);
    const execute = jest.fn().mockResolvedValue('done');

    await expect(subject.run(operation(), execute, 102)).resolves.toBe('done');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(decisions).toHaveLength(2);
    expect(decisions[0]).toMatchObject({ allowed: true, simulatedBlock: 100 });
  });

  it('fails closed when the simulator is unavailable or the simulation reverts', async () => {
    const unavailable = gate(simulator(new Error('rpc timeout')));
    await expect(unavailable.run(operation(), jest.fn(), 102)).rejects.toMatchObject({
      name: 'SimulationGateError',
      reason: 'SIMULATION_UNAVAILABLE',
    });

    const reverted = gate(simulator(outcome({ ok: false, error: 'execution reverted' })));
    await expect(reverted.run(operation(), jest.fn(), 102)).rejects.toMatchObject({
      reason: 'SIMULATION_REVERTED',
    });
  });

  it.each([
    ['chainId', { chainId: 137 }, 'SIMULATION_MISMATCH'],
    ['from', { from: '0x3333333333333333333333333333333333333333' }, 'SIMULATION_MISMATCH'],
    ['target', { target: '0x4444444444444444444444444444444444444444' }, 'SIMULATION_MISMATCH'],
    ['calldata', { calldata: '0xdeadbeef' }, 'SIMULATION_MISMATCH'],
    ['stale', { observedAtMs: NOW - 60_001 }, 'SIMULATION_STALE'],
    ['future', { observedAtMs: NOW + 1 }, 'SIMULATION_STALE'],
    ['unconfirmed', { blockNumber: 101 }, 'CONFIRMATIONS_NOT_MET'],
  ])('rejects %s simulations', async (_label, overrides, expected) => {
    const subject = gate(simulator(outcome(overrides)));
    const execute = jest.fn();
    await expect(subject.run(operation(), execute, 102)).rejects.toMatchObject({ reason: expected });
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects chains without explicit policy instead of inferring one from RPC data', async () => {
    const subject = new PrivilegedOperationSimulationGate(
      simulator(outcome()),
      POLICIES,
      () => NOW,
    );
    await expect(
      subject.run(operation({ chainId: 56 }), jest.fn(), 102),
    ).rejects.toMatchObject({ reason: 'CHAIN_POLICY_MISSING' });
  });

  it('rejects a missing current block and bounds simulation attempts per operation', async () => {
    const subject = gate(simulator(outcome()));
    await expect(subject.run(operation(), jest.fn(), undefined)).rejects.toMatchObject({
      reason: 'CONFIRMATIONS_NOT_MET',
    });

    const bounded = gate(simulator(outcome({ chainId: 137, blockNumber: 100 })));
    const op = operation({ chainId: 137 });
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(bounded.run(op, jest.fn().mockRejectedValue(new Error('execute failed')), 103))
        .rejects.toThrow('execute failed');
    }
    await expect(bounded.run(op, jest.fn(), 103)).rejects.toMatchObject({
      reason: 'SIMULATION_BUDGET_EXCEEDED',
    });
  });

  it('allows retry after execution failure but never replays a completed operation', async () => {
    const subject = gate(simulator(outcome()));
    const execute = jest.fn().mockRejectedValueOnce(new Error('network drop')).mockResolvedValue('ok');

    await expect(subject.run(operation(), execute, 102)).rejects.toThrow('network drop');
    await expect(subject.run(operation(), execute, 102)).resolves.toBe('ok');
    await expect(subject.run(operation(), execute, 102)).rejects.toMatchObject({
      reason: 'OPERATION_REPLAYED',
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('does not require simulation for non-privileged operations', async () => {
    const port = simulator(new Error('should not be called'));
    const subject = gate(port);
    const execute = jest.fn().mockResolvedValue(42);

    await expect(
      subject.run(operation({ requiresSimulation: false }), execute, undefined),
    ).resolves.toBe(42);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('exposes a typed error for callers that need to branch on the denial reason', async () => {
    const subject = gate(simulator(outcome()));
    const error = (await subject
      .run(operation({ chainId: 56 }), jest.fn(), 102)
      .catch((e) => e)) as SimulationGateError;
    expect(error).toBeInstanceOf(SimulationGateError);
    expect(error.reason).toBe('CHAIN_POLICY_MISSING');
  });
});
