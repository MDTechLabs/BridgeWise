import {
  ContractInterface,
  SorobanUpgradeCompatibilityChecker,
} from './soroban-upgrade-compatibility';

const baseline: ContractInterface = {
  functions: [
    { name: 'deposit', params: [{ name: 'amount', type: 'i128' }], returns: 'void' },
    { name: 'balance', params: [{ name: 'owner', type: 'address' }], returns: 'i128' },
  ],
  events: [{ name: 'deposit', fields: ['amount', 'recipient'] }],
  storage: [{ key: 'Balance', type: 'map<address,i128>' }],
};

function compare(current: Partial<ContractInterface>) {
  return new SorobanUpgradeCompatibilityChecker().compare(baseline, {
    ...baseline,
    ...current,
  });
}

describe('SorobanUpgradeCompatibilityChecker', () => {
  it('reports full compatibility for an identical interface', () => {
    const report = compare({});

    expect(report.level).toBe('full');
    expect(report.changes).toHaveLength(0);
  });

  it('classifies an added function as backward compatible', () => {
    const report = compare({
      functions: [
        ...baseline.functions,
        { name: 'withdraw', params: [], returns: 'void' },
      ],
    });

    expect(report.level).toBe('backward');
    expect(report.additiveChanges.map((c) => c.kind)).toContain('FUNCTION_ADDED');
  });

  it('classifies a removed function as breaking', () => {
    const report = compare({ functions: [baseline.functions[1]] });

    expect(report.level).toBe('breaking');
    expect(report.breakingChanges.map((c) => c.kind)).toContain(
      'FUNCTION_REMOVED',
    );
  });

  it('classifies a changed return type as breaking', () => {
    const report = compare({
      functions: [
        { name: 'deposit', params: [{ name: 'amount', type: 'i128' }], returns: 'bool' },
        baseline.functions[1],
      ],
    });

    expect(report.level).toBe('breaking');
    expect(report.breakingChanges.map((c) => c.kind)).toContain(
      'FUNCTION_RETURN_CHANGED',
    );
  });

  it('classifies changed parameters as breaking', () => {
    const report = compare({
      functions: [
        { name: 'deposit', params: [{ name: 'amount', type: 'u64' }], returns: 'void' },
        baseline.functions[1],
      ],
    });

    expect(report.breakingChanges.map((c) => c.kind)).toContain(
      'FUNCTION_PARAMS_CHANGED',
    );
  });

  it('classifies an added event field as backward compatible', () => {
    const report = compare({
      events: [{ name: 'deposit', fields: ['amount', 'recipient', 'ledger'] }],
    });

    expect(report.level).toBe('backward');
    expect(report.additiveChanges.map((c) => c.kind)).toContain(
      'EVENT_FIELD_ADDED',
    );
  });

  it('classifies a removed event or field as breaking', () => {
    const removedField = compare({
      events: [{ name: 'deposit', fields: ['amount'] }],
    });
    expect(removedField.breakingChanges.map((c) => c.kind)).toContain(
      'EVENT_FIELD_REMOVED',
    );

    const removedEvent = compare({ events: [] });
    expect(removedEvent.breakingChanges.map((c) => c.kind)).toContain(
      'EVENT_REMOVED',
    );
  });

  it('classifies a storage type change as breaking', () => {
    const report = compare({
      storage: [{ key: 'Balance', type: 'u64' }],
    });

    expect(report.breakingChanges.map((c) => c.kind)).toContain(
      'STORAGE_TYPE_CHANGED',
    );
  });

  it('classifies an added storage key as additive and a removed one as breaking', () => {
    const added = compare({
      storage: [
        ...(baseline.storage ?? []),
        { key: 'TotalSupply', type: 'i128' },
      ],
    });
    expect(added.additiveChanges.map((c) => c.kind)).toContain('STORAGE_KEY_ADDED');

    const removed = compare({ storage: [] });
    expect(removed.breakingChanges.map((c) => c.kind)).toContain(
      'STORAGE_KEY_REMOVED',
    );
  });

  it('reports breaking when additive and breaking changes are mixed', () => {
    const report = compare({
      functions: [...baseline.functions, { name: 'newFn', params: [], returns: 'void' }],
      events: [],
    });

    expect(report.level).toBe('breaking');
    expect(report.breakingChanges.length).toBeGreaterThan(0);
    expect(report.additiveChanges.length).toBeGreaterThan(0);
  });
});
