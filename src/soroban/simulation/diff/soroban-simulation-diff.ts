import {
  ComparableSimulationSnapshot,
  DEFAULT_MATERIAL_THRESHOLDS,
  MaterialDifferenceThresholds,
  NumericChange,
  SimulationDiffResult,
  SimulationEvent,
} from './types';

function toNumber(value: string | number | undefined): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function eventKey(event: SimulationEvent): string {
  return JSON.stringify({
    type: event.type,
    topics: event.topics ?? [],
    data: event.data ?? null,
  });
}

function stableSerialize(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Compares two Soroban simulation snapshots and reports resource, output,
 * and event differences, including which changes are material.
 */
export class SorobanSimulationDiffService {
  constructor(
    private readonly thresholds: MaterialDifferenceThresholds = DEFAULT_MATERIAL_THRESHOLDS,
  ) {}

  diff(
    before: ComparableSimulationSnapshot,
    after: ComparableSimulationSnapshot,
  ): SimulationDiffResult {
    const limits = { ...DEFAULT_MATERIAL_THRESHOLDS, ...this.thresholds };
    const resourceChanges = this.diffResources(before, after, limits);
    const outputBefore = before.expectedOutput ?? (before as { result?: unknown }).result;
    const outputAfter = after.expectedOutput ?? (after as { result?: unknown }).result;
    const outputChanged = stableSerialize(outputBefore) !== stableSerialize(outputAfter);
    const eventChanges = this.diffEvents(before.events ?? [], after.events ?? []);

    const hasMaterialDifferences =
      resourceChanges.some((change) => change.material) || outputChanged || eventChanges.added.length > 0 || eventChanges.removed.length > 0;

    const summary: string[] = [];
    for (const change of resourceChanges.filter((c) => c.material)) {
      summary.push(
        `${change.field} changed from ${change.before ?? 'n/a'} to ${change.after ?? 'n/a'} (delta ${change.delta ?? 'n/a'}).`,
      );
    }
    if (outputChanged) {
      summary.push('Expected simulation output changed.');
    }
    if (eventChanges.added.length > 0 || eventChanges.removed.length > 0) {
      summary.push(
        `Simulation events changed (${eventChanges.added.length} added, ${eventChanges.removed.length} removed).`,
      );
    }

    return {
      hasChanges: resourceChanges.length > 0 || outputChanged || eventChanges.added.length > 0 || eventChanges.removed.length > 0,
      hasMaterialDifferences,
      resourceChanges,
      outputChanged,
      outputBefore,
      outputAfter,
      eventChanges,
      summary,
    };
  }

  private diffResources(
    before: ComparableSimulationSnapshot,
    after: ComparableSimulationSnapshot,
    limits: Required<MaterialDifferenceThresholds>,
  ): NumericChange[] {
    const fields: Array<{
      field: keyof Required<MaterialDifferenceThresholds>;
      before: string | number | undefined;
      after: string | number | undefined;
    }> = [
      {
        field: 'cpuInstructions',
        before: before.resourceEstimates.cpuInstructions,
        after: after.resourceEstimates.cpuInstructions,
      },
      {
        field: 'memoryBytes',
        before: before.resourceEstimates.memoryBytes,
        after: after.resourceEstimates.memoryBytes,
      },
      {
        field: 'ledgerReadBytes',
        before: before.resourceEstimates.ledgerReadBytes,
        after: after.resourceEstimates.ledgerReadBytes,
      },
      {
        field: 'ledgerWriteBytes',
        before: before.resourceEstimates.ledgerWriteBytes,
        after: after.resourceEstimates.ledgerWriteBytes,
      },
      {
        field: 'fee',
        before: before.resourceEstimates.fee,
        after: after.resourceEstimates.fee,
      },
    ];

    const changes: NumericChange[] = [];
    for (const item of fields) {
      const beforeValue = toNumber(item.before);
      const afterValue = toNumber(item.after);
      if (beforeValue === afterValue) {
        continue;
      }
      const delta =
        beforeValue === null || afterValue === null ? null : afterValue - beforeValue;
      const material =
        delta === null ? true : Math.abs(delta) >= limits[item.field];
      changes.push({
        field: item.field,
        before: beforeValue,
        after: afterValue,
        delta,
        material,
      });
    }
    return changes;
  }

  private diffEvents(before: SimulationEvent[], after: SimulationEvent[]) {
    const beforeKeys = new Map(before.map((event) => [eventKey(event), event]));
    const afterKeys = new Map(after.map((event) => [eventKey(event), event]));
    const added: SimulationEvent[] = [];
    const removed: SimulationEvent[] = [];
    let unchangedCount = 0;

    for (const [key, event] of afterKeys) {
      if (beforeKeys.has(key)) {
        unchangedCount += 1;
      } else {
        added.push(event);
      }
    }
    for (const [key, event] of beforeKeys) {
      if (!afterKeys.has(key)) {
        removed.push(event);
      }
    }

    return { added, removed, unchangedCount };
  }
}
