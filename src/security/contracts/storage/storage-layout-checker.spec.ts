import {
  ContractStorageLayoutChecker,
  StorageLayoutEntry,
} from './storage-layout-checker';

const validLayout: StorageLayoutEntry[] = [
  { key: 'Balance', type: 'i128' },
  { key: 'Config', type: 'config' },
  { key: 'TotalSupply', type: 'i128' },
];

describe('ContractStorageLayoutChecker', () => {
  const checker = new ContractStorageLayoutChecker();

  it('accepts a valid, sorted layout', () => {
    const report = checker.check(validLayout);

    expect(report.valid).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it('rejects a duplicated key', () => {
    const report = checker.check([
      { key: 'Balance', type: 'i128' },
      { key: 'Balance', type: 'i128' },
    ]);

    expect(report.valid).toBe(false);
    expect(report.issues.map((i) => i.code)).toContain('DUPLICATE_KEY');
  });

  it('rejects an empty key', () => {
    const report = checker.check([{ key: '  ', type: 'i128' }]);

    expect(report.issues.map((i) => i.code)).toContain('EMPTY_KEY');
  });

  it('detects a prefix collision between keys', () => {
    const report = checker.check([
      { key: 'balance', type: 'i128' },
      { key: 'balance_lock', type: 'i128' },
    ]);

    expect(report.valid).toBe(false);
    expect(report.issues.map((i) => i.code)).toContain('PREFIX_COLLISION');
  });

  it('requires a TTL for persistent entries', () => {
    const report = checker.check([
      { key: 'Balance', type: 'i128', persistent: true },
    ]);

    expect(report.issues.map((i) => i.code)).toContain('MISSING_TTL');

    const withTtl = checker.check([
      { key: 'Balance', type: 'i128', persistent: true, ttlLedgers: 100 },
    ]);
    expect(withTtl.issues.map((i) => i.code)).not.toContain('MISSING_TTL');
  });

  it('enforces the entry budget', () => {
    const tiny = new ContractStorageLayoutChecker({ maxEntries: 1 });
    const report = tiny.check(validLayout);

    expect(report.issues.map((i) => i.code)).toContain('ENTRY_BUDGET_EXCEEDED');
  });

  it('warns when enumeration keys are not sorted', () => {
    const report = checker.check([
      { key: 'Zeta', type: 'i128' },
      { key: 'Alpha', type: 'i128' },
    ]);

    const issue = report.issues.find((i) => i.code === 'UNSORTED_ENUMERATION');
    expect(issue?.severity).toBe('warning');
    expect(report.valid).toBe(true);
  });

  it('reports a type change against the previous layout', () => {
    const report = checker.check(
      [{ key: 'Balance', type: 'u64' }],
      [{ key: 'Balance', type: 'i128' }],
    );

    expect(report.valid).toBe(false);
    expect(report.issues.map((i) => i.code)).toContain('TYPE_CHANGED');
  });
});
