/**
 * Stellar Asset Registry Synchronization — Tests (Issue #1057)
 *
 * Covers fetching supported asset metadata, comparing incoming/stored records,
 * detecting new and removed assets, and rejecting invalid metadata.
 */

import {
  AssetMetadataSource,
  InMemoryAssetRegistry,
  StaticAssetMetadataSource,
  StellarAssetMetadataInput,
  StellarAssetRegistrySynchronizer,
  StellarAssetSyncError,
  isValidSorobanContractId,
  isValidStellarAccountId,
  validateStellarAssetMetadata,
} from '../../../../src/assets/registry/sync/stellar';

const ISSUER = 'G' + 'A'.repeat(55);
const OTHER_ISSUER = 'G' + 'C'.repeat(55);
const CONTRACT = 'C' + 'B'.repeat(55);

const makeAsset = (
  overrides: Partial<StellarAssetMetadataInput> = {},
): StellarAssetMetadataInput => ({
  code: 'USDC',
  name: 'USD Coin',
  issuer: ISSUER,
  network: 'stellar',
  decimals: 7,
  ...overrides,
});

const source = (
  name: string,
  assets: StellarAssetMetadataInput[],
): AssetMetadataSource => new StaticAssetMetadataSource(name, assets);

const failingSource = (
  name: string,
  message = 'boom',
): AssetMetadataSource => ({
  name,
  fetchAssets: async () => {
    throw new Error(message);
  },
});

describe('StellarAssetRegistrySynchronizer', () => {
  // ─── Construction ──────────────────────────────────────────────────────

  describe('construction', () => {
    it('requires at least one source', () => {
      expect(
        () =>
          new StellarAssetRegistrySynchronizer({
            sources: [],
            store: new InMemoryAssetRegistry(),
          }),
      ).toThrow(/at least one asset metadata source/i);
    });

    it('requires a target store', () => {
      expect(
        () =>
          new StellarAssetRegistrySynchronizer({
            sources: [source('config', [])],
            store: undefined as never,
          }),
      ).toThrow(/target asset registry store/i);
    });
  });

  // ─── Fetching ──────────────────────────────────────────────────────────

  describe('fetching supported assets', () => {
    it('aggregates and normalizes assets from multiple sources', async () => {
      const synchronizer = new StellarAssetRegistrySynchronizer({
        sources: [
          source('primary', [makeAsset({ code: 'usdc' })]),
          source('secondary', [makeAsset({ code: 'EURC', name: 'Euro Coin' })]),
        ],
        store: new InMemoryAssetRegistry(),
      });

      const result = await synchronizer.fetchSupportedAssets();

      expect(result.sources).toEqual(['primary', 'secondary']);
      expect(result.assets.map((a) => a.code).sort()).toEqual(['EURC', 'USDC']);
      expect(result.assets.every((a) => a.decimals === 7)).toBe(true);
    });

    it('de-duplicates assets by id, keeping the first source', async () => {
      const synchronizer = new StellarAssetRegistrySynchronizer({
        sources: [
          source('primary', [makeAsset({ name: 'Primary Coin' })]),
          source('secondary', [makeAsset({ name: 'Secondary Coin' })]),
        ],
        store: new InMemoryAssetRegistry(),
      });

      const result = await synchronizer.fetchSupportedAssets();

      expect(result.assets).toHaveLength(1);
      expect(result.assets[0].name).toBe('Primary Coin');
    });

    it('supports custom async loaders', async () => {
      const synchronizer = new StellarAssetRegistrySynchronizer({
        sources: [
          {
            name: 'remote',
            fetchAssets: async () => [makeAsset({ code: 'AQUA' })],
          },
        ],
        store: new InMemoryAssetRegistry(),
      });

      const result = await synchronizer.fetchSupportedAssets();
      expect(result.assets[0].code).toBe('AQUA');
    });
  });

  // ─── Detection ─────────────────────────────────────────────────────────

  describe('synchronization detection', () => {
    it('detects and adds new assets', async () => {
      const store = new InMemoryAssetRegistry();
      const synchronizer = new StellarAssetRegistrySynchronizer({
        sources: [
          source('config', [
            makeAsset({ code: 'USDC' }),
            makeAsset({ code: 'EURC', name: 'Euro Coin' }),
          ]),
        ],
        store,
      });

      const report = await synchronizer.sync();

      expect(report.added).toHaveLength(2);
      expect(report.removed).toEqual([]);
      expect(store.size).toBe(2);
    });

    it('detects and removes assets missing from the sources', async () => {
      const store = new InMemoryAssetRegistry();
      const stale = validateStellarAssetMetadata(makeAsset({ code: 'OLD' }));
      store.add(stale);

      const synchronizer = new StellarAssetRegistrySynchronizer({
        sources: [source('config', [makeAsset({ code: 'USDC' })])],
        store,
      });

      const report = await synchronizer.sync();

      expect(report.removed).toEqual([stale.id]);
      expect(store.has(stale.id)).toBe(false);
      expect(store.size).toBe(1);
    });

    it('detects and applies metadata updates', async () => {
      const store = new InMemoryAssetRegistry();
      const original = validateStellarAssetMetadata(
        makeAsset({ name: 'Old Name', decimals: 7 }),
      );
      store.add(original);

      const synchronizer = new StellarAssetRegistrySynchronizer({
        sources: [
          source('config', [makeAsset({ name: 'New Name', decimals: 6 })]),
        ],
        store,
      });

      const report = await synchronizer.sync();
      const stored = store.get(original.id);

      expect(report.updated).toEqual([original.id]);
      expect(report.added).toEqual([]);
      expect(stored?.name).toBe('New Name');
      expect(stored?.decimals).toBe(6);
    });

    it('reports unchanged assets without mutating them', async () => {
      const store = new InMemoryAssetRegistry();
      const record = validateStellarAssetMetadata(makeAsset());
      store.add(record);

      const synchronizer = new StellarAssetRegistrySynchronizer({
        sources: [source('config', [makeAsset()])],
        store,
      });

      const report = await synchronizer.sync();

      expect(report.unchanged).toEqual([record.id]);
      expect(report.added).toEqual([]);
      expect(report.updated).toEqual([]);
      expect(report.removed).toEqual([]);
    });

    it('handles a mix of additions, updates and removals in one run', async () => {
      const store = new InMemoryAssetRegistry();
      const keep = validateStellarAssetMetadata(makeAsset({ code: 'KEEP' }));
      const gone = validateStellarAssetMetadata(makeAsset({ code: 'GONE' }));
      const change = validateStellarAssetMetadata(
        makeAsset({ code: 'CHG', name: 'Before' }),
      );
      store.add(keep);
      store.add(gone);
      store.add(change);

      const synchronizer = new StellarAssetRegistrySynchronizer({
        sources: [
          source('config', [
            makeAsset({ code: 'KEEP' }),
            makeAsset({ code: 'CHG', name: 'After' }),
            makeAsset({ code: 'NEW' }),
          ]),
        ],
        store,
      });

      const report = await synchronizer.sync();

      expect(report.added).toEqual(['stellar:' + ISSUER + ':NEW']);
      expect(report.updated).toEqual(['stellar:' + ISSUER + ':CHG']);
      expect(report.removed).toEqual(['stellar:' + ISSUER + ':GONE']);
      expect(report.unchanged).toEqual(['stellar:' + ISSUER + ':KEEP']);
      expect(store.size).toBe(3);
    });

    it('keeps stale assets when removeMissing is false', async () => {
      const store = new InMemoryAssetRegistry();
      const stale = validateStellarAssetMetadata(makeAsset({ code: 'OLD' }));
      store.add(stale);

      const synchronizer = new StellarAssetRegistrySynchronizer({
        sources: [source('config', [])],
        store,
        removeMissing: false,
      });

      const report = await synchronizer.sync();

      expect(report.removed).toEqual([]);
      expect(store.has(stale.id)).toBe(true);
    });

    it('returns a report with source names and a valid timestamp', async () => {
      const synchronizer = new StellarAssetRegistrySynchronizer({
        sources: [source('primary', []), source('backup', [])],
        store: new InMemoryAssetRegistry(),
      });

      const report = await synchronizer.sync();

      expect(report.sources).toEqual(['primary', 'backup']);
      expect(Number.isNaN(Date.parse(report.syncedAt))).toBe(false);
    });

    it('is idempotent across repeated runs', async () => {
      const store = new InMemoryAssetRegistry();
      const synchronizer = new StellarAssetRegistrySynchronizer({
        sources: [source('config', [makeAsset()])],
        store,
      });

      await synchronizer.sync();
      const second = await synchronizer.sync();

      expect(second.added).toEqual([]);
      expect(second.removed).toEqual([]);
      expect(second.updated).toEqual([]);
      expect(second.unchanged).toHaveLength(1);
      expect(store.size).toBe(1);
    });
  });

  // ─── Validation ────────────────────────────────────────────────────────

  describe('asset metadata validation', () => {
    it('rejects an invalid issuer', async () => {
      const store = new InMemoryAssetRegistry();
      const synchronizer = new StellarAssetRegistrySynchronizer({
        sources: [
          source('config', [makeAsset({ issuer: 'G' + '0'.repeat(55) })]),
        ],
        store,
      });

      const report = await synchronizer.sync();

      expect(report.rejected).toHaveLength(1);
      expect(report.rejected[0].issues.join(' ')).toMatch(
        /valid Stellar account id/,
      );
      expect(store.size).toBe(0);
    });

    it('rejects a non-native asset without an issuer or contract', async () => {
      const synchronizer = new StellarAssetRegistrySynchronizer({
        sources: [
          source('config', [
            { code: 'FAKE', name: 'Fake Coin' } as StellarAssetMetadataInput,
          ]),
        ],
        store: new InMemoryAssetRegistry(),
      });

      const report = await synchronizer.sync();

      expect(report.rejected[0].issues.join(' ')).toMatch(
        /must declare an issuer or contractId/,
      );
    });

    it('rejects an invalid Soroban contract id', async () => {
      const synchronizer = new StellarAssetRegistrySynchronizer({
        sources: [
          source('config', [
            makeAsset({ issuer: undefined, contractId: 'C123' }),
          ]),
        ],
        store: new InMemoryAssetRegistry(),
      });

      const report = await synchronizer.sync();
      expect(report.rejected[0].issues.join(' ')).toMatch(
        /valid Soroban contract id/,
      );
    });

    it('rejects invalid codes, names and decimals', async () => {
      const synchronizer = new StellarAssetRegistrySynchronizer({
        sources: [
          source('config', [
            makeAsset({ code: 'bad code!' }),
            makeAsset({ name: '   ' }),
            makeAsset({ decimals: 1.5 }),
          ]),
        ],
        store: new InMemoryAssetRegistry(),
      });

      const report = await synchronizer.sync();

      expect(report.rejected).toHaveLength(3);
      expect(report.rejected[0].issues.join(' ')).toMatch(
        /uppercase alphanumeric/,
      );
      expect(report.rejected[1].issues.join(' ')).toMatch(
        /name must be a non-empty/,
      );
      expect(report.rejected[2].issues.join(' ')).toMatch(
        /decimals must be an integer/,
      );
    });

    it('accepts native XLM without an issuer', async () => {
      const store = new InMemoryAssetRegistry();
      const synchronizer = new StellarAssetRegistrySynchronizer({
        sources: [source('config', [{ code: 'XLM', name: 'Stellar Lumens' }])],
        store,
      });

      const report = await synchronizer.sync();

      expect(report.rejected).toEqual([]);
      expect(report.added).toHaveLength(1);
      const [xlm] = store.getAll();
      expect(xlm.issuer).toBeUndefined();
      expect(xlm.code).toBe('XLM');
      expect(xlm.id).toBe('stellar:native:XLM');
    });

    it('rejects a native asset that declares an issuer', async () => {
      const synchronizer = new StellarAssetRegistrySynchronizer({
        sources: [
          source('config', [{ code: 'XLM', name: 'Lumens', issuer: ISSUER }]),
        ],
        store: new InMemoryAssetRegistry(),
      });

      const report = await synchronizer.sync();
      expect(report.rejected[0].issues.join(' ')).toMatch(
        /native asset must not declare an issuer/,
      );
    });

    it('accepts a Soroban asset identified by contract id', async () => {
      const store = new InMemoryAssetRegistry();
      const synchronizer = new StellarAssetRegistrySynchronizer({
        sources: [
          source('config', [
            makeAsset({
              code: 'AQUA',
              issuer: undefined,
              contractId: CONTRACT,
            }),
          ]),
        ],
        store,
      });

      const report = await synchronizer.sync();

      expect(report.rejected).toEqual([]);
      expect(store.getAll()[0].contractId).toBe(CONTRACT);
    });

    it('validates issuer and contract helpers directly', () => {
      expect(isValidStellarAccountId(ISSUER)).toBe(true);
      expect(isValidStellarAccountId(OTHER_ISSUER)).toBe(true);
      expect(isValidStellarAccountId('native')).toBe(false);
      expect(isValidStellarAccountId('Gshort')).toBe(false);
      expect(isValidSorobanContractId(CONTRACT)).toBe(true);
      expect(isValidSorobanContractId(ISSUER)).toBe(false);
    });

    it('normalizes code casing and id derivation', () => {
      const record = validateStellarAssetMetadata(makeAsset({ code: 'eurc' }));
      expect(record.code).toBe('EURC');
      expect(record.id).toBe(`stellar:${ISSUER}:EURC`);
      expect(record.decimals).toBe(7);
    });
  });

  // ─── Source failures ───────────────────────────────────────────────────

  describe('source failures', () => {
    it('throws when a source fails by default', async () => {
      const synchronizer = new StellarAssetRegistrySynchronizer({
        sources: [failingSource('remote')],
        store: new InMemoryAssetRegistry(),
      });

      await expect(synchronizer.sync()).rejects.toBeInstanceOf(
        StellarAssetSyncError,
      );
    });

    it('continues and records the error when configured to', async () => {
      const store = new InMemoryAssetRegistry();
      const stale = validateStellarAssetMetadata(makeAsset({ code: 'OLD' }));
      store.add(stale);

      const synchronizer = new StellarAssetRegistrySynchronizer({
        sources: [
          failingSource('remote', 'timeout'),
          source('config', [makeAsset({ code: 'USDC' })]),
        ],
        store,
        continueOnSourceError: true,
      });

      const report = await synchronizer.sync();

      expect(report.sourceErrors).toEqual([
        { source: 'remote', message: 'timeout' },
      ]);
      expect(report.added).toHaveLength(1);
      // Incomplete data must not trigger removals.
      expect(report.removed).toEqual([]);
      expect(store.has(stale.id)).toBe(true);
    });
  });
});
