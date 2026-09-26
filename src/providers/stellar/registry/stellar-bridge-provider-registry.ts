import type {
  HealthSnapshot,
  ProviderQuery,
  ProviderRegistryStats,
  ProviderStatus,
  RegisterStellarProviderInput,
  StellarBridgeProvider,
} from './types';
import {
  ProviderRegistrationError,
  UnknownProviderError,
} from './types';

// ─── Options ──────────────────────────────────────────────────────────────────

export interface StellarBridgeProviderRegistryOptions {
  /** Max providers allowed. Default Infinity. Throws RangeError when < 1. */
  maxProviders?: number;
  /** Injected clock for deterministic testing. Defaults to Date.now. */
  now?: () => number;
}

// ─── Class ────────────────────────────────────────────────────────────────────

/**
 * Centralized registry for Stellar bridge providers (issue #445).
 *
 * Acts as the single source of truth when callers need to "find a Stellar
 * bridge provider that supports this asset/chain/network". Pairs naturally
 * with the per-provider `metadata`, `discovery`, and `maintenance` services
 * but does not depend on them.
 *
 * Provider ids are normalized (trimmed + lowercased) so lookups are
 * case-insensitive and stable regardless of caller formatting.
 */
export class StellarBridgeProviderRegistry {
  private readonly providers = new Map<string, StellarBridgeProvider>();
  private readonly health = new Map<string, HealthSnapshot>();
  private readonly maxProviders: number;
  private readonly now: () => number;

  constructor(options: StellarBridgeProviderRegistryOptions = {}) {
    this.maxProviders = options.maxProviders ?? Infinity;
    this.now = options.now ?? (() => Date.now());
    if (this.maxProviders < 1) {
      throw new RangeError('maxProviders must be >= 1');
    }
  }

  // ─── Registration ──────────────────────────────────────────────────────

  /**
   * Register a provider. Idempotent over the same id: re-registration
   * replaces the existing record, refreshes `updatedAt`, and preserves
   * the original `registeredAt`.
   *
   * @throws `ProviderRegistrationError` for invalid input.
   * @throws `RangeError` when the registry is at capacity and `id` is new.
   */
  register(input: RegisterStellarProviderInput): StellarBridgeProvider {
    this.validate(input);
    const id = this.normalizeId(input.id);
    this.ensureCapacityFor(id);

    const ts = this.now();
    const existing = this.providers.get(id);
    const provider: StellarBridgeProvider = {
      id,
      name: input.name.trim(),
      kind: input.kind,
      endpoint: input.endpoint.trim(),
      networks: input.networks.map((n) => n.trim()).filter(Boolean),
      chains: input.chains.map((c) => ({
        identifier: c.identifier.trim(),
        assetCode: c.assetCode.trim(),
      })),
      assets: input.assets.map((a) => ({
        code: a.code.trim().toUpperCase(),
        issuer: a.issuer?.trim() || undefined,
        trustlineRequired: a.trustlineRequired,
      })),
      feeModel: input.feeModel,
      flatFeeUsdCents: input.flatFeeUsdCents,
      feeBps: input.feeBps,
      status: input.status ?? 'active',
      tags: input.tags?.map((t) => t.trim()).filter(Boolean),
      registeredAt: existing?.registeredAt ?? ts,
      updatedAt: ts,
    };
    this.providers.set(id, provider);
    return cloneProvider(provider);
  }

  /**
   * Register multiple providers. All inputs are validated before any are
   * written, so the registry is never left in a partial state on error.
   *
   * @throws `ProviderRegistrationError` if any input is invalid.
   */
  registerBatch(inputs: RegisterStellarProviderInput[]): StellarBridgeProvider[] {
    for (const input of inputs) this.validate(input);
    return inputs.map((input) => this.register(input));
  }

  /** Remove a provider. Returns true if removed. */
  deregister(id: string): boolean {
    const norm = this.normalizeIdOrNull(id);
    if (!norm) return false;
    this.health.delete(norm);
    return this.providers.delete(norm);
  }

  /** Whether a provider is registered (id is normalized). */
  has(id: string): boolean {
    const norm = this.normalizeIdOrNull(id);
    return norm ? this.providers.has(norm) : false;
  }

  // ─── Lookup ────────────────────────────────────────────────────────────

  /** Look up by id, returning undefined when missing. */
  get(id: string): StellarBridgeProvider | undefined {
    const norm = this.normalizeIdOrNull(id);
    if (!norm) return undefined;
    const provider = this.providers.get(norm);
    return provider ? cloneProvider(provider) : undefined;
  }

  /** Look up by id and throw `UnknownProviderError` if missing. */
  getOrThrow(id: string): StellarBridgeProvider {
    const provider = this.get(id);
    if (!provider) throw new UnknownProviderError(id);
    return provider;
  }

  /** Latest health snapshot for a provider, if any. */
  getHealth(id: string): HealthSnapshot | undefined {
    const norm = this.normalizeIdOrNull(id);
    return norm ? this.health.get(norm) : undefined;
  }

  /** All registered providers sorted by id. */
  getAll(): StellarBridgeProvider[] {
    return [...this.providers.values()].sort((a, b) => a.id.localeCompare(b.id)).map(cloneProvider);
  }

  // ─── Query ─────────────────────────────────────────────────────────────

  /**
   * Query providers by one or more filters. Unspecified filters are ignored.
   * Results are sorted by id.
   */
  query(filter: ProviderQuery = {}): StellarBridgeProvider[] {
    let matches = [...this.providers.values()];

    if (filter.status) {
      matches = matches.filter((p) => p.status === filter.status);
    }
    if (filter.kind) {
      matches = matches.filter((p) => p.kind === filter.kind);
    }
    if (filter.network) {
      const needle = filter.network.trim().toLowerCase();
      matches = matches.filter((p) =>
        p.networks.some((n) => n.toLowerCase() === needle),
      );
    }
    if (filter.chain) {
      const needle = filter.chain.trim().toLowerCase();
      matches = matches.filter((p) =>
        p.chains.some((c) => c.identifier.toLowerCase() === needle),
      );
    }
    if (filter.asset) {
      const needle = filter.asset.trim().toUpperCase();
      matches = matches.filter((p) => p.assets.some((a) => a.code.toUpperCase() === needle));
    }
    if (filter.tag) {
      const needle = filter.tag.trim();
      matches = matches.filter((p) => p.tags?.includes(needle));
    }

    return matches
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(cloneProvider);
  }

  /**
   * Providers that are operationally available (active or degraded) AND
   * support the given chain + asset combination.
   */
  getSupportingRoute(args: { chain: string; asset: string }): StellarBridgeProvider[] {
    const chain = args.chain.trim().toLowerCase();
    const asset = args.asset.trim().toUpperCase();
    return this.getAll().filter((p) => {
      if (p.status !== 'active' && p.status !== 'degraded') return false;
      if (!p.chains.some((c) => c.identifier.toLowerCase() === chain)) return false;
      if (!p.assets.some((a) => a.code.toUpperCase() === asset)) return false;
      return true;
    });
  }

  /** Providers whose status equals the given value. */
  getByStatus(status: ProviderStatus): StellarBridgeProvider[] {
    return this.getAll().filter((p) => p.status === status);
  }

  /** Providers matching a given kind. */
  getByKind(kind: StellarBridgeProvider['kind']): StellarBridgeProvider[] {
    return this.getAll().filter((p) => p.kind === kind);
  }

  /** Providers supporting an asset code (case-insensitive). */
  getByAsset(asset: string): StellarBridgeProvider[] {
    const needle = asset.trim().toUpperCase();
    return this.getAll().filter((p) => p.assets.some((a) => a.code.toUpperCase() === needle));
  }

  /** Providers supporting a chain identifier (case-insensitive). */
  getByChain(chain: string): StellarBridgeProvider[] {
    const needle = chain.trim().toLowerCase();
    return this.getAll().filter((p) => p.chains.some((c) => c.identifier.toLowerCase() === needle));
  }

  // ─── Status / health updates ───────────────────────────────────────────

  /**
   * Mutate a provider's status. Refreshes `updatedAt`.
   * Throws `UnknownProviderError` if the id is unknown.
   */
  updateStatus(id: string, status: ProviderStatus): StellarBridgeProvider {
    const normalized = this.normalizeIdOrNull(id);
    if (!normalized || !this.providers.has(normalized)) {
      throw new UnknownProviderError(id);
    }
    const provider = this.providers.get(normalized)!;
    provider.status = status;
    provider.updatedAt = this.now();
    return cloneProvider(provider);
  }

  /**
   * Record a health observation. Throws `UnknownProviderError` for unknown ids.
   */
  recordHealth(snapshot: HealthSnapshotInput): HealthSnapshot {
    const normalized = this.normalizeIdOrNull(snapshot.providerId);
    if (!normalized || !this.providers.has(normalized)) {
      throw new UnknownProviderError(snapshot.providerId);
    }
    const record: HealthSnapshot = {
      providerId: normalized,
      healthy: !!snapshot.healthy,
      latencyMs: snapshot.latencyMs,
      checkedAt: snapshot.checkedAt ?? this.now(),
    };
    this.health.set(normalized, record);
    return { ...record };
  }

  // ─── Stats ─────────────────────────────────────────────────────────────

  /** Aggregate stats over the current registry contents. */
  stats(): ProviderRegistryStats {
    const byStatus: Record<ProviderStatus, number> = {
      active: 0,
      inactive: 0,
      degraded: 0,
      maintenance: 0,
      deprecated: 0,
    };
    const byKind: Record<StellarBridgeProvider['kind'], number> = {
      soroban: 0,
      classic: 0,
      hybrid: 0,
    };
    const byNetwork: Record<string, number> = {};
    const assetSet = new Set<string>();

    for (const provider of this.providers.values()) {
      byStatus[provider.status]++;
      byKind[provider.kind]++;
      for (const network of provider.networks) {
        byNetwork[network] = (byNetwork[network] ?? 0) + 1;
      }
      for (const asset of provider.assets) {
        assetSet.add(asset.code.toUpperCase());
      }
    }

    return {
      totalProviders: this.providers.size,
      byStatus,
      byKind,
      byNetwork,
      supportedAssets: [...assetSet].sort(),
    };
  }

  /** Current registry size. */
  get size(): number {
    return this.providers.size;
  }

  // ─── Private ───────────────────────────────────────────────────────────

  private normalizeId(id: string): string {
    return id.trim().toLowerCase();
  }

  private normalizeIdOrNull(id: string): string | null {
    if (typeof id !== 'string') return null;
    const trimmed = id.trim();
    return trimmed ? trimmed.toLowerCase() : null;
  }

  private ensureCapacityFor(id: string): void {
    if (this.maxProviders === Infinity) return;
    if (this.providers.size < this.maxProviders) return;
    if (this.providers.has(id)) return; // replacement, no new slot
    throw new RangeError(
      `Stellar provider registry is at capacity (${this.maxProviders}). ` +
        `Deregister an entry or raise maxProviders before adding more.`,
    );
  }

  private validate(input: RegisterStellarProviderInput): void {
    if (typeof input.id !== 'string' || !input.id.trim()) {
      throw new ProviderRegistrationError('Provider id must be a non-empty string');
    }
    if (typeof input.name !== 'string' || !input.name.trim()) {
      throw new ProviderRegistrationError(
        `Provider "${input.id}": name must be a non-empty string`,
      );
    }
    if (typeof input.endpoint !== 'string' || !input.endpoint.trim()) {
      throw new ProviderRegistrationError(
        `Provider "${input.id}": endpoint must be a non-empty string`,
      );
    }
    if (!Array.isArray(input.networks) || input.networks.length === 0) {
      throw new ProviderRegistrationError(
        `Provider "${input.id}": networks must be a non-empty array`,
      );
    }
    if (!Array.isArray(input.chains)) {
      throw new ProviderRegistrationError(
        `Provider "${input.id}": chains must be an array`,
      );
    }
    if (!Array.isArray(input.assets) || input.assets.length === 0) {
      throw new ProviderRegistrationError(
        `Provider "${input.id}": assets must be a non-empty array`,
      );
    }
    if (!input.assets.every((a) => a.code?.trim())) {
      throw new ProviderRegistrationError(
        `Provider "${input.id}": every asset must have a non-empty code`,
      );
    }
    if (!input.chains.every((c) => c.identifier?.trim() && c.assetCode?.trim())) {
      throw new ProviderRegistrationError(
        `Provider "${input.id}": every chain entry must have non-empty identifier and assetCode`,
      );
    }
    if (
      input.feeModel === 'flat' &&
      (input.flatFeeUsdCents === undefined || input.flatFeeUsdCents < 0)
    ) {
      throw new ProviderRegistrationError(
        `Provider "${input.id}": flatFeeUsdCents must be a non-negative number when feeModel="flat"`,
      );
    }
    if (
      (input.feeModel === 'bps' || input.feeModel === 'tiered') &&
      (input.feeBps === undefined || input.feeBps < 0 || input.feeBps > 10_000)
    ) {
      throw new ProviderRegistrationError(
        `Provider "${input.id}": feeBps must be between 0 and 10000 when feeModel is "bps" or "tiered"`,
      );
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Input shape for {@link StellarBridgeProviderRegistry.recordHealth}.
 * Requires `providerId` (the only stable identifier), lets the caller
 * optionally override `checkedAt`, and accepts everything else from
 * {@link HealthSnapshot}.
 */
export type HealthSnapshotInput = Omit<HealthSnapshot, 'providerId' | 'checkedAt'> & {
  providerId: string;
  checkedAt?: number;
};

function cloneProvider(p: StellarBridgeProvider): StellarBridgeProvider {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    endpoint: p.endpoint,
    networks: [...p.networks],
    chains: p.chains.map((c) => ({ ...c })),
    assets: p.assets.map((a) => ({ ...a })),
    feeModel: p.feeModel,
    flatFeeUsdCents: p.flatFeeUsdCents,
    feeBps: p.feeBps,
    status: p.status,
    tags: p.tags ? [...p.tags] : undefined,
    registeredAt: p.registeredAt,
    updatedAt: p.updatedAt,
  };
}

// ─── Default seed ─────────────────────────────────────────────────────────────

/**
 * Pre-loaded registry with two illustrative Stellar bridge providers.
 * Use `register` / `registerBatch` to extend it.
 */
export const defaultStellarBridgeProviderRegistry = new StellarBridgeProviderRegistry();

defaultStellarBridgeProviderRegistry.registerBatch([
  {
    id: 'soroswap',
    name: 'SoroSwap',
    kind: 'soroban',
    endpoint: 'https://bridge.soroswap.finance',
    networks: ['Public Global Stellar Network ; September 2015'],
    chains: [
      { identifier: 'stellar', assetCode: 'USDC' },
      { identifier: 'ethereum', assetCode: 'USDC' },
    ],
    assets: [
      { code: 'XLM' },
      { code: 'USDC', trustlineRequired: false },
    ],
    feeModel: 'bps',
    feeBps: 30,
    tags: ['dex', 'soroban'],
  },
  {
    id: 'allbridge',
    name: 'AllBridge',
    kind: 'classic',
    endpoint: 'https://stellar.allbridge.io',
    networks: ['Public Global Stellar Network ; September 2015'],
    chains: [
      { identifier: 'stellar', assetCode: 'USDC' },
      { identifier: 'ethereum', assetCode: 'USDC' },
      { identifier: 'polygon', assetCode: 'USDC' },
    ],
    assets: [
      { code: 'USDC' },
      { code: 'USDT' },
    ],
    feeModel: 'flat',
    flatFeeUsdCents: 50,
    tags: ['classic', 'multi-chain'],
  },
]);
