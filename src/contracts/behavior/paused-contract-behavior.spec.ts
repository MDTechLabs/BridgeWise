import { PausableContractHarness } from './paused-contract-behavior';

const ADMIN = 'GADMIN';

function harness(): PausableContractHarness {
  let tick = 0;
  return new PausableContractHarness({ admin: ADMIN, clock: () => (tick += 1) });
}

describe('PausableContractHarness', () => {
  it('executes operations while active', () => {
    const contract = harness();
    const result = contract.execute('GUSER', 'deposit');

    expect(result.ok).toBe(true);
    expect(result.code).toBe('EXECUTED');
    expect(contract.getState().executions).toBe(1);
  });

  it('blocks state-changing operations while paused', () => {
    const contract = harness();
    contract.pause(ADMIN);

    expect(contract.execute('GUSER', 'deposit').code).toBe('REJECTED_PAUSED');
    expect(contract.execute('GUSER', 'withdraw').code).toBe('REJECTED_PAUSED');
    expect(contract.getState().rejections).toBe(2);
  });

  it('allows recovery operations while paused', () => {
    const contract = harness();
    contract.pause(ADMIN);

    expect(contract.execute('GUSER', 'recover').code).toBe('EXECUTED');
  });

  it('restores normal behavior after unpausing', () => {
    const contract = harness();
    contract.pause(ADMIN);
    contract.unpause(ADMIN);

    expect(contract.isPaused()).toBe(false);
    expect(contract.execute('GUSER', 'deposit').code).toBe('EXECUTED');
  });

  it('only lets the admin pause or unpause', () => {
    const contract = harness();

    expect(contract.pause('GUSER').code).toBe('UNAUTHORIZED');
    contract.pause(ADMIN);
    expect(contract.unpause('GUSER').code).toBe('UNAUTHORIZED');
    expect(contract.isPaused()).toBe(true);
  });

  it('is idempotent when pausing and unpausing repeatedly', () => {
    const contract = harness();

    expect(contract.pause(ADMIN).code).toBe('PAUSED');
    expect(contract.pause(ADMIN).code).toBe('NOOP');
    expect(contract.unpause(ADMIN).code).toBe('UNPAUSED');
    expect(contract.unpause(ADMIN).code).toBe('NOOP');
  });

  it('records a lifecycle log of every transition', () => {
    const contract = harness();
    contract.pause(ADMIN);
    contract.execute('GUSER', 'deposit');
    contract.execute('GUSER', 'recover');
    contract.unpause(ADMIN);

    expect(contract.getState().log.map((entry) => entry.event)).toEqual([
      'paused',
      'rejected',
      'executed',
      'unpaused',
    ]);
  });

  it('resets all state', () => {
    const contract = harness();
    contract.pause(ADMIN);
    contract.execute('GUSER', 'recover');
    contract.reset();

    expect(contract.getState()).toMatchObject({
      paused: false,
      executions: 0,
      rejections: 0,
      log: [],
    });
  });
});
