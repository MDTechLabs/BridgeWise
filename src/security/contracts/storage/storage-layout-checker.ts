/**
 * Contract storage layout checks.
 *
 * Soroban storage is a flat key space, so two logically different entries can
 * still collide when a key is a prefix of another, and a persistent entry
 * without a TTL can be archived while its caller still expects it. These
 * checks validate a declared layout before it is deployed, and compare it with
 * the previous layout so a type change is not shipped silently.
 */

export interface StorageLayoutEntry {
  key: string;
  type: string;
  /** Persistent entries must carry an explicit TTL. */
  persistent?: boolean;
  /** TTL in ledgers; required for persistent entries under the default policy. */
  ttlLedgers?: number;
}

export type StorageLayoutIssueCode =
  | 'EMPTY_KEY'
  | 'DUPLICATE_KEY'
  | 'PREFIX_COLLISION'
  | 'MISSING_TTL'
  | 'ENTRY_BUDGET_EXCEEDED'
  | 'UNSORTED_ENUMERATION'
  | 'TYPE_CHANGED';

export interface StorageLayoutIssue {
  code: StorageLayoutIssueCode;
  severity: 'error' | 'warning';
  message: string;
  key?: string;
}

export interface StorageLayoutPolicy {
  maxEntries: number;
  requireTtlForPersistent: boolean;
  requireSortedEnumeration: boolean;
}

export interface StorageLayoutReport {
  valid: boolean;
  issues: StorageLayoutIssue[];
}

export const DEFAULT_STORAGE_LAYOUT_POLICY: StorageLayoutPolicy = {
  maxEntries: 100,
  requireTtlForPersistent: true,
  requireSortedEnumeration: true,
};

function sameKind(value: unknown): value is string {
  return typeof value === 'string';
}

export class ContractStorageLayoutChecker {
  private readonly policy: StorageLayoutPolicy;

  constructor(policy: Partial<StorageLayoutPolicy> = {}) {
    this.policy = { ...DEFAULT_STORAGE_LAYOUT_POLICY, ...policy };
  }

  getPolicy(): StorageLayoutPolicy {
    return { ...this.policy };
  }

  check(
    entries: StorageLayoutEntry[],
    previous: StorageLayoutEntry[] = [],
  ): StorageLayoutReport {
    const issues: StorageLayoutIssue[] = [];
    const seen = new Map<string, StorageLayoutEntry>();

    for (const entry of entries) {
      if (!sameKind(entry.key) || entry.key.trim() === '') {
        issues.push({
          code: 'EMPTY_KEY',
          severity: 'error',
          message: 'Storage entries must declare a non-empty key',
          key: entry.key,
        });
        continue;
      }

      if (seen.has(entry.key)) {
        issues.push({
          code: 'DUPLICATE_KEY',
          severity: 'error',
          message: `Storage key ${entry.key} is declared more than once`,
          key: entry.key,
        });
        continue;
      }

      seen.set(entry.key, entry);

      if (this.policy.requireTtlForPersistent && entry.persistent && !entry.ttlLedgers) {
        issues.push({
          code: 'MISSING_TTL',
          severity: 'error',
          message: `Persistent storage key ${entry.key} has no TTL`,
          key: entry.key,
        });
      }
    }

    issues.push(...this.checkPrefixCollisions([...seen.keys()]));

    if (entries.length > this.policy.maxEntries) {
      issues.push({
        code: 'ENTRY_BUDGET_EXCEEDED',
        severity: 'error',
        message: `Layout declares ${entries.length} entries, above the ${this.policy.maxEntries} limit`,
      });
    }

    if (this.policy.requireSortedEnumeration && !isSorted([...seen.keys()])) {
      issues.push({
        code: 'UNSORTED_ENUMERATION',
        severity: 'warning',
        message: 'Storage keys are not in lexicographic order, which breaks enumeration assumptions',
      });
    }

    const previousByKey = new Map(previous.map((entry) => [entry.key, entry]));
    for (const entry of seen.values()) {
      const before = previousByKey.get(entry.key);
      if (before && before.type !== entry.type) {
        issues.push({
          code: 'TYPE_CHANGED',
          severity: 'error',
          message: `Storage key ${entry.key} changed type from ${before.type} to ${entry.type}`,
          key: entry.key,
        });
      }
    }

    return {
      valid: issues.every((issue) => issue.severity !== 'error'),
      issues,
    };
  }

  /**
   * Keys that share a separator-delimited prefix collide when the storage
   * scheme joins them naively (e.g. `balance` and `balance_lock` both reduce
   * to a prefix of each other).
   */
  private checkPrefixCollisions(keys: string[]): StorageLayoutIssue[] {
    const issues: StorageLayoutIssue[] = [];
    const sorted = [...keys].sort();

    for (let i = 0; i < sorted.length - 1; i += 1) {
      const current = sorted[i];
      const next = sorted[i + 1];

      if (next.startsWith(`${current}_`) || next.startsWith(`${current}.`)) {
        issues.push({
          code: 'PREFIX_COLLISION',
          severity: 'error',
          message: `Storage key ${current} is a prefix of ${next}, which is unsafe under naive key joining`,
          key: current,
        });
      }
    }

    return issues;
  }
}

function isSorted(values: string[]): boolean {
  for (let i = 1; i < values.length; i += 1) {
    if (values[i - 1] > values[i]) return false;
  }

  return true;
}
