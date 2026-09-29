/**
 * Soroban upgrade compatibility.
 *
 * A contract upgrade is only safe if the callers, indexers and settlement
 * matchers built against the previous deployment keep working. This checker
 * compares the previous and current interface — functions, events and storage
 * layout — and classifies every change as additive, breaking, or neutral, so
 * an upgrade can be judged before it is signed.
 */

export interface ContractParameter {
  name: string;
  type: string;
}

export interface ContractFunctionSignature {
  name: string;
  params: ContractParameter[];
  returns: string;
}

export interface ContractEventSignature {
  name: string;
  fields: string[];
}

export interface ContractStorageEntry {
  key: string;
  type: string;
  persistent?: boolean;
}

export interface ContractInterface {
  functions: ContractFunctionSignature[];
  events: ContractEventSignature[];
  storage?: ContractStorageEntry[];
}

export type CompatibilityLevel = 'full' | 'backward' | 'breaking';

export type CompatibilityChangeKind =
  | 'FUNCTION_ADDED'
  | 'FUNCTION_REMOVED'
  | 'FUNCTION_RETURN_CHANGED'
  | 'FUNCTION_PARAMS_CHANGED'
  | 'EVENT_ADDED'
  | 'EVENT_REMOVED'
  | 'EVENT_FIELD_REMOVED'
  | 'EVENT_FIELD_ADDED'
  | 'STORAGE_KEY_ADDED'
  | 'STORAGE_KEY_REMOVED'
  | 'STORAGE_TYPE_CHANGED';

export interface CompatibilityChange {
  kind: CompatibilityChangeKind;
  severity: 'additive' | 'breaking' | 'neutral';
  message: string;
}

export interface UpgradeCompatibilityReport {
  level: CompatibilityLevel;
  changes: CompatibilityChange[];
  breakingChanges: CompatibilityChange[];
  additiveChanges: CompatibilityChange[];
}

function functionKey(fn: ContractFunctionSignature): string {
  return fn.name;
}

function serializeParams(params: ContractParameter[]): string {
  return params.map((param) => `${param.name}:${param.type}`).join(',');
}

export class SorobanUpgradeCompatibilityChecker {
  compare(
    previous: ContractInterface,
    current: ContractInterface,
  ): UpgradeCompatibilityReport {
    const changes: CompatibilityChange[] = [];

    changes.push(...this.compareFunctions(previous, current));
    changes.push(...this.compareEvents(previous, current));
    changes.push(...this.compareStorage(previous.storage ?? [], current.storage ?? []));

    const breakingChanges = changes.filter(
      (change) => change.severity === 'breaking',
    );
    const additiveChanges = changes.filter(
      (change) => change.severity === 'additive',
    );

    return {
      level:
        breakingChanges.length > 0
          ? 'breaking'
          : additiveChanges.length > 0
            ? 'backward'
            : 'full',
      changes,
      breakingChanges,
      additiveChanges,
    };
  }

  private compareFunctions(
    previous: ContractInterface,
    current: ContractInterface,
  ): CompatibilityChange[] {
    const changes: CompatibilityChange[] = [];
    const previousFns = new Map(previous.functions.map((fn) => [functionKey(fn), fn]));
    const currentFns = new Map(current.functions.map((fn) => [functionKey(fn), fn]));

    for (const [name, fn] of currentFns) {
      if (!previousFns.has(name)) {
        changes.push({
          kind: 'FUNCTION_ADDED',
          severity: 'additive',
          message: `Function ${name} was added`,
        });
        continue;
      }

      const before = previousFns.get(name)!;

      if (before.returns !== fn.returns) {
        changes.push({
          kind: 'FUNCTION_RETURN_CHANGED',
          severity: 'breaking',
          message: `Function ${name} now returns ${fn.returns} instead of ${before.returns}`,
        });
      }

      if (serializeParams(before.params) !== serializeParams(fn.params)) {
        changes.push({
          kind: 'FUNCTION_PARAMS_CHANGED',
          severity: 'breaking',
          message: `Function ${name} parameters changed from (${serializeParams(before.params)}) to (${serializeParams(fn.params)})`,
        });
      }
    }

    for (const [name] of previousFns) {
      if (!currentFns.has(name)) {
        changes.push({
          kind: 'FUNCTION_REMOVED',
          severity: 'breaking',
          message: `Function ${name} was removed`,
        });
      }
    }

    return changes;
  }

  private compareEvents(
    previous: ContractInterface,
    current: ContractInterface,
  ): CompatibilityChange[] {
    const changes: CompatibilityChange[] = [];
    const previousEvents = new Map(previous.events.map((event) => [event.name, event]));
    const currentEvents = new Map(current.events.map((event) => [event.name, event]));

    for (const [name, event] of currentEvents) {
      if (!previousEvents.has(name)) {
        changes.push({
          kind: 'EVENT_ADDED',
          severity: 'additive',
          message: `Event ${name} was added`,
        });
        continue;
      }

      const before = previousEvents.get(name)!;
      const removed = before.fields.filter((field) => !event.fields.includes(field));

      if (removed.length > 0) {
        changes.push({
          kind: 'EVENT_FIELD_REMOVED',
          severity: 'breaking',
          message: `Event ${name} no longer emits field(s): ${removed.join(', ')}`,
        });
      }

      const added = event.fields.filter((field) => !before.fields.includes(field));
      if (added.length > 0) {
        changes.push({
          kind: 'EVENT_FIELD_ADDED',
          severity: 'additive',
          message: `Event ${name} now emits field(s): ${added.join(', ')}`,
        });
      }
    }

    for (const [name] of previousEvents) {
      if (!currentEvents.has(name)) {
        changes.push({
          kind: 'EVENT_REMOVED',
          severity: 'breaking',
          message: `Event ${name} was removed`,
        });
      }
    }

    return changes;
  }

  private compareStorage(
    previous: ContractStorageEntry[],
    current: ContractStorageEntry[],
  ): CompatibilityChange[] {
    const changes: CompatibilityChange[] = [];
    const previousKeys = new Map(previous.map((entry) => [entry.key, entry]));
    const currentKeys = new Map(current.map((entry) => [entry.key, entry]));

    for (const [key, entry] of currentKeys) {
      if (!previousKeys.has(key)) {
        changes.push({
          kind: 'STORAGE_KEY_ADDED',
          severity: 'additive',
          message: `Storage key ${key} was added`,
        });
        continue;
      }

      const before = previousKeys.get(key)!;
      if (before.type !== entry.type) {
        changes.push({
          kind: 'STORAGE_TYPE_CHANGED',
          severity: 'breaking',
          message: `Storage key ${key} changed type from ${before.type} to ${entry.type}`,
        });
      }
    }

    for (const [key] of previousKeys) {
      if (!currentKeys.has(key)) {
        changes.push({
          kind: 'STORAGE_KEY_REMOVED',
          severity: 'breaking',
          message: `Storage key ${key} was removed`,
        });
      }
    }

    return changes;
  }
}
