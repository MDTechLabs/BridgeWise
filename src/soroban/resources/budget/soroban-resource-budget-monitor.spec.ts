import { SorobanResourceBudgetMonitor } from './soroban-resource-budget-monitor';

describe('SorobanResourceBudgetMonitor', () => {
  const contractId = 'CBUDGET';

  it('raises no alerts while usage stays below the warning threshold', () => {
    const monitor = new SorobanResourceBudgetMonitor();
    const alerts = monitor.record(
      { cpuInstructions: 1_000, feeStroops: 10 },
      { contractId },
    );

    expect(alerts).toHaveLength(0);
    expect(monitor.getSnapshot(contractId).perResource['cpu-instructions'].status)
      .toBe('ok');
  });

  it('raises a warning at the warning threshold', () => {
    const monitor = new SorobanResourceBudgetMonitor({
      cpuInstructions: 1_000,
      warningThreshold: 0.75,
    });
    const alerts = monitor.record({ cpuInstructions: 750 }, { contractId });

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      kind: 'cpu-instructions',
      status: 'warning',
      used: 750,
    });
  });

  it('raises a critical alert near the budget', () => {
    const monitor = new SorobanResourceBudgetMonitor({
      memoryBytes: 1_000,
      criticalThreshold: 0.9,
    });
    const alerts = monitor.record({ memoryBytes: 950 }, { contractId });

    expect(alerts[0].status).toBe('critical');
  });

  it('raises an exceeded alert once the budget is passed', () => {
    const monitor = new SorobanResourceBudgetMonitor({ writeBytes: 100 });
    const alerts = monitor.record({ writeBytes: 150 }, { contractId });

    expect(alerts[0]).toMatchObject({ status: 'exceeded', limit: 100 });
  });

  it('aggregates usage across records for the same contract', () => {
    const monitor = new SorobanResourceBudgetMonitor({ cpuInstructions: 1_000 });

    monitor.record({ cpuInstructions: 800 }, { contractId });
    const alerts = monitor.record({ cpuInstructions: 250 }, { contractId });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].used).toBe(1_050);
    expect(monitor.getSnapshot(contractId).usage.cpuInstructions).toBe(1_050);
  });

  it('tracks contracts independently', () => {
    const monitor = new SorobanResourceBudgetMonitor({ cpuInstructions: 1_000 });

    monitor.record({ cpuInstructions: 900 }, { contractId: 'A' });
    const alerts = monitor.record({ cpuInstructions: 10 }, { contractId: 'B' });

    expect(alerts).toHaveLength(0);
    expect(monitor.getSnapshot('A').usage.cpuInstructions).toBe(900);
  });

  it('counts the samples recorded per contract', () => {
    const monitor = new SorobanResourceBudgetMonitor();
    monitor.record({ cpuInstructions: 1 }, { contractId });
    monitor.record({ cpuInstructions: 1 }, { contractId });

    expect(monitor.getSnapshot(contractId).sampleCount).toBe(2);
  });

  it('resets a single contract or all contracts', () => {
    const monitor = new SorobanResourceBudgetMonitor();
    monitor.record({ cpuInstructions: 1 }, { contractId });
    monitor.record({ cpuInstructions: 1 }, { contractId: 'OTHER' });

    monitor.reset(contractId);
    expect(monitor.getSnapshot(contractId).usage.cpuInstructions).toBe(0);
    expect(monitor.getSnapshot('OTHER').usage.cpuInstructions).toBe(1);

    monitor.reset();
    expect(monitor.getSnapshot('OTHER').usage.cpuInstructions).toBe(0);
  });
});
