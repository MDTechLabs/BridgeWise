import {
  StellarBridgeProviderRegistry,
  defaultStellarBridgeProviderRegistry,
} from './stellar-bridge-provider-registry';
import {
  ProviderRegistrationError,
  UnknownProviderError,
} from './types';
import type { RegisterStellarProviderInput } from './types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_NETWORK = 'Public Global Stellar Network ; September 2015';

const baseInput = (id = 'soroban-x'): RegisterStellarProviderInput => ({
  id,
  name: `Provider ${id}`,
  kind: 'soroban',
  endpoint: `https://${id}.example.com`,
  networks: [SAMPLE_NETWORK],
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
  tags: ['demo'],
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StellarBridgeProviderRegistry', () => {
  let tick: number;
  let registry: StellarBridgeProviderRegistry;

  beforeEach(() => {
    tick = 1_000;
    registry = new StellarBridgeProviderRegistry({ now: () => tick });
  });

  // ─── Constructor ───────────────────────────────────────────────────────────

  it('throws when maxProviders is < 1', () => {
    expect(
      () => new StellarBridgeProviderRegistry({ maxProviders: 0 }),
    ).toThrow(RangeError);
  });

  // ─── register + lookup ─────────────────────────────────────────────────────

  it('registers a provider and stamps both timestamps', () => {
    const stored = registry.register(baseInput());
    expect(stored.id).toBe('soroban-x');
    expect(stored.registeredAt).toBe(tick);
    expect(stored.updatedAt).toBe(tick);
    expect(registry.size).toBe(1);
  });

  it('returns stored provider via get() and getOrThrow()', () => {
    registry.register(baseInput('prov-a'));
    expect(registry.get('prov-a')?.id).toBe('prov-a');
    expect(registry.getOrThrow('prov-a').name).toBe('Provider prov-a');
  });

  it('getOrThrow throws UnknownProviderError for unknown id', () => {
    expect(() => registry.getOrThrow('ghost')).toThrow(UnknownProviderError);
  });

  it('has() respects id normalization', () => {
    registry.register(baseInput('Prov-One'));
    expect(registry.has('prov-one')).toBe(true);
    expect(registry.has('PROV-ONE')).toBe(true);
    expect(registry.has('  prov-one  ')).toBe(true);
  });

  it('replacing an existing record refreshes updatedAt but keeps registeredAt', () => {
    registry.register(baseInput('rep'));
    tick = 5_000;
    const updated = registry.register({ ...baseInput('rep'), status: 'inactive' });
    expect(updated.status).toBe('inactive');
    expect(updated.registeredAt).toBe(1_000);
    expect(updated.updatedAt).toBe(5_000);
    expect(registry.size).toBe(1);
  });

  // ─── registerBatch ─────────────────────────────────────────────────────────

  it('registerBatch applies multiple providers', () => {
    const results = registry.registerBatch([
      baseInput('a'),
      baseInput('b'),
      baseInput('c'),
    ]);
    expect(results).toHaveLength(3);
    expect(registry.size).toBe(3);
  });

  it('registerBatch is atomic — partial failures leave the registry intact', () => {
    expect(() =>
      registry.registerBatch([
        baseInput('a'),
        { ...baseInput('b'), feeModel: 'flat' }, // missing flatFeeUsdCents
      ]),
    ).toThrow(ProviderRegistrationError);
    expect(registry.size).toBe(0);
  });

  // ─── Validation ────────────────────────────────────────────────────────────

  it.each([
    ['blank id', { ...baseInput(), id: '   ' }],
    ['blank name', { ...baseInput(), name: '   ' }],
    ['blank endpoint', { ...baseInput(), endpoint: '' }],
    ['empty networks', { ...baseInput(), networks: [] }],
    ['empty assets', { ...baseInput(), assets: [] }],
    ['asset without code', { ...baseInput(), assets: [{ code: '' }] }],
    ['chain without identifier', { ...baseInput(), chains: [{ identifier: '', assetCode: 'USDC' }] }],
    ['chain without assetCode', { ...baseInput(), chains: [{ identifier: 'stellar', assetCode: '' }] }],
  ])('throws ProviderRegistrationError for %s', (_label, override) => {
    expect(() => registry.register(override as RegisterStellarProviderInput)).toThrow(
      ProviderRegistrationError,
    );
  });

  it('rejects flat fee model without flatFeeUsdCents', () => {
    expect(() =>
      registry.register({ ...baseInput(), feeModel: 'flat', feeBps: undefined }),
    ).toThrow(ProviderRegistrationError);
  });

  it('rejects flat fees that are negative', () => {
    expect(() =>
      registry.register({ ...baseInput(), feeModel: 'flat', flatFeeUsdCents: -5 }),
    ).toThrow(ProviderRegistrationError);
  });

  it('rejects feeBps outside the 0..10_000 window', () => {
    expect(() => registry.register({ ...baseInput(), feeBps: -1 })).toThrow(ProviderRegistrationError);
    expect(() => registry.register({ ...baseInput(), feeBps: 10_001 })).toThrow(ProviderRegistrationError);
  });

  // ─── deregister ────────────────────────────────────────────────────────────

  it('removes a registered provider and clears its health snapshot', () => {
    registry.register(baseInput('rm'));
    registry.recordHealth({ providerId: 'rm', healthy: true });
    expect(registry.deregister('rm')).toBe(true);
    expect(registry.has('rm')).toBe(false);
    expect(registry.getHealth('rm')).toBeUndefined();
  });

  it('returns false when deregistering an unknown provider', () => {
    expect(registry.deregister('ghost')).toBe(false);
  });

  // ─── query / filter ────────────────────────────────────────────────────────

  it('getByStatus filters by status', () => {
    registry.register(baseInput('a'));
    registry.register({ ...baseInput('b'), status: 'inactive' });
    expect(registry.getByStatus('active').map((p) => p.id)).toEqual(['a']);
    expect(registry.getByStatus('inactive').map((p) => p.id)).toEqual(['b']);
  });

  it('getByKind / getByAsset / getByChain return expected providers', () => {
    registry.register(baseInput('a'));
    registry.register({ ...baseInput('b'), kind: 'classic' });
    expect(registry.getByKind('soroban').map((p) => p.id)).toEqual(['a']);
    expect(registry.getByKind('classic').map((p) => p.id)).toEqual(['b']);
    expect(registry.getByAsset('usdc').map((p) => p.id)).toEqual(['a', 'b']);
    expect(registry.getByChain('stellar').map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('query() combines multiple filters', () => {
    registry.register(baseInput('a')); // soroban, XLM/USDC, stellar+ethereum chains, demo tag
    registry.register({
      ...baseInput('b'),
      kind: 'classic',
      chains: [{ identifier: 'solana', assetCode: 'USDC' }],
      assets: [{ code: 'USDC' }],
    });
    expect(registry.query({ kind: 'soroban' }).map((p) => p.id)).toEqual(['a']);
    expect(registry.query({ asset: 'xlm' }).map((p) => p.id)).toEqual(['a']);
    expect(
      registry.query({ tag: 'demo', chain: 'ethereum' }).map((p) => p.id),
    ).toEqual(['a']);
  });

  it('getSupportingRoute returns only active/degraded providers matching chain + asset', () => {
    registry.register(baseInput('a'));
    registry.register({ ...baseInput('b'), status: 'maintenance' });
    registry.register({ ...baseInput('c'), status: 'inactive' });
    const supporting = registry.getSupportingRoute({ chain: 'stellar', asset: 'USDC' }).map(
      (p) => p.id,
    );
    expect(supporting).toEqual(['a']);
  });

  // ─── status & health updates ───────────────────────────────────────────────

  it('updateStatus mutates status and refreshes updatedAt', () => {
    registry.register(baseInput('up'));
    tick = 5_000;
    const updated = registry.updateStatus('up', 'maintenance');
    expect(updated.status).toBe('maintenance');
    expect(updated.updatedAt).toBe(5_000);
    expect(registry.get('up')?.status).toBe('maintenance');
  });

  it('updateStatus throws UnknownProviderError for missing id', () => {
    expect(() => registry.updateStatus('ghost', 'active')).toThrow(UnknownProviderError);
  });

  it('recordHealth stores and returns a snapshot', () => {
    registry.register(baseInput('h'));
    const snap = registry.recordHealth({ providerId: 'h', healthy: true, latencyMs: 42 });
    expect(snap.providerId).toBe('h');
    expect(snap.latencyMs).toBe(42);
    expect(snap.checkedAt).toBe(tick);
    expect(registry.getHealth('h')).toEqual(snap);
  });

  it('recordHealth throws UnknownProviderError for missing id', () => {
    expect(() => registry.recordHealth({ providerId: 'ghost', healthy: true })).toThrow(
      UnknownProviderError,
    );
  });

  // ─── stats ─────────────────────────────────────────────────────────────────

  it('stats() aggregates counts across statuses, kinds, networks, and assets', () => {
    registry.register(baseInput('a'));
    registry.register({ ...baseInput('b'), kind: 'classic' });
    const stats = registry.stats();
    expect(stats.totalProviders).toBe(2);
    expect(stats.byStatus.active).toBe(2);
    expect(stats.byKind.soroban).toBe(1);
    expect(stats.byKind.classic).toBe(1);
    expect(Object.keys(stats.byNetwork)).toContain(SAMPLE_NETWORK);
    expect(stats.supportedAssets.sort()).toEqual(['USDC', 'XLM']);
  });

  // ─── capacity ──────────────────────────────────────────────────────────────

  it('refuses new entries past capacity', () => {
    const r = new StellarBridgeProviderRegistry({ maxProviders: 2, now: () => tick });
    r.register(baseInput('a'));
    r.register(baseInput('b'));
    expect(() => r.register(baseInput('c'))).toThrow(RangeError);
  });

  it('replacing an existing entry does not consume capacity', () => {
    const r = new StellarBridgeProviderRegistry({ maxProviders: 2, now: () => tick });
    r.register(baseInput('a'));
    r.register(baseInput('b'));
    expect(() => r.register({ ...baseInput('a'), status: 'inactive' })).not.toThrow();
    expect(r.size).toBe(2);
  });

  // ─── default exported registry ─────────────────────────────────────────────

  it('defaultStellarBridgeProviderRegistry is pre-seeded with exactly two providers', () => {
    expect(defaultStellarBridgeProviderRegistry.size).toBe(2);
    expect(defaultStellarBridgeProviderRegistry.has('soroswap')).toBe(true);
    expect(defaultStellarBridgeProviderRegistry.has('allbridge')).toBe(true);
  });
});
