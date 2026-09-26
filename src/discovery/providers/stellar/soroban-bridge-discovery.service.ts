/**
 * Soroban Bridge Discovery Service
 *
 * Automatically discovers newly supported Soroban bridge providers, validates
 * their metadata, and registers them in an in-memory registry. Duplicate
 * registrations (same id) are silently skipped to keep the registry idempotent.
 *
 * Usage:
 *   const service = new SorobanBridgeDiscoveryService({ maxProviders: 50 });
 *   const result = await service.discover(fetchProviderList);
 *   const active = service.getByStatus('active');
 *
 * @see Issue #511 — Implement Soroban Bridge Discovery Service
 */

import type {
  SorobanBridgeProviderMetadata,
  BridgeProviderInput,
  BridgeProviderStatus,
  BridgeProviderValidationResult,
  BridgeDiscoveryResult,
  BridgeDiscoveryConfig,
} from './soroban-bridge-discovery.types';

export class SorobanBridgeDiscoveryService {
  private readonly registry = new Map<string, SorobanBridgeProviderMetadata>();
  private readonly maxProviders: number;
  private readonly now: () => number;

  constructor(config: BridgeDiscoveryConfig = {}) {
    this.maxProviders = config.maxProviders ?? 100;
    this.now = config.now ?? (() => Date.now());

    if (this.maxProviders < 1) {
      throw new RangeError('maxProviders must be ≥ 1');
    }
  }

  // ─── Discovery ─────────────────────────────────────────────────────────────

  /**
   * Fetch provider metadata from the supplied async function, validate each
   * entry, then register all previously-unknown valid providers up to
   * `maxProviders`.
   *
   * @param fetchFn  Async function that resolves to an array of raw provider
   *                 metadata (without `registeredAt`).
   */
  async discover(
    fetchFn: () => Promise<BridgeProviderInput[]>,
  ): Promise<BridgeDiscoveryResult> {
    const raw = await fetchFn();
    let registered = 0;
    let skipped = 0;

    for (const item of raw) {
      const validation = this.validateProvider(item);
      if (!validation.isValid || this.registry.has(item.id)) {
        skipped++;
        continue;
      }
      if (this.registry.size >= this.maxProviders) {
        skipped++;
        continue;
      }
      this.registry.set(item.id, { ...item, registeredAt: this.now() });
      registered++;
    }

    return { discovered: raw.length, registered, skipped };
  }

  // ─── Registration ──────────────────────────────────────────────────────────

  /**
   * Register a single provider directly without going through discovery.
   * Returns `false` when the provider is already registered, at capacity,
   * or fails validation.
   */
  register(provider: BridgeProviderInput): boolean {
    const validation = this.validateProvider(provider);
    if (!validation.isValid) return false;
    if (this.registry.has(provider.id)) return false;
    if (this.registry.size >= this.maxProviders) return false;

    this.registry.set(provider.id, { ...provider, registeredAt: this.now() });
    return true;
  }

  /** Remove a provider from the registry. Returns `true` if it was present. */
  deregister(id: string): boolean {
    return this.registry.delete(id);
  }

  // ─── Validation ────────────────────────────────────────────────────────────

  /**
   * Validate provider metadata without registering.
   * Checks for required fields: id, name, endpoint, and supportedAssets.
   */
  validateProvider(provider: BridgeProviderInput): BridgeProviderValidationResult {
    const issues: string[] = [];

    if (!provider.id || provider.id.trim().length === 0) {
      issues.push('id is required');
    }
    if (!provider.name || provider.name.trim().length === 0) {
      issues.push('name is required');
    }
    if (!provider.endpoint || provider.endpoint.trim().length === 0) {
      issues.push('endpoint is required');
    }
    if (
      !Array.isArray(provider.supportedAssets) ||
      provider.supportedAssets.length === 0
    ) {
      issues.push('supportedAssets must be a non-empty array');
    }

    return {
      providerId: provider.id ?? '',
      isValid: issues.length === 0,
      issues,
    };
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  /** Look up a provider by id. */
  get(id: string): SorobanBridgeProviderMetadata | undefined {
    return this.registry.get(id);
  }

  /** All registered providers, sorted by registration time ascending. */
  getAll(): SorobanBridgeProviderMetadata[] {
    return Array.from(this.registry.values()).sort(
      (a, b) => a.registeredAt - b.registeredAt,
    );
  }

  /** All registered providers matching a given status. */
  getByStatus(status: BridgeProviderStatus): SorobanBridgeProviderMetadata[] {
    return this.getAll().filter((p) => p.status === status);
  }

  /** Update the status of a registered provider. Returns `false` if not found. */
  updateStatus(id: string, status: BridgeProviderStatus): boolean {
    const provider = this.registry.get(id);
    if (!provider) return false;
    provider.status = status;
    return true;
  }

  /** Number of currently registered providers. */
  get size(): number {
    return this.registry.size;
  }
}
