import { AssetRegistryStore, StellarAssetRecord } from './types';

/**
 * Simple in-memory implementation of `AssetRegistryStore`.
 *
 * Records are cloned on the way in and out so callers cannot mutate the
 * registry's internal state. Handy for tests and for bootstrapping a
 * source-driven registry before wiring a persistent store.
 */
export class InMemoryAssetRegistry implements AssetRegistryStore {
  private readonly records = new Map<string, StellarAssetRecord>();

  /** Snapshot of every stored record. */
  getAll(): StellarAssetRecord[] {
    return Array.from(this.records.values()).map(clone);
  }

  /** Get a record by id. */
  get(id: string): StellarAssetRecord | undefined {
    const record = this.records.get(id);
    return record ? clone(record) : undefined;
  }

  /** Whether a record exists. */
  has(id: string): boolean {
    return this.records.has(id);
  }

  /** Add a new record. Throws when the id already exists. */
  add(asset: StellarAssetRecord): void {
    if (this.records.has(asset.id)) {
      throw new Error(`Asset "${asset.id}" is already registered`);
    }
    this.records.set(asset.id, clone(asset));
  }

  /** Replace an existing record. Throws when the id is unknown. */
  update(asset: StellarAssetRecord): void {
    if (!this.records.has(asset.id)) {
      throw new Error(`Asset "${asset.id}" is not registered`);
    }
    this.records.set(asset.id, clone(asset));
  }

  /** Remove a record. Returns true when a record was removed. */
  remove(id: string): boolean {
    return this.records.delete(id);
  }

  /** Number of stored records. */
  get size(): number {
    return this.records.size;
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
