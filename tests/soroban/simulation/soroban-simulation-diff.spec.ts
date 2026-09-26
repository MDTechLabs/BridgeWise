import { SorobanSimulationDiffService } from '../../../src/soroban/simulation/diff';
import type { ComparableSimulationSnapshot } from '../../../src/soroban/simulation/diff';

function snapshot(
  overrides: Partial<ComparableSimulationSnapshot> = {},
): ComparableSimulationSnapshot {
  return {
    resourceEstimates: {
      cpuInstructions: 1000,
      memoryBytes: 200,
      ledgerReadBytes: 50,
      ledgerWriteBytes: 10,
      fee: '100',
    },
    expectedOutput: { amount: '98' },
    events: [{ type: 'transfer', topics: ['bridge'], data: { ok: true } }],
    success: true,
    ...overrides,
  };
}

describe('SorobanSimulationDiffService (#996)', () => {
  const service = new SorobanSimulationDiffService();

  it('detects resource estimate changes', () => {
    const result = service.diff(
      snapshot(),
      snapshot({
        resourceEstimates: {
          cpuInstructions: 1500,
          memoryBytes: 200,
          ledgerReadBytes: 50,
          ledgerWriteBytes: 10,
          fee: '100',
        },
      }),
    );
    expect(result.resourceChanges.some((c) => c.field === 'cpuInstructions' && c.material)).toBe(
      true,
    );
    expect(result.hasMaterialDifferences).toBe(true);
  });

  it('detects expected output changes', () => {
    const result = service.diff(snapshot(), snapshot({ expectedOutput: { amount: '90' } }));
    expect(result.outputChanged).toBe(true);
    expect(result.summary).toContain('Expected simulation output changed.');
  });

  it('reports material event differences', () => {
    const result = service.diff(
      snapshot(),
      snapshot({
        events: [{ type: 'refund', topics: ['bridge'], data: { ok: false } }],
      }),
    );
    expect(result.eventChanges.added).toHaveLength(1);
    expect(result.eventChanges.removed).toHaveLength(1);
    expect(result.hasMaterialDifferences).toBe(true);
  });

  it('returns no material differences for identical snapshots', () => {
    const result = service.diff(snapshot(), snapshot());
    expect(result.hasChanges).toBe(false);
    expect(result.hasMaterialDifferences).toBe(false);
    expect(result.summary).toEqual([]);
  });
});
