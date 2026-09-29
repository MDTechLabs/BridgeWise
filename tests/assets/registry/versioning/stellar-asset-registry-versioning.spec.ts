/**
 * Stellar Asset Registry Versioning — Tests (Issue #1058)
 *
 * Covers assigning versions, recording changes, historical version lookup and
 * associating route decisions with registry versions.
 */

import {
  AssetValidationError,
  DuplicateAssetError,
  RegisterAssetInput,
  StellarAssetRegistry,
  UnknownAssetError,
} from '../../../../src/assets/registry';

const ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

const makeAsset = (
  overrides: Partial<RegisterAssetInput> = {},
): RegisterAssetInput => ({
  symbol: 'USDC',
  name: 'USD Coin',
  issuer: ISSUER,
  decimals: 7,
  tags: ['stablecoin'],
  ...overrides,
});

describe('StellarAssetRegistry versioning', () => {
  let registry: StellarAssetRegistry;

  beforeEach(() => {
    registry = new StellarAssetRegistry();
  });

  // ─── Assigning versions ────────────────────────────────────────────────

  describe('assigning registry versions', () => {
    it('starts with no versions', () => {
      expect(registry.getCurrentVersion()).toBe(0);
      expect(registry.getLatestVersion()).toBeUndefined();
      expect(registry.listVersions()).toHaveLength(0);
    });

    it('assigns version 1 when the first asset is registered', () => {
      const result = registry.registerAsset(makeAsset());

      expect(result.changed).toBe(true);
      expect(result.version?.version).toBe(1);
      expect(result.version?.id).toBe('stellar-asset-registry-v1');
      expect(result.version?.changeType).toBe('register');
      expect(result.version?.assetCount).toBe(1);
      expect(registry.getCurrentVersion()).toBe(1);
    });

    it('assigns sequential versions to each change', () => {
      registry.registerAsset(makeAsset({ symbol: 'USDC' }));
      registry.registerAsset(makeAsset({ symbol: 'EURC', name: 'Euro Coin' }));

      expect(registry.getCurrentVersion()).toBe(2);
      expect(registry.listVersions().map((v) => v.version)).toEqual([1, 2]);
    });

    it('honours a custom registry id in version ids', () => {
      const custom = new StellarAssetRegistry({ registryId: 'my-registry' });
      const result = custom.registerAsset(makeAsset());
      expect(result.version?.id).toBe('my-registry-v1');
    });
  });

  // ─── Recording changes ─────────────────────────────────────────────────

  describe('recording changes', () => {
    it('records registration details', () => {
      const result = registry.registerAsset(makeAsset());

      expect(result.change?.type).toBe('register');
      expect(result.change?.assetId).toBe(result.asset.id);
      expect(result.change?.before).toBeUndefined();
      expect(result.change?.after?.symbol).toBe('USDC');
    });

    it('records an update with the changed fields only', () => {
      const registered = registry.registerAsset(makeAsset());
      const result = registry.updateAsset(registered.asset.id, {
        name: 'USD Coin (updated)',
        decimals: 6,
        reason: 'issuer migration',
      });

      expect(result.changed).toBe(true);
      expect(result.version?.version).toBe(2);
      expect(result.change?.type).toBe('update');
      expect(result.change?.changedFields).toEqual(['name', 'decimals']);
      expect(result.change?.reason).toBe('issuer migration');
      expect(result.asset.name).toBe('USD Coin (updated)');
    });

    it('records a removal', () => {
      const registered = registry.registerAsset(makeAsset());
      const result = registry.removeAsset(registered.asset.id, 'delisted');

      expect(result.changed).toBe(true);
      expect(result.version?.version).toBe(2);
      expect(result.change?.type).toBe('remove');
      expect(registry.hasAsset(registered.asset.id)).toBe(false);
      expect(result.version?.assetCount).toBe(0);
    });

    it('does not create a version when an update changes nothing', () => {
      const registered = registry.registerAsset(makeAsset());
      const result = registry.updateAsset(registered.asset.id, {
        symbol: 'USDC',
        reason: 'no-op',
      });

      expect(result.changed).toBe(false);
      expect(result.change).toBeUndefined();
      expect(result.version?.version).toBe(1);
      expect(registry.getCurrentVersion()).toBe(1);
    });

    it('keeps a per-asset change history', () => {
      const registered = registry.registerAsset(makeAsset());
      registry.updateAsset(registered.asset.id, {
        name: 'Renamed',
        reason: 'x',
      });
      registry.registerAsset(makeAsset({ symbol: 'EURC', name: 'Euro Coin' }));

      const history = registry.getAssetHistory(registered.asset.id);
      expect(history.map((c) => c.type)).toEqual(['register', 'update']);
      expect(registry.getChangeHistory()).toHaveLength(3);
    });
  });

  // ─── Historical version lookup ─────────────────────────────────────────

  describe('version lookup', () => {
    it('retrieves a version by number', () => {
      const registered = registry.registerAsset(makeAsset());
      const version = registry.getVersion(1);

      expect(version).toBeDefined();
      expect(version?.changeId).toBe(registered.change?.id);
      expect(registry.getVersion(99)).toBeUndefined();
    });

    it('retrieves a version by change id from the store', () => {
      const registered = registry.registerAsset(makeAsset());
      const version = registry.versions.getVersionByChangeId(
        registered.change!.id,
      );
      expect(version?.version).toBe(1);
    });

    it('returns history newest first and supports a limit', () => {
      registry.registerAsset(makeAsset({ symbol: 'A' }));
      registry.registerAsset(makeAsset({ symbol: 'B' }));
      registry.registerAsset(makeAsset({ symbol: 'C' }));

      expect(registry.getVersionHistory().map((v) => v.version)).toEqual([
        3, 2, 1,
      ]);
      expect(registry.getVersionHistory(2).map((v) => v.version)).toEqual([
        3, 2,
      ]);
    });

    it('finds the version in effect at a point in time', () => {
      jest.useFakeTimers();
      try {
        jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
        registry.registerAsset(makeAsset());
        jest.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
        const second = registry.registerAsset(
          makeAsset({ symbol: 'EURC', name: 'Euro Coin' }),
        );

        expect(registry.versions.getVersionAt(new Date(0))).toBeUndefined();
        expect(
          registry.versions.getVersionAt(new Date('2026-01-01T12:00:00.000Z'))
            ?.version,
        ).toBe(1);
        expect(
          registry.versions.getVersionAt(new Date('2026-01-02T00:00:00.000Z'))
            ?.version,
        ).toBe(2);
        expect(
          registry.versions.getVersionAt(new Date('2026-01-03T00:00:00.000Z'))
            ?.version,
        ).toBe(2);
        expect(second.version?.version).toBe(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('retrieves the historical asset state at a version', () => {
      const registered = registry.registerAsset(makeAsset());
      registry.updateAsset(registered.asset.id, {
        name: 'Renamed',
        reason: 'rename',
      });

      const atV1 = registry.getAssetAtVersion(1, registered.asset.id);
      const atV2 = registry.getAssetAtVersion(2, registered.asset.id);

      expect(atV1?.name).toBe('USD Coin');
      expect(atV2?.name).toBe('Renamed');
      expect(registry.getAsset(registered.asset.id)?.name).toBe('Renamed');
    });

    it('diffs two versions', () => {
      const a = registry.registerAsset(makeAsset({ symbol: 'AAA', name: 'A' }));
      registry.registerAsset(makeAsset({ symbol: 'BBB', name: 'B' }));
      registry.updateAsset(a.asset.id, { name: 'A2', reason: 'update' });

      const diff = registry.diffVersions(1, 3);

      expect(diff.fromVersion).toBe(1);
      expect(diff.toVersion).toBe(3);
      expect(diff.addedAssetIds).toEqual([expect.stringContaining('BBB')]);
      expect(diff.updatedAssetIds).toEqual([a.asset.id]);
      expect(diff.changes.map((c) => c.type)).toEqual(['register', 'update']);
    });

    it('throws when diffing backwards', () => {
      registry.registerAsset(makeAsset());
      registry.registerAsset(makeAsset({ symbol: 'EURC', name: 'Euro Coin' }));
      expect(() => registry.diffVersions(2, 1)).toThrow(/backwards/);
    });

    it('produces a stable checksum that changes with the snapshot', () => {
      const first = registry.registerAsset(makeAsset());
      const checksum1 = first.version!.checksum;

      const untouched = new StellarAssetRegistry();
      const otherFirst = untouched.registerAsset(makeAsset());

      expect(otherFirst.version!.checksum).toBe(checksum1);

      registry.registerAsset(makeAsset({ symbol: 'EURC', name: 'Euro Coin' }));
      expect(registry.getVersion(2)!.checksum).not.toBe(checksum1);
    });
  });

  // ─── Route associations ────────────────────────────────────────────────

  describe('route decision associations', () => {
    it('links a route decision to the current registry version by default', () => {
      registry.registerAsset(makeAsset());
      registry.registerAsset(makeAsset({ symbol: 'EURC', name: 'Euro Coin' }));

      const link = registry.linkRouteDecision({ routeId: 'route-1' });

      expect(link.registryVersion).toBe(2);
      expect(link.registryVersionId).toBe('stellar-asset-registry-v2');
      expect(registry.getRegistryVersionForRoute('route-1')).toBe(2);
    });

    it('links a route decision to an explicit historical version', () => {
      registry.registerAsset(makeAsset());
      registry.registerAsset(makeAsset({ symbol: 'EURC', name: 'Euro Coin' }));

      registry.linkRouteDecision({ routeId: 'route-old' }, 1);

      expect(registry.getRegistryVersionForRoute('route-old')).toBe(1);
      expect(registry.getRoutesForVersion(1).map((l) => l.routeId)).toEqual([
        'route-old',
      ]);
    });

    it('detects when a route decision has gone stale', () => {
      const registered = registry.registerAsset(makeAsset());
      registry.linkRouteDecision({ routeId: 'route-1' }, 1);

      expect(registry.isRouteDecisionStale('route-1')).toBe(false);

      registry.updateAsset(registered.asset.id, {
        name: 'Renamed',
        reason: 'change',
      });

      expect(registry.isRouteDecisionStale('route-1')).toBe(true);
      expect(registry.getRegistryVersionForRoute('route-1')).toBe(1);
    });

    it('does not mark unknown or unlinked routes as stale', () => {
      registry.registerAsset(makeAsset());
      expect(registry.isRouteDecisionStale('missing')).toBe(false);
    });

    it('records the linking timestamp and supports unlinking', () => {
      registry.registerAsset(makeAsset());
      const link = registry.linkRouteDecision({ routeId: 'route-1' });
      expect(Number.isNaN(Date.parse(link.linkedAt))).toBe(false);

      expect(registry.routes.unlinkRoute('route-1')).toBe(true);
      expect(registry.getRegistryVersionForRoute('route-1')).toBeUndefined();
      expect(registry.routes.unlinkRoute('route-1')).toBe(false);
    });

    it('throws when linking before any version exists', () => {
      expect(() => registry.linkRouteDecision({ routeId: 'route-1' })).toThrow(
        /no registry versions/,
      );
    });

    it('throws when linking to an unknown version', () => {
      registry.registerAsset(makeAsset());
      expect(() =>
        registry.linkRouteDecision({ routeId: 'route-1' }, 42),
      ).toThrow(/does not exist/);
    });
  });

  // ─── Validation ────────────────────────────────────────────────────────

  describe('validation', () => {
    it('rejects duplicate assets', () => {
      registry.registerAsset(makeAsset());
      expect(() => registry.registerAsset(makeAsset())).toThrow(
        DuplicateAssetError,
      );
    });

    it('rejects updates to unknown assets', () => {
      expect(() =>
        registry.updateAsset('missing', { name: 'x', reason: 'x' }),
      ).toThrow(UnknownAssetError);
    });

    it('rejects removals of unknown assets', () => {
      expect(() => registry.removeAsset('missing')).toThrow(UnknownAssetError);
    });

    it('rejects invalid asset definitions', () => {
      expect(() => registry.registerAsset(makeAsset({ symbol: '  ' }))).toThrow(
        AssetValidationError,
      );
      expect(() => registry.registerAsset(makeAsset({ name: '' }))).toThrow(
        AssetValidationError,
      );
      expect(() => registry.registerAsset(makeAsset({ decimals: -1 }))).toThrow(
        AssetValidationError,
      );
      expect(() =>
        registry.registerAsset(makeAsset({ decimals: 1.5 })),
      ).toThrow(AssetValidationError);
    });
  });

  // ─── Asset lookup ──────────────────────────────────────────────────────

  describe('asset lookup', () => {
    it('derives ids from network, issuer and symbol when omitted', () => {
      const result = registry.registerAsset(makeAsset());
      expect(result.asset.id).toBe(`stellar:${ISSUER}:USDC`);
    });

    it('supports symbol and network lookups', () => {
      registry.registerAsset(makeAsset({ symbol: 'USDC' }));
      registry.registerAsset(
        makeAsset({
          symbol: 'USDC',
          name: 'USD Coin (ETH)',
          network: 'ethereum',
        }),
      );

      expect(registry.getAssetsBySymbol('usdc')).toHaveLength(2);
      expect(registry.getAssetsByNetwork('ethereum')).toHaveLength(1);
      expect(registry.size).toBe(2);
    });
  });
});
